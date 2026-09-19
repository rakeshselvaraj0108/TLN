"""Spatial and cross-border case views: reconstruction, map layers, and jurisdiction exposure.

A "case scope" is the case's pinned entities (the members an investigator added) plus everyone one
MONEY_TO hop away from them — the immediate financial network a case pulls in without deliberately
widening it.
"""
from __future__ import annotations

import ipaddress
import json
import re
from collections import defaultdict
from datetime import timedelta
from pathlib import Path

from fastapi import HTTPException

from tracex_api import db
from tracex_api.engine import correlate, graphs, scoring, views
from tracex_api.engine.dataset import Dataset, clean_num, iso, ts

SEED = Path(__file__).resolve().parents[1] / "seed_data"
RECON_CALL_WINDOW_S = 10800   # matches correlate.call_to_debit's default coupling window
RECON_FANOUT_WINDOW_S = 1800  # matches correlate.fanout's default passthrough window
NOTE = "Each step resolves to a hashed source row. The reconstruction is a reading of the record, not a conclusion about intent."


# ---- case scope --------------------------------------------------------------------------------------
def _case_row(case_id: int) -> dict:
    row = db.query_one("SELECT * FROM cases WHERE id = ?", (case_id,))
    if row is None:
        raise HTTPException(status_code=404, detail=f"no case {case_id}")
    return dict(row)


def case_scope(ds: Dataset, case_id: int) -> tuple[dict, list[str], list[str]]:
    """(case row, pinned entity ids in case order, one-hop MONEY_TO extension, sorted)."""
    case = _case_row(case_id)
    pinned = [r["entity_id"] for r in db.query("SELECT entity_id FROM case_entities WHERE case_id = ? ORDER BY rowid", (case_id,))]
    pinned_set = set(pinned)
    net = graphs.network(ds)
    extended = sorted({e["target"] if e["source"] in pinned_set else e["source"] for e in net["edges"]
                       if e["type"] == "MONEY_TO" and (e["source"] in pinned_set) != (e["target"] in pinned_set)})
    return case, pinned, extended


# ---- reconstruction -----------------------------------------------------------------------------------
def _money(v: float) -> str:
    return f"{v:,.0f}"


def reconstruct(ds: Dataset, case_id: int) -> dict:
    case, pinned, extended = case_scope(ds, case_id)
    scope = set(pinned) | set(extended)

    calls_by_id = {c.rec_id: c for c in ds.calls}
    txns_by_id = {t.rec_id: t for t in ds.txns}
    name = lambda pid: ds.persons[pid].name
    # A step's entities are the case's own actors touched by that record, in the case's canonical
    # pinned-then-extended order — not caller/callee or src/dst order, and never an out-of-scope party
    # (an innocent counterparty's account, say) dragged in just because a record happens to reference it.
    rank = {pid: i for i, pid in enumerate(pinned + extended)}

    def scoped(pids) -> list[str]:
        out = []
        for p in pids:
            if p and p in scope and p not in out:
                out.append(p)
        out.sort(key=lambda p: rank[p])
        return out

    def txn_entities(t) -> list[str]:
        return scoped((ds.by_account.get(t.dst_account), ds.by_account.get(t.src_account)))

    steps: list[dict] = []

    # controlling_call / coerced_transfer, from the call->debit correlation
    c2d = [l for l in correlate.call_to_debit(ds, window_s=RECON_CALL_WINDOW_S) if l["person"] in scope]
    # Where a call or a debit has several candidate partners, the one furthest back in time wins — the
    # call (or debit) that first set the chain in motion, not the nearest-in-time coincidence.
    best_latency: dict[str, int] = {}
    for l in c2d:
        best_latency[l["call_rec_id"]] = max(best_latency.get(l["call_rec_id"], l["latency_s"]), l["latency_s"])
    for call_id, latency in best_latency.items():
        c = calls_by_id[call_id]
        caller, callee = ds.by_phone.get(c.a_party), ds.by_phone.get(c.b_party)
        entities = scoped((caller, callee))
        callee_name = name(callee) if callee else c.b_party
        steps.append({"phase": "controlling_call", "headline": f"{callee_name} receives a call from {c.a_party}",
                     "meta": {"caller": c.a_party, "duration_sec": c.duration, "call_type": c.call_type, "couples_to_debit_in_s": latency},
                     "ts": iso(c.start), "rec_id": c.rec_id, "row_sha256": c.sha, "source": "call", "entities": entities})

    debit_best: dict[str, dict] = {}
    for l in c2d:
        prev = debit_best.get(l["debit_rec_id"])
        if prev is None or l["latency_s"] > prev["latency_s"]:
            debit_best[l["debit_rec_id"]] = l

    # funds_received / layering / cash_out, from the fanout (passthrough) correlation
    fo = [f for f in correlate.fanout(ds, window_s=RECON_FANOUT_WINDOW_S) if f["person"] in scope]
    hop_ids: set[str] = set()
    for f in fo:
        hop_ids |= set(f["outbound_rec_ids"])
        inbound = txns_by_id[f["inbound_rec_id"]]
        steps.append({"phase": "funds_received",
                     "headline": f"Rs {_money(f['inbound_amount'])} lands with {name(f['person'])}, then {round(f['passthrough_ratio'] * 100)}% moves on across {f['hop_count']} account(s)",
                     "meta": {"inbound_amount": f["inbound_amount"], "passthrough_ratio": f["passthrough_ratio"], "hop_count": f["hop_count"], "window_s": f["window_s"]},
                     "ts": iso(inbound.time), "rec_id": inbound.rec_id, "row_sha256": inbound.sha, "source": "txn", "entities": txn_entities(inbound)})
        for rec_id in f["outbound_rec_ids"]:
            t = txns_by_id[rec_id]
            if t.channel == "ATM":
                phase = "cash_out"
                headline = f"Rs {_money(t.amount)} cashed out at an ATM by {name(f['person'])}"
            else:
                phase = "layering"
                headline = f"Rs {_money(t.amount)} forwarded onward by {name(f['person'])}"
            steps.append({"phase": phase, "headline": headline,
                         "meta": {"amount": clean_num(t.amount), "channel": t.channel, "to": t.dst_account or None, "parent_passthrough_ratio": f["passthrough_ratio"]},
                         "ts": iso(t.time), "rec_id": t.rec_id, "row_sha256": t.sha, "source": "txn", "entities": txn_entities(t)})

    # any remaining call->debit coupling not already told as a fanout hop
    for rec_id, l in debit_best.items():
        if rec_id in hop_ids:
            continue
        t = txns_by_id[rec_id]
        steps.append({"phase": "coerced_transfer", "headline": f"Rs {_money(l['amount'])} leaves {name(l['person'])} — {l['latency_s'] // 60} min after the call",
                     "meta": {"amount": l["amount"], "latency_s": l["latency_s"], "narration": l["narration"], "src_account": l["src_account"], "dst_account": l["dst_account"]},
                     "ts": iso(t.time), "rec_id": t.rec_id, "row_sha256": t.sha, "source": "txn", "entities": txn_entities(t)})

    # Same-timestamp ties resolve by the case's own actor ranking (the step's highest-ranked — i.e.
    # first-listed — entity), not by record id: several accounts settling in the same minute read in
    # case order, not in whatever order their record ids happen to sort.
    steps.sort(key=lambda s: (s["ts"], rank.get(s["entities"][0], len(rank)) if s["entities"] else len(rank), s["rec_id"]))
    for i, s in enumerate(steps):
        s["gap_to_next_s"] = int((ts(steps[i + 1]["ts"]) - ts(s["ts"])).total_seconds()) if i + 1 < len(steps) else None

    focus = _busiest_window(steps)
    device_signals = [{"imei": d["imei"], "sim_count": d["sim_count"], "numbers": d["numbers"], "entities": d["persons"]}
                      for d in correlate.imei_persistence(ds) if scope & set(d["persons"])]

    return {
        "case_id": case["id"], "case_code": case["case_code"], "title": case["title"],
        "entities": [{"entity_id": pid, "name": name(pid), "pinned": True} for pid in pinned]
                   + [{"entity_id": pid, "name": name(pid), "pinned": False} for pid in extended],
        "steps": steps, "step_count": len(steps), "focus": focus,
        "device_signals": device_signals,
        "window": {"start": steps[0]["ts"], "end": steps[-1]["ts"]} if steps else {"start": None, "end": None},
        "engine": "local", "note": NOTE,
    }


def _busiest_window(steps: list[dict], span_minutes: int = 30) -> dict:
    """The span_minutes-wide window containing the most steps — the reconstruction's narrative peak."""
    if not steps:
        return {"start": None, "end": None, "step_count": 0, "amount_inr": 0}
    times = [ts(s["ts"]) for s in steps]
    best = (0, 0)
    j = 0
    for i in range(len(steps)):
        while times[i] - times[j] > timedelta(minutes=span_minutes):
            j += 1
        if i - j + 1 > best[1] - best[0] + 1:
            best = (j, i)
    lo, hi = best
    amount = sum((s["meta"].get("amount") or s["meta"].get("inbound_amount") or 0) for s in steps[lo:hi + 1])
    return {"start": steps[lo]["ts"], "end": steps[hi]["ts"], "step_count": hi - lo + 1, "amount_inr": clean_num(amount)}


# ---- map layers ----------------------------------------------------------------------------------------
def _positions(ds: Dataset, pids: list[str], at: str | None) -> dict[str, dict | None]:
    out = {}
    for pid in pids:
        m = views.movement(ds, pid, end=at)
        out[pid] = m["sites"][0] if m["sites"] else None
    return out


def _actor_ref(ds: Dataset, pid: str, pos: dict | None) -> dict:
    p = ds.persons[pid]
    return {"entity_id": pid, "name": p.name, "lat": pos["lat"] if pos else None, "lon": pos["lon"] if pos else None,
            "cell_key": pos["cell_key"] if pos else None}


def layers(ds: Dataset, case_id: int, at: str | None) -> dict:
    case, pinned, extended = case_scope(ds, case_id)
    scope = pinned + extended
    scope_set = set(scope)
    pos = _positions(ds, scope, at)
    scores = scoring.scores(ds)

    ip_people = defaultdict(set)
    for s in ds.sessions:
        p = ds.by_phone.get(s.msisdn)
        if p:
            ip_people[s.public_ip].add(p)

    actors = []
    for pid in scope:
        p = pos.get(pid)
        m = views.movement(ds, pid, end=at)
        shared_ips = sorted(ip for ip, people in ip_people.items() if pid in people and len(people & scope_set) > 1)
        s = scores.get(pid, {})
        actors.append({"entity_id": pid, "name": ds.persons[pid].name, "pinned": pid in pinned, "lat": p["lat"] if p else None,
                       "lon": p["lon"] if p else None, "cell_key": p["cell_key"] if p else None, "observations": m["observation_count"],
                       "msisdns": ds.persons[pid].phones, "accounts": ds.persons[pid].accounts, "imeis": ds.persons[pid].devices,
                       "shared_ips": shared_ips, "risk_score": s.get("risk_score"), "band": s.get("band")})

    # Undirected: two people's traffic is one arc on the map regardless of who placed which call.
    pairs: dict[tuple[str, str], dict] = {}
    for c in ds.calls:
        a, b = ds.by_phone.get(c.a_party), ds.by_phone.get(c.b_party)
        if not (a and b and a != b and a in scope_set and b in scope_set):
            continue
        key = tuple(sorted((a, b)))
        p = pairs.setdefault(key, {"calls": 0, "seconds": 0, "last_ts": c.start, "rec_ids": [], "first": (a, c.start)})
        p["calls"] += 1
        p["seconds"] += c.duration
        p["last_ts"] = max(p["last_ts"], c.start)
        p["rec_ids"].append(c.rec_id)
        if c.start < p["first"][1]:
            p["first"] = (a, c.start)
    call_edges = []
    for (a, b), p in pairs.items():
        src = p["first"][0]
        dst = b if src == a else a
        # Each physical call is counted from both ends of the pair — confirmed against every captured
        # edge (calls and seconds are always exactly double the single-direction sum). Provenance is
        # capped at 8 sample records; which 8 the original picked isn't recoverable (looks set-ordered,
        # not sorted or chronological), so this takes the earliest 8 instead.
        call_edges.append({"from": _actor_ref(ds, src, pos.get(src)), "to": _actor_ref(ds, dst, pos.get(dst)), "calls": p["calls"] * 2,
                          "seconds": p["seconds"] * 2, "last_ts": iso(p["last_ts"]),
                          "provenance": [{"rec_id": r, "source": "cdr"} for r in sorted(p["rec_ids"])[:8]]})
    call_edges.sort(key=lambda e: -e["calls"])

    money_arcs = []
    for t in ds.txns:
        a, b = ds.by_account.get(t.dst_account), ds.by_account.get(t.src_account)
        if a in scope_set and b in scope_set and a != b:
            if at and iso(t.time) > at:
                continue
            money_arcs.append({"from": _actor_ref(ds, a, pos.get(a)), "to": _actor_ref(ds, b, pos.get(b)), "amount": clean_num(t.amount),
                              "ts": iso(t.time), "provenance": [{"rec_id": t.rec_id, "source": "bank"}]})
    money_arcs.sort(key=lambda a: a["ts"])

    contra = [c for c in views.contradictions(ds)["impossible_travel"] if c["entity_id"] in scope_set]

    full_towers = views.towers(ds)
    towers = [{"cell_key": t["cell_key"], "lat": t["lat"], "lon": t["lon"], "call_count": t["call_count"], "distinct_phones": t["distinct_phones"]}
             for t in full_towers]
    bbox = ({"min_lat": min(t["lat"] for t in towers), "max_lat": max(t["lat"] for t in towers),
            "min_lon": min(t["lon"] for t in towers), "max_lon": max(t["lon"] for t in towers)} if towers else None)

    return {"case_id": case["id"], "case_code": case["case_code"], "at": at, "bbox": bbox, "towers": towers, "actors": actors,
           "call_edges": call_edges, "money_arcs": money_arcs, "contradictions": contra, "engine": "local"}


# ---- cross-border --------------------------------------------------------------------------------------
_IP_SEED: dict[str, str | None] = json.loads((SEED / "catalog" / "ip_allocations.json").read_text(encoding="utf-8"))
_CGNAT = ipaddress.ip_network("100.64.0.0/10")
# Best-effort public delegations, used only for an address this corpus's seeded table has not already classified.
_IN_BLOCKS = [ipaddress.ip_network(c, strict=False) for c in (
    "49.14.0.0/15", "49.32.0.0/12", "49.149.0.0/16", "103.0.0.0/11", "106.51.0.0/16", "106.66.0.0/15",
    "117.192.0.0/10", "122.160.0.0/11", "125.16.0.0/12", "157.32.0.0/11", "182.64.0.0/10", "223.176.0.0/11",
)]
IFSC = re.compile(r"^[A-Z]{4}0[A-Z0-9]{6}$")
CROSS_BORDER_NOTE = ("Cross-border exposure changes the route, not the verdict. A foreign leg means MLAT through the nodal agency rather than a "
                     "local summons; it is not itself evidence of an offence. Roaming subscribers, VPNs and legitimate correspondent accounts all produce these signals.")
CROSS_BORDER_CHECKS = {"msisdn": "E.164 country code, +91 treated as domestic", "ip": "APNIC delegated allocations for IN; private and CGNAT ranges undecidable",
                       "account": "Indian IFSC pattern vs SWIFT/BIC shape"}


def _ip_country(ip: str) -> str | None:
    """'IN', 'foreign', or None for a private/CGNAT address the check does not apply to."""
    if ip in _IP_SEED:
        return _IP_SEED[ip]
    try:
        addr = ipaddress.ip_address(ip)
    except ValueError:
        return None
    if addr.is_private or addr in _CGNAT:
        return None
    return "IN" if any(addr in b for b in _IN_BLOCKS) else "foreign"


def cross_border(ds: Dataset, case_id: int) -> dict:
    case, pinned, extended = case_scope(ds, case_id)
    scope = set(pinned) | set(extended)

    foreign_ip = []
    for s in ds.sessions:
        p = ds.by_phone.get(s.msisdn)
        if p not in scope or _ip_country(s.public_ip) != "foreign":
            continue
        foreign_ip.append({"entity_id": p, "name": ds.persons[p].name, "ip": s.public_ip, "ts": iso(s.start), "rec_id": s.rec_id,
                          "row_sha256": s.sha, "detail": f"{s.public_ip} is outside every Indian IPv4 allocation. That is where the session entered "
                          "the network, not necessarily where the person was — a VPN or a roaming handset reads the same way."})
    foreign_ip.sort(key=lambda x: (x["entity_id"], x["ts"]))

    foreign_msisdn = []
    for pid in sorted(scope):
        for m in ds.persons[pid].phones:
            if not m.startswith("+91"):
                foreign_msisdn.append({"entity_id": pid, "name": ds.persons[pid].name, "msisdn": m,
                                       "detail": f"{m} carries a country code other than +91."})

    foreign_account = []
    for pid in sorted(scope):
        for a in ds.persons[pid].accounts:
            ifsc = ds.account_ifsc.get(a)
            if ifsc and not IFSC.match(ifsc):
                foreign_account.append({"entity_id": pid, "name": ds.persons[pid].name, "account": a, "ifsc": ifsc,
                                        "detail": f"{ifsc} does not match the Indian IFSC pattern."})

    total = len(foreign_ip) + len(foreign_msisdn) + len(foreign_account)
    return {"case_id": case["id"], "case_code": case["case_code"], "foreign_msisdn": foreign_msisdn, "foreign_ip": foreign_ip,
           "foreign_account": foreign_account, "total": total, "engine": "local", "checks": CROSS_BORDER_CHECKS, "note": CROSS_BORDER_NOTE}


# ---- ask -------------------------------------------------------------------------------------------------
REFUSAL = "I can't answer that from the spatial record I hold. Ask about a case's reconstruction, its map layers, or its cross-border exposure."


def ask(ds: Dataset, question: str, case_id: int | None) -> dict:
    q = question.lower()
    if case_id is None:
        return {"question": question, "answer": "I need a case_id to answer a spatial question.", "basis": "none", "citations": []}
    case, pinned, extended = case_scope(ds, case_id)
    scope = set(pinned) | set(extended)
    if "foreign" in q or "cross-border" in q or "cross border" in q or "jurisdiction" in q:
        r = cross_border(ds, case_id)
        answer = (f"{r['total']} cross-border signal(s) in {case['case_code']}: {len(r['foreign_ip'])} foreign IP session(s), "
                 f"{len(r['foreign_msisdn'])} foreign MSISDN(s), {len(r['foreign_account'])} non-Indian account pattern(s).")
        return {"question": question, "answer": answer, "basis": "computed", "citations": [x["rec_id"] for x in r["foreign_ip"][:10]]}
    if "tower" in q or "cell" in q:
        towers = views.towers(ds)[:1]
        answer = (f"The busiest cell site is {towers[0]['cell_key']} with {towers[0]['call_count']} call(s) from "
                 f"{towers[0]['distinct_phones']} distinct phone(s)." if towers else "No cell traffic is on record.")
        return {"question": question, "answer": answer, "basis": "system", "citations": []}
    for pid in scope:
        if ds.persons[pid].name.lower() in q or pid.lower() in q:
            m = views.movement(ds, pid)
            if not m["sites"]:
                return {"question": question, "answer": f"{ds.persons[pid].name} has no geo-tagged activity on record.", "basis": "system", "citations": []}
            site = m["sites"][0]
            answer = (f"{ds.persons[pid].name}'s most-visited cell site is {site['cell_key']} ({site['weight']} of "
                     f"{m['observation_count']} observation(s)), last seen {site['last_seen']}.")
            return {"question": question, "answer": answer, "basis": "computed", "citations": [p["rec_id"] for p in m["points"][:5]]}
    return {"question": question, "answer": REFUSAL, "basis": "none", "citations": []}
