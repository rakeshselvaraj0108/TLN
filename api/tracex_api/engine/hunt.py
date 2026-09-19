"""Campaign hunt: find entities operating together, and write the investigation report.

Campaigns are ranked by the evidence binding members together, not by member risk scores — ranking
by score would re-surface the top of the queue and miss the ring.
"""
from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timezone
from itertools import combinations

from tracex_api.engine import scoring
from tracex_api.engine.dataset import Dataset, clean_num

THRESHOLDS = {"min_members": 3, "min_confidence": 0, "dna_link": 0.82, "sync_window_min": 30, "ongoing_relationship_days": 4}
NOTE = ("A campaign is a lead, not a determination. Ranking reflects the evidence binding the members together, and a standing payment "
        "relationship is downgraded because routine commerce generates more transfers than fraud.")
KIND_ORDER = {"synchronised": 0, "funds": 1, "ip": 2}
SUMMARY_KIND_ORDER = {"funds": 0, "synchronised": 1, "ip": 2}
CONFIDENCE_RANK = {"confirmed": 0, "probable": 1, "possible": 2}
TYPOLOGY_LABEL = {
    "mule_network": "Money-mule network", "sim_farm": "Synthetic identity / SIM farm", "coordinated": "Coordinated campaign",
    "shared_infrastructure": "Shared-infrastructure ring", "unclassified": "Unclassified association",
}


def _pair(a: str, b: str) -> tuple[str, str]:
    return (a, b) if a < b else (b, a)


def links(ds: Dataset) -> list[dict]:
    def build():
        out = []
        # synchronised cash-outs: two people withdrawing cash within the window
        cashouts = [(ds.by_account[t.src_account], t) for t in ds.txns
                    if t.direction == "DEBIT" and t.channel == "ATM" and t.src_account in ds.by_account]
        for (pa, ta), (pb, tb) in combinations(cashouts, 2):
            if pa == pb:
                continue
            minutes = abs((ta.time - tb.time).total_seconds()) / 60
            if minutes > THRESHOLDS["sync_window_min"]:
                continue
            first, second = sorted([(pa, ta), (pb, tb)], key=lambda x: x[1].time)
            a, b = _pair(pa, pb)
            out.append({"a": a, "b": b, "kind": "synchronised", "strength": round(1 - 0.015 * minutes, 3),
                        "detail": f"both acted within {round(minutes)} min (ATM cash-out at {first[1].time:%H:%M}, ATM cash-out at {second[1].time:%H:%M})",
                        "evidence": [first[1].rec_id, second[1].rec_id]})
        # funds: transfers between two people's accounts (both legs are evidence)
        flows = defaultdict(list)
        for t in ds.txns:
            a, b = ds.by_account.get(t.src_account), ds.by_account.get(t.dst_account)
            if a and b and a != b:
                flows[_pair(a, b)].append(t)
        for (a, b), txns in flows.items():
            txns.sort(key=lambda t: t.rec_id)
            total = sum(t.amount for t in txns)
            days = len({t.time.date() for t in txns})
            if days >= THRESHOLDS["ongoing_relationship_days"]:
                strength = 0.35
                detail = f"{len(txns)} transfers totalling {total:,.0f} across {days} days — a standing payment relationship, weak evidence of a ring"
            else:
                strength = 0.85 if days == 1 else 0.7
                detail = f"{len(txns)} transfer(s) totalling {total:,.0f} concentrated in {days} day(s)"
            out.append({"a": a, "b": b, "kind": "funds", "strength": strength, "detail": detail, "evidence": [t.rec_id for t in txns][:8],
                        "_amount": total, "_first": txns[0].rec_id})
        # shared infrastructure: the more people behind one IP, the less each pairing means
        ip_people = defaultdict(set)
        for s in ds.sessions:
            p = ds.by_phone.get(s.msisdn)
            if p:
                ip_people[s.public_ip].add(p)
        for ip, people in ip_people.items():
            if len(people) < 2:
                continue
            for a, b in combinations(sorted(people), 2):
                out.append({"a": a, "b": b, "kind": "ip", "strength": round(1 / (len(people) - 1), 3),
                            "detail": f"share ip {ip} ({len(people)} entities on it)", "evidence": [ip]})
        out.sort(key=lambda l: (KIND_ORDER[l["kind"]], -l["strength"], l.get("_first", ""), l["a"], l["b"]))
        return out
    return ds.memo("hunt_links", build)


def _public(link: dict) -> dict:
    return {k: v for k, v in link.items() if not k.startswith("_")}


def sweep(ds: Dataset, min_members: int = 3, min_confidence: float = 0) -> dict:
    all_links = links(ds)
    parent: dict[str, str] = {}

    def find(x):
        parent.setdefault(x, x)
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    for l in all_links:
        parent[find(l["a"])] = find(l["b"])
    groups = defaultdict(set)
    for l in all_links:
        groups[find(l["a"])] |= {l["a"], l["b"]}

    campaigns = []
    for members in groups.values():
        if len(members) < min_members:
            continue
        members = sorted(members)
        clinks = [l for l in all_links if l["a"] in members]
        best: dict[tuple[str, str], float] = {}
        for l in clinks:
            key = (l["a"], l["b"])
            best[key] = max(best.get(key, 0), l["strength"])
        possible = len(members) * (len(members) - 1) / 2
        cohesion = round(len(best) / possible, 4)
        standing = sum(1 for l in clinks if l["kind"] == "funds" and l["strength"] <= 0.35)
        confidence = sum(best.values()) / len(best)
        if standing > len(clinks) / 2:  # routine commerce binds people too; don't mistake it for a ring
            confidence *= 0.7
        confidence = round(confidence, 4)
        if confidence < min_confidence:
            continue
        kinds: dict[str, int] = defaultdict(int)
        for l in clinks:
            kinds[l["kind"]] += 1
        exposure = round(sum(l["_amount"] for l in clinks if l["kind"] == "funds"), 2)
        dominant = max(kinds.values())
        if kinds.get("funds", 0) >= dominant:
            typology = "mule_network"
        elif kinds.get("synchronised", 0) >= dominant:
            typology = "coordinated"
        elif kinds.get("ip", 0):
            typology = "shared_infrastructure"
        else:
            typology = "unclassified"
        victims = {p for p in members if ds.persons[p].role == "victim"}
        anchor = next((p for p in members if p not in victims), members[0])
        joined = ", ".join(f"{kinds[k]} {k}" for k in sorted(kinds, key=lambda k: SUMMARY_KIND_ORDER.get(k, 9)))
        campaigns.append({
            "campaign_id": f"OP-{anchor}", "members": members, "links": [_public(l) for l in clinks], "link_kinds": dict(sorted(kinds.items())),
            "cohesion": cohesion, "confidence": confidence, "exposure_inr": exposure, "first_activity": None, "last_activity": None,
            "typology": typology,
            "summary": f"{TYPOLOGY_LABEL[typology]}: {len(members)} entities joined by {joined} link(s). Cohesion {round(cohesion * 100)}%, "
                       f"confidence {round(confidence * 100)}%, exposure ₹{round(exposure):,}.",
        })
    campaigns.sort(key=lambda c: -c["confidence"])
    by_typology: dict[str, int] = defaultdict(int)
    for c in campaigns:
        by_typology[c["typology"]] += 1
    return {
        "campaigns": campaigns,
        "portfolio": {
            "campaigns": len(campaigns), "entities_implicated": len({m for c in campaigns for m in c["members"]}),
            "total_exposure_inr": round(sum(c["exposure_inr"] for c in campaigns), 2), "by_typology": dict(by_typology),
            "largest": max(campaigns, key=lambda c: c["exposure_inr"])["campaign_id"] if campaigns else None,
        },
        "links_examined": len(all_links), "engine": "local",
        "thresholds": {**THRESHOLDS, "min_members": min_members, "min_confidence": min_confidence}, "note": NOTE,
    }


# ---- report ----------------------------------------------------------------------------------------
RECOVERY_BANDS = [("immediate", 1, 0.85), ("same_day", 24, 0.45), ("next_day", 72, 0.15), ("cold", None, 0.02)]
LOSS_BASIS = ("Per-event estimate: each debit is placed in a recovery band by how long ago it settled, and the band's assumed recovery share is "
              "applied. Funds already withdrawn as cash are counted as unrecoverable.")
CAVEAT_BASE = [
    "Every finding here is a lead for human review. Nothing in this report is a determination of guilt.",
    "Risk scores rank the review queue; they are not evidence and are not presented as such.",
]


def loss_estimate(ds: Dataset, entity_id: str, now: datetime) -> dict:
    accounts = set(ds.persons[entity_id].accounts)
    per_event = []
    for t in sorted(ds.txns, key=lambda t: (t.time, t.rec_id)):
        if t.direction != "DEBIT" or t.src_account not in accounts:
            continue
        if t.channel == "ATM":
            per_event.append({"rec_id": t.rec_id, "amount": clean_num(t.amount), "band": "cashed_out", "recoverable": 0,
                              "reason": "withdrawn as cash — not recoverable by account action"})
            continue
        hours = (now - t.time.replace(tzinfo=timezone.utc)).total_seconds() / 3600
        for band, limit, share in RECOVERY_BANDS:
            if limit is None or hours <= limit:
                break
        per_event.append({"rec_id": t.rec_id, "amount": clean_num(t.amount), "band": band, "hours_elapsed": round(hours, 1),
                          "recoverable": clean_num(round(t.amount * share, 2)), "reason": f"{round(share * 100)}% recovery assumed for the {band} band"})
    at_risk = round(sum(e["amount"] for e in per_event), 2)
    recoverable = round(sum(e["recoverable"] for e in per_event), 2)
    return {
        "at_risk_inr": at_risk, "recoverable_inr": recoverable, "already_lost_inr": round(at_risk - recoverable, 2), "basis": LOSS_BASIS,
        "assumptions": [f"{b}: {round(s * 100)}% recoverable within {l}h" if l else f"{b}: {round(s * 100)}% recoverable thereafter" for b, l, s in RECOVERY_BANDS]
                       + ["Assumes a freeze request is actioned promptly by the receiving bank.", "An estimate for prioritisation, not a forecast of actual recovery."],
        "per_event": per_event,
    }


def report(ds: Dataset, entity_id: str, user: str, investigation: dict | None) -> dict:
    now = datetime.now(timezone.utc).replace(microsecond=0)
    score = scoring.scores(ds)[entity_id]
    findings = []
    for c in sweep(ds)["campaigns"]:
        if entity_id not in c["members"]:
            continue
        others = [m for m in c["members"] if m != entity_id]
        mine = [l for l in c["links"] if entity_id in (l["a"], l["b"])]
        findings.append({
            "title": f"Associated with operation {c['campaign_id']}",
            "detail": f"{c['summary']} Linked to {len(others)} other entities: {', '.join(others)}",
            "confidence": "probable" if c["confidence"] >= 0.5 else "possible",
            "evidence_rows": [r for l in mine for r in l["evidence"][:3]], "sources": sorted({l["kind"] for l in mine}),
            "entities": c["members"], "occurred_at": None,
        })
        seen = set()
        for l in sorted(mine, key=lambda l: (-l["strength"], KIND_ORDER[l["kind"]])):
            other = l["b"] if l["a"] == entity_id else l["a"]
            if (other, l["kind"]) in seen or len(seen) >= 6:
                continue
            seen.add((other, l["kind"]))
            findings.append({
                "title": f"Linked to {other} by {l['kind']}", "detail": l["detail"],
                "confidence": "probable" if l["strength"] >= 0.5 else "possible", "evidence_rows": l["evidence"][:5],
                "sources": [l["kind"]], "entities": [entity_id, other], "occurred_at": None,
            })
    lead = findings[0]["title"] if findings else None
    findings.sort(key=lambda f: CONFIDENCE_RANK[f["confidence"]])

    timeline = []
    accounts = set(ds.persons[entity_id].accounts)
    for t in ds.txns:
        if t.direction == "DEBIT" and t.src_account in accounts:
            timeline.append({"ts": t.time.isoformat(), "kind": "txn", "detail": f"{t.channel} debit {t.amount:,.0f} — {t.narration}"})
    recommendations = []
    hypothesis = None
    if investigation:
        hypothesis = investigation.get("hypothesis")
        for s in investigation.get("steps", []):
            timeline.append({"ts": s["ts"], "kind": s["phase"], "detail": s["message"]})
        for p in investigation.get("proposals", []):
            recommendations.append({
                "action": p["title"], "rationale": p["rank_reason"], "urgency": "immediate" if p["urgency"] >= 0.3 else "routine",
                "approval_required": p["approval"], "reversible": p["reversibility"] == "reversible", "expected_benefit": p["expected_benefit"],
            })

    loss = loss_estimate(ds, entity_id, now)
    exculpatory = []
    if score["band"] == "low":
        exculpatory.append({"detail": f"The model places {entity_id} in the low band ({score['risk_score']:.2f}); the findings below run against that."})
    caveats = list(CAVEAT_BASE)
    if findings:
        if not any(f["confidence"] == "confirmed" for f in findings):
            caveats.append("No finding reached 'confirmed'. The case rests on probable and possible inferences, and should be treated accordingly.")
        if loss["at_risk_inr"] > 0:
            caveats.append("The recoverable figure is an estimate from stated assumptions, not a commitment that those funds will be returned.")
        if not exculpatory:
            caveats.append("No exculpatory material was identified. That is not the same as none existing — it means none was surfaced by the checks that ran.")
        summary = (f"{len(findings)} finding(s) across 1 entities. Lead finding: {lead}. ₹{round(loss['at_risk_inr']):,} at risk, "
                   f"₹{round(loss['recoverable_inr']):,} assessed as still recoverable. {len(recommendations)} recommendation(s) for review.")
    else:
        if loss["at_risk_inr"] > 0:
            caveats.append("The recoverable figure is an estimate from stated assumptions, not a commitment that those funds will be returned.")
        summary = "No findings were established from the available evidence."
    title = f"{hypothesis.replace('_', ' ').capitalize()} — {entity_id}" if hypothesis else f"Investigation report — {entity_id}"
    return {
        "case_ref": f"AGENT-{entity_id}", "title": title, "generated_at": now.isoformat(), "generated_by": user, "summary": summary,
        "findings": findings, "timeline": sorted(timeline, key=lambda e: e["ts"]),
        "entities": [{"entity_id": entity_id, "risk_score": score["risk_score"], "band": score["band"], "hypothesis": hypothesis}],
        "recommendations": recommendations, "loss_prevented": loss, "exculpatory": exculpatory, "caveats": caveats,
    }


def report_text(r: dict) -> str:
    bar = "=" * 78
    rule = "-" * 78
    loss = r["loss_prevented"]
    out = [bar, f"INVESTIGATION REPORT — {r['case_ref']}", r["title"], bar, "", f"Generated : {r['generated_at']}", f"By        : {r['generated_by']}", "",
           "SUMMARY", rule, r["summary"], ""]
    if r["findings"]:
        out += ["FINANCIAL EXPOSURE", rule,
                f"  At risk               ₹{loss['at_risk_inr']:>14,.2f}", f"  Assessed recoverable  ₹{loss['recoverable_inr']:>14,.2f}",
                f"  Already lost          ₹{loss['already_lost_inr']:>14,.2f}", "", f"  Basis: {loss['basis']}", "", "  Per event:"]
        for e in loss["per_event"]:
            out.append(f"    {e['rec_id']:<12} ₹{e['amount']:>12,.2f}  {e['band']:<11} recoverable ₹{e['recoverable']:>12,.2f}")
        out += ["", "FINDINGS", rule]
        for i, f in enumerate(r["findings"], start=1):
            rows = ", ".join(f["evidence_rows"][:6]) + (f" (+{len(f['evidence_rows']) - 6} more)" if len(f["evidence_rows"]) > 6 else "")
            out += [f"  {i}. [{f['confidence'].upper()}] {f['title']}", f"     {f['detail']}", f"     Entities: {', '.join(f['entities'])}",
                    f"     Sources : {', '.join(f['sources'])}", f"     Rows    : {rows}", ""]
    if r["exculpatory"]:
        out += ["EXCULPATORY", rule] + [f"  - {e['detail']}" for e in r["exculpatory"]] + [""]
    if r["timeline"]:
        out += ["TIMELINE", rule]
        for e in r["timeline"]:
            out.append(f"  {e['ts'][:19].replace('T', ' ')}  {e['kind']:<10} {e['detail']}")
        out.append("")
    if r["recommendations"]:
        out += ["RECOMMENDATIONS", rule]
        for i, rec in enumerate(r["recommendations"], start=1):
            out += [f"  {i}. [{rec['urgency'].upper()}] {rec['action']}", f"     Why      : {rec['rationale']}", f"     Benefit  : {rec['expected_benefit']}",
                    f"     Approval : {rec['approval_required']}   Reversible: {'yes' if rec['reversible'] else 'NO'}", ""]
    out += ["CAVEATS", rule] + [f"  - {c}" for c in r["caveats"]] + ["", bar, "END OF REPORT", bar]
    return "\n".join(out)
