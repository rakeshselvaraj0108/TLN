"""Ask the record: deterministic question answering over the evidence. No model in the path.

Every answer is built from queries, and every sentence carries the record ids behind it so it can be
verified. A question the engine has no query for is refused plainly rather than guessed at.
"""
from __future__ import annotations

import re

from tracex_api import db, evidence
from tracex_api.engine import agent, correlate, hunt, scoring, views
from tracex_api.engine.dataset import Dataset

REFUSAL = "I can't answer that from the data I hold. I only report what is in this system — I don't speculate."
EXAMPLES = [
    "Who are the highest-risk entities?", "Why is P0006 risky?", "Show the transactions behind P0006", "How many records have we ingested?",
    "Show the fan-out patterns", "Which calls were followed by a debit?", "Which entity moved money fastest after a call?",
    "Which handsets rotate SIMs?", "What campaigns has the hunt found?", "Who is Meera Kulkarni?", "What has the agent found?",
]
ENTITY = re.compile(r"\bP\d{4}\b", re.I)


def _money(value: float) -> str:
    """Exact, never rounded: a claim must match the record it cites."""
    return f"{value:,.2f}".rstrip("0").rstrip(".")


def _answer(text, intent, confidence, data, claims, link=None, entity_id=None, suggestions=None):
    return {"answer": text, "intent": intent, "confidence": confidence, "data": data, "sources": ["sqlite"],
            "suggestions": suggestions or EXAMPLES[:3], "link": link, "claims": claims, "entity_id": entity_id}


def _entity_in(question: str, ds: Dataset) -> str | None:
    m = ENTITY.search(question)
    if m and m.group(0).upper() in ds.persons:
        return m.group(0).upper()
    q = question.lower()
    for pid, p in ds.persons.items():
        if p.name.lower() in q:
            return pid
    for value, pid in list(ds.by_phone.items()) + list(ds.by_account.items()) + list(ds.by_device.items()):
        if value.lower() in q:
            return pid
    return None


def answer(ds: Dataset, question: str) -> dict:
    q = question.lower().strip()
    pid = _entity_in(question, ds)
    scores = scoring.scores(ds)

    if pid and re.search(r"why|risk|score|flag|explain", q):
        s = scores[pid]
        raises = [f"{f['feature'].replace('_', ' ')} = {f['value']}" for f in s["top_factors"] if f["direction"] == "raises"]
        lowers = [f["feature"].replace("_", " ") for f in s["top_factors"] if f["direction"] == "lowers"]
        events = views.entity_events(ds, pid)
        records = ([e["rec_id"] for e in events if e["kind"] == "txn"] or [e["rec_id"] for e in events])[:5]
        claims = [{"claim": f"{pid} is assessed at {round(s['risk_score'] * 100)} out of 100 ({s['band']} band) by the {s['model']} model.", "cited": records, "basis": "computed"}]
        if raises:
            claims.append({"claim": f"What raises it: {'; '.join(raises)}.", "cited": records, "basis": "computed"})
        if lowers:
            claims.append({"claim": f"Pulling the other way: {', '.join(lowers)}.", "cited": records, "basis": "computed"})
        text = " ".join(c["claim"] for c in claims) + " A score ranks the review queue. It is not a finding, and this entity still requires human review."
        return _answer(text, "why_risky", 0.95, {k: s[k] for k in ("entity_id", "risk_score", "band", "model", "top_factors")}, claims, f"/queue/{pid}", pid,
                       [f"Show the transactions behind {pid}", "Which calls were followed by a debit?", "Show the fan-out patterns"])

    if pid and re.search(r"transaction|record|call|evidence|behind|money|payment", q):
        kinds = [k for k, words in (("txn", ("transaction", "money", "payment")), ("call", ("call",))) if any(w in q for w in words)] or ["txn", "call"]
        events = [e for e in views.entity_events(ds, pid) if e["kind"] in kinds][:12]
        if not events:
            what = "transactions" if kinds == ["txn"] else "calls" if kinds == ["call"] else "records"
            claims = [{"claim": f"No {what} tie to {pid} in the evidence store.", "cited": [], "basis": "system"}]
        else:
            claims = [{"claim": f"{len(events)} record(s) tie to {pid}. Each one is cited by id below and re-hashed against its ingest value.", "cited": [e["rec_id"] for e in events], "basis": "computed"}]
        for e in events:
            d = e["detail"]
            if e["kind"] == "txn":
                t = ds.txns_by_id[e["rec_id"]]
                claims.append({"claim": f"{t.rec_id}: {t.direction} of {_money(t.amount)} from {t.src_account or 'unknown'} to {t.dst_account or 'unknown'} at {t.time.isoformat()}.", "cited": [t.rec_id], "basis": "record"})
            else:
                c = ds.calls_by_id[e["rec_id"]]
                claims.append({"claim": f"{c.rec_id}: {c.call_type} from {c.a_party} to {c.b_party} at {c.start.isoformat()} lasting {c.duration} seconds.", "cited": [c.rec_id], "basis": "record"})
        rows = [{"rec_id": e["rec_id"], "kind": e["kind"], "row_sha256": e["row_sha256"], "detail": e["detail"]} for e in events]
        return _answer(" ".join(c["claim"] for c in claims), "entity_records", 0.95, {"entity_id": pid, "count": len(events), "evidence_rows": [e["rec_id"] for e in events], "records": rows},
                       claims, f"/profiles/{pid}", pid, [f"Why is {pid} risky?", "Show the fan-out patterns", "Which calls were followed by a debit?"])

    if pid and re.search(r"who is|profile|about|tell me", q):
        p = ds.persons[pid]
        prof = views.profile(ds, pid)
        s = scores[pid]
        cited = [e["rec_id"] for e in views.entity_events(ds, pid)][:3]
        claims = [{"claim": f"{pid} is {p.name}, resolved from {len(p.phones)} phone(s), {len(p.devices)} device(s) and {len(p.accounts)} account(s).", "cited": cited, "basis": "computed"},
                  {"claim": f"They placed {prof['activity']['calls_placed']} calls, sent {prof['activity']['txns_sent']} transaction(s) and received {prof['activity']['txns_received']}.", "cited": cited, "basis": "computed"},
                  {"claim": f"Current assessment: {round(s['risk_score'] * 100)} ({s['band']}).", "cited": cited, "basis": "computed"}]
        return _answer(" ".join(c["claim"] for c in claims), "entity_profile", 0.9, {"entity_id": pid, "name": p.name, "activity": prof["activity"]}, claims, f"/profiles/{pid}", pid)

    if re.search(r"highest|riskiest|top (risk|entit)|most risky|priority", q):
        top = scoring.ranked(ds)[:5]
        claims = [{"claim": f"{s['entity_id']} ({ds.persons[s['entity_id']].name}) — {round(s['risk_score'] * 100)} ({s['band']}).",
                   "cited": [e["rec_id"] for e in views.entity_events(ds, s["entity_id"])][:3], "basis": "computed"} for s in top]
        return _answer("The five highest-risk entities: " + " ".join(c["claim"] for c in claims), "top_entities", 0.95,
                       {"items": [{k: s[k] for k in ("entity_id", "risk_score", "band")} for s in top]}, claims, "/queue")

    if re.search(r"how many|ingested|record count|how much data", q):
        counts = evidence.counts()
        total = sum(counts.values())
        firsts = [r["record_id"] for r in db.query("SELECT MIN(record_id) AS record_id FROM records GROUP BY source_type")]
        claims = [{"claim": f"{total} records are held: " + ", ".join(f"{n} {s}" for s, n in sorted(counts.items())) + ".", "cited": firsts, "basis": "computed"}]
        return _answer(claims[0]["claim"], "ingest_counts", 1.0, {"counts": counts, "total": total}, claims, "/records")

    if re.search(r"fastest|quickest|soonest", q) and re.search(r"call|debit|money", q):
        links = correlate.call_to_debit(ds)
        if links:
            l = links[0]
            big = max((x for x in links if x["latency_s"] <= scoring.FAST_LATENCY_S), key=lambda x: x["amount"], default=l)
            claims = [{"claim": f"The fastest: {l['person']} was debited {l['amount']:,} {l['latency_s']} seconds after a call from {l['caller']}.", "cited": [l["call_rec_id"], l["debit_rec_id"]], "basis": "computed"}]
            if big is not l:
                claims.append({"claim": f"The largest fast one: {big['amount']:,} left {big['src_account']} {big['latency_s']} seconds after a call from {big['caller']} — {big['narration']}.",
                               "cited": [big["call_rec_id"], big["debit_rec_id"]], "basis": "computed"})
            return _answer(" ".join(c["claim"] for c in claims), "fastest_call_to_debit", 0.95, {"fastest": l, "largest_fast": big}, claims, f"/queue/{big['person']}", big["person"])

    if re.search(r"call.*(followed|then|before).*debit|call.to.debit|calls followed", q):
        links = correlate.call_to_debit(ds)
        fast = [l for l in links if l["latency_s"] <= scoring.FAST_LATENCY_S]
        claims = [{"claim": f"{len(links)} debits followed a call to the account holder within 3 hours; {len(fast)} within 10 minutes.", "cited": [x for l in fast[:5] for x in (l["call_rec_id"], l["debit_rec_id"])], "basis": "computed"}]
        for l in sorted(fast, key=lambda x: -x["amount"])[:4]:
            claims.append({"claim": f"{l['debit_rec_id']}: {l['amount']:,} left {l['src_account']} {l['latency_s']} seconds after call {l['call_rec_id']}.", "cited": [l["call_rec_id"], l["debit_rec_id"]], "basis": "computed"})
        return _answer(" ".join(c["claim"] for c in claims), "call_to_debit", 0.95, {"count": len(links), "fast": fast[:20]}, claims, "/correlations")

    if re.search(r"fan.?out|passed (money|it) on|pass.?through|mule", q):
        fan = correlate.fanout(ds)
        claims = [{"claim": f"{len(fan)} accounts passed on most of a credit within 30 minutes.", "cited": [l["inbound_rec_id"] for l in fan], "basis": "computed"}]
        for l in fan[:5]:
            claims.append({"claim": f"{l['person']} received {l['inbound_amount']:,} ({l['inbound_rec_id']}) and sent on {round(l['passthrough_ratio'] * 100)}% across {l['hop_count']} debit(s).",
                           "cited": [l["inbound_rec_id"], *l["outbound_rec_ids"]], "basis": "computed"})
        return _answer(" ".join(c["claim"] for c in claims), "fanout", 0.95, {"links": fan}, claims, "/correlations")

    if re.search(r"sim|burner|handset|imei|rotat", q):
        devices = correlate.imei_persistence(ds, 3)
        claims = []
        for d in devices:
            rec = next((c.rec_id for c in ds.calls if c.imei == d["imei"]), None)
            claims.append({"claim": f"Handset {d['imei']} carried {d['sim_count']} SIMs ({', '.join(d['persons']) or 'unresolved'}).", "cited": [rec] if rec else [], "basis": "computed"})
        text = " ".join(c["claim"] for c in claims) if claims else "No handset carried three or more SIMs."
        return _answer(text, "sim_rotation", 0.95, {"devices": devices}, claims, "/graph")

    if re.search(r"campaign|ring|operation|network|working together", q):
        result = hunt.sweep(ds)
        claims = [{"claim": f"{c['campaign_id']}: {c['summary']}", "cited": [e for l in c["links"] if l["kind"] != "ip" for e in l["evidence"][:1]][:6], "basis": "computed"} for c in result["campaigns"]]
        text = " ".join(c["claim"] for c in claims) if claims else "The hunt found no group of three or more entities operating together."
        return _answer(text, "campaigns", 0.9, {"portfolio": result["portfolio"]}, claims, "/hunt")

    if re.search(r"agent|investigation", q):
        invs = agent.list_investigations(None, 10)
        claims = [{"claim": f"Investigation #{i['id']} on {i['entity_id']}: {i['hypothesis'].replace('_', ' ')}, tier {i['tier']}, risk {round(i['risk_score'])}.",
                   "cited": [], "basis": "system"} for i in invs[:5]]
        text = " ".join(c["claim"] for c in claims) if claims else "The response agent has not investigated anything yet."
        return _answer(text, "agent_findings", 0.9, {"investigations": [agent.summary_row(i) for i in invs]}, claims, "/response-agent")

    if re.search(r"case|trx-", q):
        rows = db.query("SELECT id, case_code, title, status FROM cases ORDER BY id")
        claims = [{"claim": f"{r['case_code']} ({r['status']}): {r['title']}.", "cited": [], "basis": "system"} for r in rows]
        text = " ".join(c["claim"] for c in claims) if claims else "No cases are open."
        return _answer(text, "cases", 0.9, {"cases": [dict(r) for r in rows]}, claims, "/cases")

    return _answer(REFUSAL, "unknown", 0.0, {}, [], None, None, EXAMPLES)
