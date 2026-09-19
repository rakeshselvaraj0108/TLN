"""Agentic fraud response: OBSERVE → HYPOTHESIZE → INVESTIGATE → DECIDE → SCORE → PROPOSE.

The agent never acts. It gathers evidence from the deployment's own analytics, weighs competing
explanations (including innocent ones), and proposes actions that only a named human can approve.
"""
from __future__ import annotations

import hashlib
import json
import time
from datetime import datetime, timezone

from fastapi import HTTPException

from collections import Counter

from tracex_api import audit, db
from tracex_api.engine import correlate, evidentiary, hunt, pattern, scoring
from tracex_api.engine.dataset import Dataset

HYPOTHESIS_LABELS = {"mule": "Mule", "handler": "Handler", "sim_farm": "SIM farm", "victim": "Victim",
                     "legitimate": "Legitimate activity", "shared_phone": "Shared household phone", "bystander": "Bystander"}

HYPOTHESES = {
    "mule": "Receives and passes on proceeds for others",
    "handler": "Runs the social-engineering contact with victims",
    "sim_farm": "Operates rotating SIMs to shield a handler",
    "victim": "Is the target of a scam, not a participant",
    "legitimate": "Ordinary commercial or household activity",
    "shared_phone": "A household handset used by several people",
    "bystander": "Appears in the data without meaningful involvement",
}
ACTIONS = {
    "escalate_campaign": {"title": "Escalate to the fraud team", "impact": 0.8, "approval": "supervisor", "reversibility": "partially_reversible", "money": False,
                          "benefit": "Brings specialist review to a case above routine threshold.",
                          "downside": "Consumes scarce specialist capacity; a wrong association pollutes the campaign's evidence set.", "disposition": "escalate"},
    "request_freeze": {"title": "Request an account freeze", "impact": 0.9, "approval": "supervisor", "reversibility": "partially_reversible", "money": True,
                       "benefit": "Stops further outflow while the receiving bank reviews the account.",
                       "downside": "Freezing an innocent account denies someone access to their money; the bank acts, TRACE-X does not.", "disposition": "freeze_request"},
    "draft_sar": {"title": "Draft a suspicious-activity report", "impact": 0.7, "approval": "supervisor", "reversibility": "reversible", "money": True,
                  "benefit": "Puts the evidence in front of the FIU in the form it expects.",
                  "downside": "A report filed on a weak association creates a record against the subject.", "disposition": "sar_draft"},
    "flag_identifier": {"title": "Flag / watchlist the identifier", "impact": 0.65, "approval": "investigator", "reversibility": "reversible", "money": False,
                        "benefit": "Marks the identifier across every view, so any analyst who meets it next inherits this investigation instead of repeating it.",
                        "downside": "A watchlisted identifier attracts scrutiny; if the attribution is wrong that scrutiny follows an innocent subscriber.", "disposition": None},
    "increase_monitoring": {"title": "Increase monitoring", "impact": 0.45, "approval": "auto", "reversibility": "reversible", "money": False,
                            "benefit": "Raises sampling on this entity so a further escalation is caught in minutes rather than at the next sweep.",
                            "downside": "Monitoring budget spent here is not spent elsewhere.", "disposition": None},
    "dismiss": {"title": "Close as not suspicious", "impact": 0.2, "approval": "investigator", "reversibility": "reversible", "money": False,
                "benefit": "Removes an entity whose activity the evidence explains innocently from the working queue.",
                "downside": "If the innocent explanation is wrong, the entity leaves review.", "disposition": "dismiss"},
}
TRAITS = ["burst_intensity", "night_activity", "fanout_breadth", "repeat_targeting", "short_call_ratio", "url_density", "urgency_language",
          "authority_language", "money_request", "identifier_rotation", "geo_spread", "txn_passthrough"]


def _stamp(t0: float, offset_ms: float) -> str:
    return datetime.fromtimestamp(t0 + offset_ms / 1000, tz=timezone.utc).isoformat(timespec="milliseconds")


def _tier(risk: float) -> str:
    return "critical" if risk >= 80 else "high" if risk >= 60 else "medium" if risk >= 35 else "low"


def traits(ds: Dataset, entity_id: str) -> dict:
    p = ds.persons[entity_id]
    phones = set(p.phones)
    calls = [c for c in ds.calls if c.a_party in phones]
    days = {c.start.date() for c in calls} or {None}
    per_day = len(calls) / len(days) if calls else 0
    contacts = {c.b_party for c in calls}
    repeats = sum(1 for n in contacts if sum(1 for c in calls if c.b_party == n) >= 5)
    posts = [x for x in ds.posts if x.msisdn in phones]
    text = " ".join(x.text.lower() for x in posts)
    feats = scoring.scores(ds)[entity_id]["features"]
    cells = {c.cell_key for c in calls}
    return {
        "burst_intensity": round(min(1.0, per_day / 40), 4),
        "night_activity": round(sum(1 for c in calls if c.start.hour < 6 or c.start.hour >= 22) / len(calls), 4) if calls else 0,
        "fanout_breadth": round(min(1.0, len(contacts) / 20), 4),
        "repeat_targeting": round(min(1.0, repeats / 5), 4),
        "short_call_ratio": round(sum(1 for c in calls if c.duration < 60) / len(calls), 4) if calls else 0,
        "url_density": round(min(1.0, sum(1 for x in posts if "http" in x.text or x.url) / max(1, len(posts))), 4),
        "urgency_language": 1.0 if any(w in text for w in ("urgent", "immediately", "slots full", "on time")) else 0.0,
        "authority_language": 1.0 if any(w in text for w in ("cbi", "police", "officer", "customs")) else 0.0,
        "money_request": 1.0 if any(w in text for w in ("money", "rent", "payout", "loan")) else 0.0,
        "identifier_rotation": round(min(1.0, (feats["max_imei_sim_count"] - 1) / 6), 4),
        "geo_spread": round(min(1.0, len(cells) / 15), 4),
        "txn_passthrough": feats["max_passthrough_ratio"],
    }


def dna_signature(t: dict) -> str:
    blob = json.dumps({k: round(t[k], 1) for k in TRAITS}, sort_keys=True)
    return "DNA-" + hashlib.sha256(blob.encode()).hexdigest()[:10].upper()


def _similarity(a: dict, b: dict) -> float:
    num = sum(a[k] * b[k] for k in TRAITS)
    den = (sum(a[k] ** 2 for k in TRAITS) ** 0.5) * (sum(b[k] ** 2 for k in TRAITS) ** 0.5)
    return num / den if den else 0.0


def call_velocity(ds: Dataset, entity_id: str) -> dict | None:
    """Calls per minute for this entity's phones, bucketed to the minute: how bursty against its own typical
    pace. None when the entity has no call events at all, rather than a fabricated zero."""
    phones = set(ds.persons[entity_id].phones)
    calls = [c for c in ds.calls if c.a_party in phones or c.b_party in phones]
    if not calls:
        return None
    buckets = Counter(c.start.replace(second=0, microsecond=0) for c in calls)
    peak = max(buckets.values())
    span_min = max(1, int((max(c.start for c in calls) - min(c.start for c in calls)).total_seconds() // 60) + 1)
    baseline = round(len(calls) / span_min, 3)
    # Calls are naturally sparse across a multi-day window, so baseline is always near zero — a bare "peak
    # exceeds baseline" comparison would flag nearly every entity. What actually marks a burst is an
    # absolute cluster of calls landing in the same minute, which ordinary usage essentially never produces.
    deviates = peak >= 3 and peak >= baseline * 25
    if peak >= 6:
        band = "coordinated" if deviates else "high_velocity"
    elif peak >= 3 and deviates:
        band = "suspicious"
    else:
        band = "normal"
    return {"band": band, "peak_per_minute": peak, "baseline_per_minute": baseline, "deviates_from_baseline": deviates}


def investigate(ds: Dataset, entity_id: str, trigger: str, user: str) -> dict:
    t0 = time.time()
    clock = 0.0
    steps = []

    def step(phase, message, detail=None, cost_ms=10):
        nonlocal clock
        clock += cost_ms
        steps.append({"ts": _stamp(t0, clock), "phase": phase, "message": message, "detail": detail or {}})

    score = scoring.scores(ds)[entity_id]
    feats = score["features"]
    person = ds.persons[entity_id]
    step("observe", f"Event received for {entity_id}", {"trigger": trigger})
    step("observe", f"Model risk score on file: {round(score['risk_score'] * 100)}", {"band": score["band"], "model": score["model"]}, 30)
    support = {h: 0.0 for h in HYPOTHESES}
    step("hypothesize", f"Considering {len(HYPOTHESES)} candidate explanations", {"candidates": HYPOTHESES}, 20)
    findings = []
    sources_used, sources_skipped = [], []

    def source(name, fn):
        started = clock
        sources_used.append(name)
        try:
            result = fn()
        except Exception as exc:  # a failing adapter is reported, never hidden
            sources_skipped.append(name)
            step("investigate", f"Queried {name} → failed", {"source": name, "provenance": "local", "error": str(exc)}, 20)
            return
        notes = result["findings"]
        for h, w in result.get("support", {}).items():
            support[h] += w
        findings.extend({**f, "source": name, "summary": f["detail"], "provenance": "local"} for f in notes)
        step("investigate", f"Queried {name} → {len(notes)} finding(s)" if notes else f"Queried {name} → nothing of note",
             {"source": name, "provenance": "local", "findings": notes}, 20 + (clock - started))

    def banking():
        links = [l for l in correlate.call_to_debit(ds) if l["person"] == entity_id]
        fan = [l for l in correlate.fanout(ds) if l["person"] == entity_id]
        out, sup = [], {}
        fast = [l for l in links if l["latency_s"] <= scoring.FAST_LATENCY_S]
        if fast:
            big = max(fast, key=lambda l: l["amount"])
            out.append({"kind": "call_then_debit", "detail": f"₹{big['amount']:,} left {big['src_account']} {big['latency_s']}s after a call from {big['caller']}",
                        "evidence": [big["call_rec_id"], big["debit_rec_id"]], "weight": 0.8})
            if big["amount"] >= 100_000:
                sup["victim"] = 0.8  # a large sum leaving minutes after an inbound call is the coerced-payment pattern
            else:
                sup["legitimate"] = 0.2  # small post-call debits are everyday life
        if fan:
            f = max(fan, key=lambda l: l["hop_count"])
            out.append({"kind": "fanout", "detail": f"passed on {round(f['passthrough_ratio'] * 100)}% of ₹{f['inbound_amount']:,} across {f['hop_count']} hop(s)",
                        "evidence": [f["inbound_rec_id"], *f["outbound_rec_ids"]], "weight": 0.9})
            sup["mule"] = sup.get("mule", 0) + 0.9
        if not links and not fan and feats["outbound_txn_count"]:
            sup["legitimate"] = 0.3
        return {"findings": out, "support": sup}

    def device_rotation():
        devices = [d for d in correlate.imei_persistence(ds, 3) if entity_id in d["persons"]]
        if not devices:
            return {"findings": [], "support": {"bystander": 0.1}}
        d = devices[0]
        money = feats["max_passthrough_ratio"] or feats["has_call_debit_coupling"]
        return {"findings": [{"kind": "sim_rotation", "detail": f"handset {d['imei']} carried {d['sim_count']} SIMs", "evidence": [d["imei"]], "weight": 0.7}],
                "support": {"sim_farm": 0.7 if not money else 0.3, "handler": 0.4, "shared_phone": 0.2 if d["sim_count"] <= 3 else 0}}

    def contact_graph():
        phones = set(person.phones)
        # A caller whose call is followed within minutes by a large debit from the callee is the pattern of a handler.
        # Merely having called someone who later complained is not: businesses and families call people too.
        coerced = [l for l in correlate.call_to_debit(ds) if l["caller"] in phones and l["latency_s"] <= scoring.FAST_LATENCY_S and l["amount"] >= 100_000]
        if coerced:
            l = max(coerced, key=lambda x: x["amount"])
            return {"findings": [{"kind": "coercive_call", "detail": f"called {l['person']}; ₹{l['amount']:,} left their account {l['latency_s']}s later",
                                  "evidence": [l["call_rec_id"], l["debit_rec_id"]], "weight": 0.9}], "support": {"handler": 1.2}}
        contacts = {ds.by_phone.get(c.b_party) for c in ds.calls if c.a_party in phones} - {None, entity_id}
        if len(contacts) >= 8:
            return {"findings": [{"kind": "wide_contact", "detail": f"placed calls to {len(contacts)} distinct subjects", "evidence": [], "weight": 0.2}],
                    "support": {"handler": 0.2, "legitimate": 0.2}}
        return {"findings": []}

    def shared_infrastructure():
        if not feats["n_ips_shared"]:
            return {"findings": []}
        return {"findings": [{"kind": "shared_egress", "detail": f"egresses through {feats['n_ips_shared']} IP address(es) shared with other subjects",
                              "evidence": [], "weight": 0.3}], "support": {"mule": 0.2, "handler": 0.2, "sim_farm": 0.2}}

    def physical_presence():
        timeline = pattern.entity_timeline(ds, entity_id)
        strong = [c for e in timeline["events"] if e["kind"] == "txn" for c in e["corroborations"] if c["strength"] == "strong"]
        if not strong:
            return {"findings": []}
        c = strong[0]
        return {"findings": [{"kind": "present_at_cashout", "detail": c["claim"], "evidence": [r["record_id"] for r in c["reads"]], "weight": 0.8}],
                "support": {"mule": 0.6}}

    def message_content():
        posts = [x for x in ds.posts if x.msisdn in set(person.phones)]
        if not posts:
            return {"findings": []}
        t = traits(ds, entity_id)
        out = [{"kind": "post", "detail": x.text, "evidence": [x.rec_id], "weight": 0.4} for x in posts]
        sup = {}
        if t["money_request"] and t["urgency_language"]:
            sup["handler"] = 0.5
        if "scammed" in " ".join(x.text.lower() for x in posts):
            sup["victim"] = 0.9
        return {"findings": out, "support": sup}

    def exculpatory():
        ex = evidentiary.exculpatory(ds, entity_id)
        applied = [f for f in ex["findings"] if f["applies"]]
        return {"findings": [{"kind": "exculpatory", "detail": f["reason"], "evidence": [], "weight": f["confidence_reduction"]} for f in applied],
                "support": {"legitimate": sum(f["confidence_reduction"] for f in applied) * 2}}

    def campaign_membership():
        for c in hunt.sweep(ds)["campaigns"]:
            if entity_id not in c["members"]:
                continue
            strong = [l for l in c["links"] if entity_id in (l["a"], l["b"]) and l["kind"] in ("funds", "synchronised") and l["strength"] >= 0.7]
            if not strong:
                return {"findings": [{"kind": "campaign_periphery", "detail": f"on the periphery of {c['campaign_id']} (no direct money link)",
                                      "evidence": [], "weight": 0.2}], "support": {"bystander": 0.2}}
            return {"findings": [{"kind": "campaign_member", "detail": f"{len(strong)} direct money link(s) inside {c['campaign_id']} ({c['summary']})",
                                  "evidence": [e for l in strong for e in l["evidence"][:2]], "weight": 0.6}],
                    "support": {"mule": 0.3 * min(len(strong), 3)}}
        return {"findings": []}

    for name, fn in [("banking_events", banking), ("campaign_membership", campaign_membership), ("device_rotation", device_rotation), ("contact_graph", contact_graph),
                     ("shared_infrastructure", shared_infrastructure), ("physical_presence", physical_presence),
                     ("message_content", message_content), ("exculpatory_checks", exculpatory)]:
        source(name, fn)
    step("decide", "All evidence sources consulted", {"sources": 8}, 20)

    # Ties and thin evidence resolve toward the innocent explanation: the burden sits on the incriminating one.
    innocence = {"legitimate": 3, "bystander": 2, "victim": 1}
    hypothesis = max(support, key=lambda h: (round(support[h], 6), innocence.get(h, 0)))
    if support[hypothesis] < 0.35:
        hypothesis = "bystander"
    total = sum(support.values()) or 1
    confidence = round(support[hypothesis] / total, 2)

    ex = evidentiary.exculpatory(ds, entity_id)
    risk = round(ex["adjusted_risk_score"] * 100, 2)
    history = [i for i in list_investigations(entity_id) if i["entity_id"] == entity_id]
    prior_score = history[0]["risk_score"] if history else None
    series = [i["risk_score"] for i in reversed(history)] + [risk]
    delta = round(series[-1] - series[-2], 2) if len(series) > 1 else 0
    # Acceleration, not direction: how fast the score is moving, since that is what warrants attention.
    band = "critical" if delta > 15 else "high" if delta > 5 else "rising" if delta > 0 else "falling" if delta < -5 else "steady"
    reason = ({"critical": f"risk jumped {round(delta)} points since the last pass ({round(series[-2])} → {round(risk)}).",
              "high": f"risk climbed {round(delta)} points since the last pass ({round(series[-2])} → {round(risk)}).",
              "rising": f"risk edged up {round(delta)} points ({round(series[-2])} → {round(risk)}).",
              "falling": f"risk fell {round(-delta)} points ({round(series[-2])} → {round(risk)}).",
              "steady": f"risk is unchanged since the last pass ({round(risk)})."}[band] if len(series) > 1 else None)
    trajectory = ({"band": band, "series": series, "current": risk, "velocity": delta, "projected_next": round(risk + delta, 2), "reason": reason}
                 if len(series) > 1 else None)
    step("score", f"Risk assessed at {round(risk)} · tier {_tier(risk)} · trajectory {band}", {"trajectory": trajectory}, 30)
    velocity = call_velocity(ds, entity_id)

    t = traits(ds, entity_id)
    signature, campaign_id, campaign_match = dna_signature(t), None, None
    best = (0.0, None)
    for camp in db.doc_list("campaigns"):
        sim = _similarity(t, camp["traits"])
        if sim > best[0]:
            best = (sim, camp)
    if best[1] and best[0] >= hunt.THRESHOLDS["dna_link"] and hypothesis in ("handler", "sim_farm", "mule"):
        campaign_id = best[1]["campaign_id"]
        best[1]["member_count"] = best[1].get("member_count", 0) + 1
        best[1]["last_seen"] = datetime.now(timezone.utc).isoformat()
        db.doc_put("campaigns", campaign_id, best[1])
        top_traits = sorted(t, key=lambda k: -t[k])[:4]
        campaign_match = {"campaign_id": campaign_id, "similarity": round(best[0], 4),
                          "shared_traits": [{"trait": k, "this_entity": t[k]} for k in top_traits]}

    rejected = {d["action"] for d in decisions(entity_id) if d["verdict"] == "rejected"}
    severity = score["risk_score"]
    urgency = min(1.0, 0.2 + 0.15 * len([f for f in findings if f["kind"] in ("call_then_debit", "fanout")]) + (0.3 if band in ("rising", "high", "critical") else 0))
    candidates = []
    innocent = hypothesis in ("legitimate", "victim", "bystander", "shared_phone")
    for action, spec in ACTIONS.items():
        if action in rejected:
            continue
        if action == "dismiss" and not innocent:
            continue
        if action in ("request_freeze", "draft_sar") and (innocent or not any(f["kind"] in ("fanout", "present_at_cashout") for f in findings)):
            continue
        conf = round(min(0.95, confidence * 0.5 + spec["impact"] * 0.4 + (0.1 if spec["reversibility"] == "reversible" else 0)), 2)
        if action == "dismiss":
            conf = round(min(0.95, 0.4 + support["legitimate"] + support["victim"] * 0.5), 2)
        scored = round(10 * (severity * spec["impact"] + conf + urgency) / 2.2, 2)
        candidates.append({
            "action": action, "title": spec["title"], "confidence": conf, "severity": severity, "impact": spec["impact"], "urgency": round(urgency, 2),
            "reversibility": spec["reversibility"], "expected_benefit": spec["benefit"], "downside": spec["downside"],
            "evidence": [e for f in findings for e in f["evidence"]][:10], "affected_entities": [entity_id], "approval": spec["approval"], "score": scored,
        })
    candidates.sort(key=lambda c: -c["score"])
    proposals = candidates[:3]
    for i, p in enumerate(proposals):
        if i == 0:
            p["rank_reason"] = "Highest combined expected benefit for the risk it carries."
        else:
            prev = proposals[i - 1]
            why = ["lower expected impact" if p["impact"] < prev["impact"] else "comparable impact",
                   "lower confidence" if p["confidence"] < prev["confidence"] else "less time-critical"]
            p["rank_reason"] = f"Ranked below “{prev['title']}”: {', '.join(why)}."
    if proposals:
        step("propose", f"{len(proposals)} action(s) recommended; top: {proposals[0]['title']}", {"requires_approval": proposals[0]["approval"]}, 30)
    else:
        step("propose", "No action proposed", {}, 30)

    inv_id = db.next_id("investigations")
    alternatives = dict(sorted(support.items(), key=lambda kv: -kv[1]))
    hypothesis_ranking = [{"hypothesis": h, "label": HYPOTHESIS_LABELS[h], "confidence": round(w / total, 4)} for h, w in alternatives.items()]
    record = {
        "id": inv_id, "investigation_id": inv_id, "entity_id": entity_id, "trigger": trigger, "risk_score": risk, "prior_score": prior_score,
        "confidence": confidence, "tier": _tier(risk), "hypothesis": hypothesis, "hypothesis_label": HYPOTHESIS_LABELS[hypothesis],
        "hypothesis_ranking": hypothesis_ranking, "dna_signature": signature, "campaign_id": campaign_id, "campaign_match": campaign_match,
        "trajectory": trajectory, "velocity": velocity, "sources_used": sources_used, "sources_skipped": sources_skipped,
        "reused_memory": bool(history), "steps": steps, "findings": findings, "proposals": proposals,
        "elapsed_ms": round((time.time() - t0) * 1000), "created_by": user, "created_at": datetime.now(timezone.utc).isoformat(),
        "alternatives": alternatives,
    }
    db.doc_put("investigations", inv_id, record)
    audit.record(user, "agent.investigate", "entity", entity_id, f"tier={record['tier']} hypothesis={hypothesis} risk={round(risk)}")
    return record


def summary_row(i: dict) -> dict:
    return {k: i.get(k) for k in ("id", "entity_id", "trigger", "risk_score", "confidence", "tier", "hypothesis", "dna_signature",
                                  "campaign_id", "elapsed_ms", "created_by", "created_at")}


def list_investigations(entity_id: str | None = None, limit: int = 50) -> list[dict]:
    rows = sorted(db.doc_list("investigations"), key=lambda i: i["created_at"], reverse=True)
    if entity_id:
        rows = [r for r in rows if r["entity_id"] == entity_id]
    return rows[:limit]


def get_investigation(investigation_id: int) -> dict:
    inv = db.doc_get("investigations", investigation_id)
    if not inv:
        raise HTTPException(status_code=404, detail="no such investigation")
    return inv


def _proposal(inv: dict, action: str) -> dict:
    for p in inv.get("proposals", []):
        if p["action"] == action:
            return p
    raise HTTPException(status_code=404, detail=f"investigation {inv['id']} proposed no '{action}' action")


def simulate(ds: Dataset, investigation_id: int, action: str, user: str) -> dict:
    inv = get_investigation(investigation_id)
    p = _proposal(inv, action)
    spec = ACTIONS.get(action, {})
    affected = set(p["affected_entities"])
    if action == "escalate_campaign" and inv.get("campaign_id") is None:
        for c in hunt.sweep(ds)["campaigns"]:
            if inv["entity_id"] in c["members"]:
                affected |= set(c["members"])
    reduction = round(inv["risk_score"] * p["impact"] * p["confidence"] / 100 * (0.5 if spec.get("reversibility") == "reversible" else 1), 2)
    caveats = ["Nothing has been applied. This is a projection from the proposal's own impact and confidence figures."]
    if spec.get("money"):
        caveats.append("Money-touching: approval requires the supervisor role, and the receiving bank acts — not TRACE-X.")
    if spec.get("reversibility") != "reversible":
        caveats.append("Not fully reversible once actioned: the record of it remains even if the effect is undone.")
    audit.record(user, "agent.simulate", "entity", inv["entity_id"], f"action={action}")
    return {"investigation_id": investigation_id, "action": action, "would_affect": len(affected), "affected_entities": sorted(affected),
            "reversible": spec.get("reversibility") == "reversible", "projected_risk_reduction": reduction, "approval": p["approval"],
            "caveats": caveats, "applied": False}


def decide(ds: Dataset, investigation_id: int, action: str, verdict: str, rationale: str, user) -> dict:
    inv = get_investigation(investigation_id)
    p = _proposal(inv, action)
    verdict = {"approve": "approved", "reject": "rejected"}.get(verdict, verdict)
    if verdict not in ("approved", "rejected"):
        raise HTTPException(status_code=422, detail="verdict must be 'approved' or 'rejected'")
    if len(rationale.strip()) < 10:
        raise HTTPException(status_code=422, detail="a rationale of at least 10 characters is required, for approval and rejection alike")
    spec = ACTIONS.get(action, {})
    if (spec.get("money") or p["approval"] == "supervisor") and not user.is_supervisor:
        raise HTTPException(status_code=403, detail=f"'{p['title']}' requires the supervisor role")
    action_id = None
    if verdict == "approved" and spec.get("disposition"):
        score = scoring.scores(ds).get(inv["entity_id"])
        cur = db.execute("INSERT INTO actions(entity_id, action, rationale, case_id, risk_score, band, created_by, created_at) VALUES (?,?,?,?,?,?,?,?)",
                         (inv["entity_id"], spec["disposition"], f"[agent #{investigation_id}] {rationale.strip()}", None,
                          score["risk_score"] if score else None, score["band"] if score else None, user.username, db.now_iso()))
        action_id = cur.lastrowid
    decision = {"id": db.next_id("decisions"), "investigation_id": investigation_id, "entity_id": inv["entity_id"], "action": action,
                "verdict": verdict, "rationale": rationale.strip(), "decided_by": user.username, "decided_at": db.now_iso(), "case_action_id": action_id}
    db.doc_put("decisions", decision["id"], decision)
    audit.record(user.username, f"agent.decide.{verdict}", "entity", inv["entity_id"], f"action={action} investigation={investigation_id}")
    return decision


def decisions(entity_id: str | None = None) -> list[dict]:
    rows = sorted(db.doc_list("decisions"), key=lambda d: d["decided_at"], reverse=True)
    return [d for d in rows if entity_id is None or d["entity_id"] == entity_id]


def memory(entity_id: str) -> dict:
    invs = list_investigations(entity_id, 1000)
    decs = decisions(entity_id)
    return {
        "entity_id": entity_id,
        "investigations": [{k: i[k] for k in ("id", "risk_score", "tier", "hypothesis", "campaign_id", "created_at")} for i in invs],
        "risk_series": [i["risk_score"] for i in reversed(invs)],
        "decisions": decs,
        "suppressed_actions": sorted({d["action"] for d in decs if d["verdict"] == "rejected"}),
    }


def stats() -> dict:
    invs = db.doc_list("investigations")
    decs = db.doc_list("decisions")
    by_tier, by_verdict = {}, {}
    for i in invs:
        by_tier[i["tier"]] = by_tier.get(i["tier"], 0) + 1
    for d in decs:
        by_verdict[d["verdict"]] = by_verdict.get(d["verdict"], 0) + 1
    return {"investigations": len(invs), "campaigns": len(db.doc_list("campaigns")), "decisions": len(decs), "by_tier": by_tier, "by_verdict": by_verdict}
