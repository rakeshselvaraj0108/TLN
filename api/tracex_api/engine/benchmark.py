"""Benchmark: the live scorer and detectors graded against the synthetic corpus's answer key.

The answer key is the generator's ground truth — the role each subject was planted with, and the parameters of
the planted scam. Scores are never fitted to it; the run reports what the production code produces, including a
poor result.
"""
from __future__ import annotations

import time
from datetime import datetime, timezone

from tracex_api import db, evidence
from tracex_api.engine import correlate, scoring
from tracex_api.engine import verify as verifier
from tracex_api.engine.dataset import current
from tracex_api.engine.reasoning import PROPOSALS_PER_HYPOTHESIS

FRAUD_ROLES = {"handler", "associate", "mule", "sim_farm", "layering"}
RED_HERRING_ROLES = {"legit_business", "legit_family", "legit_household", "legit_charity"}
# The planted scam, as declared by the corpus generator. Tolerances are part of the key.
PLANTED = [
    ("call_to_debit_latency_sec", 360, 30.0),
    ("principal_inr", 480000, 1.0),
    ("passthrough_ratio", 0.96, 0.02),
    ("fanout_width", 6, 0.0),
    ("fanout_window_min", 11, 2.0),
    ("handler_imei", "287101226916693", None),
    ("handler_sim_count", 7, 0.0),
]
BASELINE_ACTIONS_PER_ENTITY = 7
BASELINE_SOURCE = "declared assumption from the demo walkthrough, not a measured human trial"
# The captured answer key marks the primary scam victim (the first planted victim) as expected high-risk.
VICTIM_EXPECTED = {"P0001": "high"}
VICTIM_NOTE = "victim — scored separately, never counted as fraud"


def _truth(pid: str, role: str) -> tuple[str, str, bool]:
    """(truth_label, expected_risk, is_red_herring) for a planted role."""
    if role in FRAUD_ROLES:
        return "fraud", "high", False
    if role == "victim":
        return "victim", VICTIM_EXPECTED.get(pid, "low"), False
    return "legitimate", "low", role in RED_HERRING_ROLES


def _ratio(a: float, b: float) -> float:
    return round(a / b, 4) if b else 0


def _patterns(ds, persons: dict) -> list[dict]:
    victims = {pid for pid, p in persons.items() if p.role == "victim"}
    handlers = {pid for pid, p in persons.items() if p.role == "handler"}
    observed: dict = {}
    principal = max((l for l in correlate.call_to_debit(ds) if l["person"] in victims), key=lambda l: l["amount"], default=None)
    if principal:
        observed["call_to_debit_latency_sec"] = float(principal["latency_s"])
        observed["principal_inr"] = float(principal["amount"])
        spread = [f for f in correlate.fanout(ds) if f["inbound_account"] == principal["dst_account"]]
        if spread:
            f = max(spread, key=lambda x: x["hop_count"])
            times = {t.rec_id: t.time for t in ds.txns}
            inbound = times[f["inbound_rec_id"]]
            observed["passthrough_ratio"] = f["passthrough_ratio"]
            observed["fanout_width"] = f["hop_count"]
            observed["fanout_window_min"] = round(max((times[r] - inbound).total_seconds() for r in f["outbound_rec_ids"]) / 60, 1)
    device = next((d for d in correlate.imei_persistence(ds) if handlers & set(d["persons"])), None)
    if device:
        observed["handler_imei"] = device["imei"]
        observed["handler_sim_count"] = device["sim_count"]
    checks = []
    for field, expected, tol in PLANTED:
        got = observed.get(field)
        if got is None:
            ok, detail = False, "not observed"
        elif tol is None:
            ok, detail = got == expected, "exact string match"
        else:
            ok, detail = abs(float(got) - expected) <= tol, f"tolerance +/-{tol}"
        checks.append({"field": field, "expected": expected, "observed": got, "correct": ok, "detail": detail})
    return checks


def run(include_hallucination: bool = True) -> dict:
    started = datetime.now(timezone.utc)
    t0 = time.perf_counter()
    ds = current()
    scores = scoring.scores(ds)
    persons = ds.persons
    counts = evidence.counts()

    rows = []
    tp = fp = tn = fn = 0
    rh_total = rh_flagged = v_total = v_flagged = 0
    band_misses = []
    for pid in sorted(persons):
        role = persons[pid].role
        truth, expected, herring = _truth(pid, role)
        s = scores[pid]
        flagged = s["band"] != "low"
        if truth == "victim":
            v_total += 1
            v_flagged += flagged
            correct, note = s["band"] == expected, VICTIM_NOTE
        else:
            fraud = truth == "fraud"
            correct = flagged == fraud
            tp += fraud and flagged
            fn += fraud and not flagged
            fp += (not fraud) and flagged
            tn += (not fraud) and not flagged
            note = "" if correct else ("MISSED — a real fraud entity was not flagged" if fraud else "FALSE ALARM — a legitimate entity was flagged")
            if herring:
                rh_total += 1
                rh_flagged += flagged
        if s["band"] != expected:
            band_misses.append({"entity_id": pid, "expected": expected, "got": s["band"]})
        rows.append({"entity_id": pid, "role": role, "truth_label": truth, "expected_risk": expected, "is_red_herring": herring,
                     "score": round(s["risk_score"], 4), "predicted_band": s["band"], "predicted_fraud": flagged, "correct": correct, "note": note})

    precision = _ratio(tp, tp + fp)
    recall = _ratio(tp, tp + fn)
    f1 = round(2 * precision * recall / (precision + recall), 4) if precision + recall else 0
    checks = _patterns(ds, persons)
    pattern_ok = sum(c["correct"] for c in checks)

    flagged_n = sum(1 for s in scores.values() if s["band"] != "low")
    recorded = db.query_one("SELECT COUNT(*) AS n FROM actions")["n"]
    actions = flagged_n * PROPOSALS_PER_HYPOTHESIS + recorded
    per_entity = round(actions / len(persons), 4) if persons else 0

    result = {
        "run_id": f"BM-{started.strftime('%Y%m%dT%H%M%S')}", "started_at": started.isoformat(), "elapsed_ms": 0,
        "scorer": "+".join(sorted({s["model"] for s in scores.values()})),
        "seed_counts": {"entities": len(persons), **{k: counts.get(k, 0) for k in ("cdr", "ipdr", "bank", "social")}},
        "detection": {
            "confusion_matrix": {"true_positive": tp, "false_positive": fp, "true_negative": tn, "false_negative": fn, "precision": precision,
                                 "recall": recall, "f1": f1, "accuracy": _ratio(tp + tn, tp + fp + tn + fn)},
            "red_herrings": {"total": rh_total, "flagged": rh_flagged, "false_positive_rate": _ratio(rh_flagged, rh_total)},
            "victims": {"total": v_total, "flagged": v_flagged, "note": "victims are excluded from the fraud matrix by design"},
            "entities": rows,
        },
        "banding": {"total": len(rows), "correct": len(rows) - len(band_misses), "accuracy": _ratio(len(rows) - len(band_misses), len(rows)),
                    "misses": band_misses},
        "patterns": {"total": len(checks), "correct": pattern_ok, "accuracy": _ratio(pattern_ok, len(checks)), "checks": checks},
        "efficiency": {"actions": actions, "entities": len(persons), "actions_per_entity": per_entity,
                       "baseline_actions_per_entity": BASELINE_ACTIONS_PER_ENTITY, "baseline_total_actions": BASELINE_ACTIONS_PER_ENTITY * len(persons),
                       "reduction_vs_baseline": round(1 - per_entity / BASELINE_ACTIONS_PER_ENTITY, 4),
                       "basis": f"{PROPOSALS_PER_HYPOTHESIS} review proposal(s) per flagged entity plus {recorded} recorded human action(s)",
                       "baseline_source": BASELINE_SOURCE},
        "hallucination": verifier.selfeval() if include_hallucination else None,
    }
    h = result["hallucination"]
    result["headline"] = {
        "detection_f1": f1, "detection_precision": precision, "detection_recall": recall,
        "red_herring_false_positive_rate": result["detection"]["red_herrings"]["false_positive_rate"],
        "band_accuracy": result["banding"]["accuracy"], "pattern_accuracy": result["patterns"]["accuracy"], "actions_per_entity": per_entity,
        "verifier_accuracy": h["accuracy"] if h else None, "fabrication_recall": h["fabrication_recall"] if h else None,
    }
    result["elapsed_ms"] = round((time.perf_counter() - t0) * 1000)
    return result


def _fmt(v) -> str:
    return repr(v)


def report_text(r: dict) -> str:
    cm = r["detection"]["confusion_matrix"]
    rh = r["detection"]["red_herrings"]
    b, p, e, h = r["banding"], r["patterns"], r["efficiency"], r["hallucination"]
    out = [f"TRACE-X BENCHMARK  {r['run_id']}", f"scorer: {r['scorer']}   corpus: {r['seed_counts']}", "",
           "DETECTION (fraud vs legitimate)", "-------------------------------",
           f"  TP {cm['true_positive']}   FP {cm['false_positive']}   TN {cm['true_negative']}   FN {cm['false_negative']}",
           f"  precision {cm['precision']:.4f}   recall {cm['recall']:.4f}", f"  F1        {cm['f1']:.4f}   accuracy {cm['accuracy']:.4f}", "",
           "ADVERSARIAL (planted red herrings)", "----------------------------------",
           f"  {rh['flagged']} of {rh['total']} decoys flagged   false-positive rate {rh['false_positive_rate']:.4f}", "",
           "RISK BANDING (3-way, exact match)", "---------------------------------", f"  {b['correct']}/{b['total']} = {b['accuracy']:.4f}"]
    out += [f"    {m['entity_id']}: expected {m['expected']}, got {m['got']}" for m in b["misses"]]
    out += ["", "PATTERN EXTRACTION", "------------------", f"  {p['correct']}/{p['total']} = {p['accuracy']:.4f}"]
    out += [f"    [{'OK  ' if c['correct'] else 'MISS'}] {c['field']}: got {_fmt(c['observed'])}, expected {_fmt(c['expected'])}" for c in p["checks"]]
    out += ["", "ACTION EFFICIENCY", "-----------------",
            f"  {e['actions']} actions over {e['entities']} entities = {e['actions_per_entity']}/entity",
            f"  declared baseline {e['baseline_actions_per_entity']}/entity -> reduction {e['reduction_vs_baseline']:.4f}",
            f"  NOTE: {e['baseline_source']}", ""]
    if h:
        out += ["HALLUCINATION CONTROL (verifier self-eval)", "------------------------------------------",
                f"  verifier accuracy {h['accuracy']}   fabrication recall {h['fabrication_recall']}   n={h['total']}", ""]
    out += ["PER-ENTITY", "----------"]
    for x in r["detection"]["entities"]:
        out.append(f"  [{'OK  ' if x['correct'] else 'MISS'}] {'RH' if x['is_red_herring'] else '  '} {x['entity_id']} {x['role']:<16} "
                   f"truth={x['truth_label']:<11} score={x['score']:.3f} band={x['predicted_band']:<9} {x['note']}")
    return "\n".join(out)
