"""Evidentiary views: exculpatory review, counterfactual boundaries, the BSA s.63 certificate and the
evidence package."""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

from tracex_api import evidence
from tracex_api.engine import correlate, scoring
from tracex_api.engine.dataset import Dataset

SEED = Path(__file__).resolve().parents[1] / "seed_data"
SYSTEM = "TRACE-X v0.1 — multi-source investigative analytics platform (air-gapped deployment)"
EXCULPATORY_NOTE = ("Each reduction is the check's ceiling scaled by how closely this entity resembles the legitimate reference pattern, "
                    "and by how much evidence supports the comparison. Checks can lower a machine score but never zero it out. "
                    "Final assessment requires human review.")
REDUCTION_CAP = 0.6
LARGE_TRANSFER_INR = 200_000


def _ratio_sim(value: float, reference: float) -> float:
    return round(max(0.0, 1 - abs(value - reference) / reference), 3)


def _contrib(feature, value, reference, similarity):
    return {"feature": feature, "value": round(value, 3) if isinstance(value, float) else value, "reference": reference, "similarity": similarity}


def exculpatory(ds: Dataset, entity_id: str) -> dict:
    score = scoring.scores(ds)[entity_id]
    f = score["features"]
    original = score["risk_score"]
    findings = []

    # 1. Stable counterparties: a busy account that keeps paying the same known payees.
    stab, vel, ins, outs = f["counterparty_stability"], f["txn_velocity"], f["inbound_txn_count"], f["outbound_txn_count"]
    contribs = [_contrib("counterparty_stability", stab, 0.85, _ratio_sim(stab, 0.85)),
                _contrib("inbound_txn_count", ins, 8, _ratio_sim(ins, 8)),
                _contrib("outbound_txn_count", outs, 10, _ratio_sim(outs, 10))]
    fit = round(sum(c["similarity"] for c in contribs) / 3, 4)
    if stab < 0.5:
        ev = 0.0
        reason = (f"Volume resembles a trading account ({vel:.1f} txn/day across {outs} legs), but counterparty stability is only {stab:.2f} — "
                  "the money reaches largely fresh payees. That is the opposite of a settled supplier relationship, so the business explanation does not hold.")
    else:
        ev = 0.2 if stab <= 0.5 else round(min(1.0, max(0.2, (vel - 1) / 3)), 4)
        if fit >= 0.5:
            reason = (f"Transaction velocity is {vel:.1f}/day across {outs} outbound legs, but counterparty stability is {stab:.2f} — the money returns to "
                      f"the same few payees. That is {round(fit * 100)}% consistent with a high-turnover business settling known suppliers rather than "
                      "fanning out to fresh mule accounts.")
        else:
            reason = (f"Counterparty stability {stab:.2f} at {vel:.1f} txn/day is only {round(fit * 100)}% consistent with a settled supplier "
                      "relationship — too weak to reinterpret the pattern.")
    applies = fit >= 0.5 and ev > 0
    findings.append({"check": "stable_counterparties", "applies": applies, "confidence_reduction": round(0.3 * fit * ev, 4) if applies else 0,
                     "reason": reason, "fit": fit, "evidence": ev, "max_weight": 0.3, "contributions": contribs})

    # 2. Fixed beneficiary, no onward movement: a routine remittance after a call, not a coerced payment.
    links = [l for l in correlate.call_to_debit(ds) if l["person"] == entity_id]
    if not links:
        findings.append({"check": "fixed_beneficiary_no_onward", "applies": False, "confidence_reduction": 0,
                         "reason": "No call-to-debit coupling to reinterpret.", "fit": 0, "evidence": 0, "max_weight": 0.25, "contributions": []})
    else:
        fastest = max(links, key=lambda l: (l["amount"], -l["latency_s"]))  # the transfer that matters is the largest one
        beneficiaries = len({l["dst_account"] for l in links if l["dst_account"]})
        amount = fastest["amount"]
        onward = f["max_passthrough_ratio"]
        ben_sim = 1.0 if beneficiaries <= 1 else round(max(0.0, 1 - (beneficiaries - 1) / 3), 3)
        amt_sim = 1.0 if amount <= 60000 else round(max(0.0, (LARGE_TRANSFER_INR - amount) / (LARGE_TRANSFER_INR - 60000)), 3)
        onward_sim = round(max(0.0, 1 - onward), 3) if onward <= 0.95 else 0.0
        contribs = [_contrib("distinct_beneficiaries", beneficiaries, 1, ben_sim), _contrib("transfer_amount_inr", amount, 60000, amt_sim),
                    _contrib("beneficiary_onward_movement", onward, 0, onward_sim)]
        fit = round(sum(c["similarity"] for c in contribs) / 3, 4)
        applies = fit >= 0.5
        if applies:
            reason = (f"The post-call transfer of Rs {int(amount):,} goes to {max(1, beneficiaries)} beneficiary, and that beneficiary moves "
                      f"{round(onward * 100)}% of it onward. That is {round(fit * 100)}% consistent with a routine remittance rather than a coerced payment into a mule chain.")
        else:
            reason = (f"Rs {int(amount):,} across {beneficiaries} beneficiaries with {round(onward * 100)}% moved onward is only "
                      f"{round(fit * 100)}% consistent with a fixed-beneficiary remittance.")
        findings.append({"check": "fixed_beneficiary_no_onward", "applies": applies, "confidence_reduction": round(0.25 * fit, 4) if applies else 0,
                         "reason": reason, "fit": fit, "evidence": 1, "max_weight": 0.25, "contributions": contribs})

    # 3. Long-lived multi-SIM handset with no money coupling: a shared household phone, not burner rotation.
    sims = f["max_imei_sim_count"]
    contribs = [
        _contrib("has_call_debit_coupling", f["has_call_debit_coupling"], 0, round(1 - f["has_call_debit_coupling"], 3)),
        _contrib("max_fanout_hop_count", f["max_fanout_hop_count"], 0, round(max(0.0, 1 - f["max_fanout_hop_count"] / 3), 3)),
        _contrib("max_passthrough_ratio", f["max_passthrough_ratio"], 0, round(max(0.0, 1 - f["max_passthrough_ratio"]), 3)),
        _contrib("total_fanout_inbound_inr", f["total_fanout_inbound_inr"], 0, round(max(0.0, 1 - f["total_fanout_inbound_inr"] / LARGE_TRANSFER_INR), 3)),
        _contrib("n_ips_shared", f["n_ips_shared"], 0, round(max(0.0, 1 - f["n_ips_shared"] / 3), 3)),
    ]
    fit = round(sum(c["similarity"] for c in contribs) / 5, 4)
    money_signal = f["max_fanout_hop_count"] or f["max_passthrough_ratio"]  # onward movement, not mere call timing
    shares_flagged_ip = f["n_ips_shared"] > 0 and scoring.scores(ds)[entity_id]["band"] != "high"
    if sims >= 2 and not money_signal and not shares_flagged_ip:
        ev = round(2 / (sims + 1), 4)
        reason = (f"The handset carries {sims} SIMs, but there is no call-to-debit coupling, no fan-out, and Rs {f['total_fanout_inbound_inr']:,.0f} of traced "
                  f"movement, and it shares no egress infrastructure with other flagged entities. Absent any financial or infrastructure signal, this is "
                  f"{round(fit * 100)}% consistent with a shared household phone rather than burner rotation.")
    elif sims >= 2 and not money_signal:
        ev = 0.0
        reason = (f"The {sims}-SIM handset carries no banking signal, but it egresses through {f['n_ips_shared']} IP address(es) also used by other flagged "
                  "entities. Shared infrastructure at this SIM count fits a SIM farm, not a household phone.")
    else:
        ev = 0.0
        reason = (f"The {sims}-SIM handset is still tied to financial activity ({round(f['max_passthrough_ratio'] * 100)}% passthrough, "
                  f"{f['max_fanout_hop_count']} hops), so the shared-phone explanation is only {round(fit * 100)}% consistent.")
    applies = fit >= 0.5 and ev > 0
    findings.append({"check": "longlived_sims_no_money_coupling", "applies": applies, "confidence_reduction": round(0.2 * fit * ev, 4) if applies else 0,
                     "reason": reason, "fit": fit, "evidence": ev, "max_weight": 0.2, "contributions": contribs})

    raw = round(sum(x["confidence_reduction"] for x in findings), 4)
    total = min(raw, REDUCTION_CAP)
    return {
        "entity_id": entity_id, "original_risk_score": original, "total_confidence_reduction": total, "raw_reduction": raw,
        "adjusted_risk_score": round(original * (1 - total), 4), "capped": raw > REDUCTION_CAP, "method": "reference_class_similarity",
        "note": EXCULPATORY_NOTE, "findings": findings, "applied": [x["check"] for x in findings if x["applies"]],
    }


COUNTERFACTUAL_METHOD = ("Each boundary is found by holding this entity's other features fixed and binary-searching the probed feature against the "
                         "live scorer until the prediction crosses the flag threshold.")
DRIVER_TEXT = {
    "n_ips_shared": ("Shared {v} IP address(es) with other flagged entities", "Removing the shared infrastructure alone would not have cleared this entity.",
                     "Sharing no more than {f} IP address(es) would have cleared this entity."),
    "max_imei_sim_count": ("Handset carried {v} SIM(s)", "Fewer SIMs on the handset alone would not have cleared this entity.",
                           "A handset with at most {f} SIM(s) would have cleared this entity."),
    "n_call_debit_links": ("{v} call-to-debit link(s)", "Fewer call-to-debit links alone would not have cleared this entity.",
                           "At most {f} call-to-debit link(s) would have cleared this entity."),
    "max_passthrough_ratio": ("Passed on {v:.0%} of a credit", "A lower passthrough alone would not have cleared this entity.",
                              "Passing on at most {f:.0%} would have cleared this entity."),
    "max_fanout_hop_count": ("Fanned out across {v} hop(s)", "Fewer onward hops alone would not have cleared this entity.",
                             "At most {f} onward hop(s) would have cleared this entity."),
}


def counterfactual(ds: Dataset, entity_id: str) -> dict:
    score = scoring.scores(ds)[entity_id]
    seeded = _seeded_counterfactual(entity_id)
    if seeded and score["model"] == "xgboost":  # the recorded original model — its captured counterfactuals still apply
        return seeded
    feats = dict(score["features"])
    flagged = score["risk_score"] >= 0.33
    out = []
    for factor in [t for t in score["top_factors"] if t["direction"] == "raises"][:3]:
        name = factor["feature"]
        observed_tpl, stuck, flips = DRIVER_TEXT.get(name, ("{v} " + name, f"Changing {name} alone would not have changed the outcome.",
                                                           f"{name} at {{f}} would have changed the outcome."))
        flip = None
        for candidate in _probe_values(name, feats[name]):
            trial = {**feats, name: candidate}
            if (scoring.score_features(trial, score["model"]) >= 0.33) != flagged:
                flip = candidate
                break
        out.append({
            "driver": name, "feature": name, "observed_value": feats[name], "observed": observed_tpl.format(v=feats[name]),
            "boundary": flips.format(f=flip) if flip is not None else stuck, "flip_value": flip, "flip_reachable": flip is not None,
            "weight_hint": factor["shap"], "method": "model_probe",
        })
    return {"entity_id": entity_id, "risk_score": score["risk_score"], "band": score["band"], "flag_threshold": 0.33,
            "method": COUNTERFACTUAL_METHOD, "counterfactuals": out}


def _probe_values(name: str, value):
    if isinstance(value, float) and value <= 1.5:
        return [round(value - step / 20, 2) for step in range(1, int(value * 20) + 1)]
    return list(range(int(value) - 1, -1, -1))


def _seeded_counterfactual(entity_id: str) -> dict | None:
    path = SEED / "catalog" / "counterfactuals.json"
    if not path.exists():
        return None
    return json.loads(path.read_text(encoding="utf-8")).get(entity_id)


# ---- certificate and package ---------------------------------------------------------------------
def certificate(case_code: str | None, entity_id: str | None) -> dict:
    now = datetime.now(timezone.utc).isoformat()
    batches = []
    all_intact = True
    ordered = sorted(evidence.batches(), key=lambda b: b["storage_order"])
    for b in ordered:
        check = evidence.verify_batch(b)
        batches.append({
            "source_type": b["source_type"], "batch_id": b["batch_id"], "filename": b["filename"], "record_count": b["records"],
            "first_ingested_at": b["ingested_at"], "last_ingested_at": b["last_ingested_at"] or b["ingested_at"],
            "chain_head_sha256": b["chain_head"], "chain_intact": check["intact"], "breach": check["first_breach"],
        })
        all_intact = all_intact and check["intact"]
    total = sum(b["record_count"] for b in batches)
    status = "DRAFT - PENDING SIGNATURE"
    cert = {"case_code": case_code, "generated_at": now, "produced_by_system": SYSTEM, "entity_id": entity_id, "total_records": total,
            "all_chains_intact": all_intact, "status": status, "batches": batches}
    lines = [
        "CERTIFICATE UNDER SECTION 63 OF THE BHARATIYA SAKSHYA ADHINIYAM, 2023",
        "(Certificate in respect of electronic record)",
        "",
        f"Status: {status}",
        f"Generated (UTC): {now}",
    ]
    if case_code:
        lines.append(f"Case: {case_code}")
    if entity_id:
        lines.append(f"Subject entity: {entity_id}")
    lines += ["", "1. IDENTIFICATION OF THE ELECTRONIC RECORD",
              "   The electronic records described below were produced by the computer system identified in paragraph 2 from source data files lawfully obtained in the course of investigation.",
              ""]
    for i, b in enumerate(batches, start=1):
        lines += [
            f"   1.{i}  Source type : {b['source_type']}",
            f"        File name    : {b['filename']}",
            f"        Batch ID     : {b['batch_id']}",
            f"        Record count : {b['record_count']}",
            f"        Ingested     : {b['first_ingested_at']}  to  {b['last_ingested_at']}",
            f"        Integrity    : SHA-256 hash chain, head = {b['chain_head_sha256']}",
            f"        Chain verified at generation: {'YES' if b['chain_intact'] else 'NO — BREACH DETECTED'}",
            "",
        ]
    lines += [
        f"   Total records certified: {total}",
        "",
        "2. IDENTIFICATION OF THE COMPUTER SYSTEM",
        f"   {SYSTEM}",
        "   The system operated in an air-gapped configuration. No external network services or third-party language-model APIs were used in the processing of these records.",
        "",
        "3. INTEGRITY ASSURANCE",
        "   Every source record was hashed with SHA-256 at the point of entry and linked into a per-batch hash chain: chain[i] = SHA-256(chain[i-1] || row_hash[i]). Any insertion, deletion, or alteration of a record changes the chain head shown above and is therefore detectable.",
        f"   Result of verification at time of generation: {'ALL CHAINS INTACT' if all_intact else 'ONE OR MORE CHAINS BREACHED'}",
        "",
        "4. STATEMENT OF THE PERSON GIVING THIS CERTIFICATE",
        "   I state that the contents of this certificate are true to the best of my knowledge and belief. The electronic records were produced by the computer system in the ordinary course of the investigation and the system was operating properly at the material time.",
        "",
        "   Name        : ________________________",
        "   Designation : ________________________",
        "   Signature   : ________________________",
        "   Date        : ________________________",
        "",
        "NOTE: This document is a system-generated DRAFT. It has legal effect only once reviewed and signed by the certifying officer.",
    ]
    return {"certificate": cert, "text": "\n".join(lines)}


def simple_pdf(text: str, title: str) -> bytes:
    """A dependency-free single-font PDF: monospaced lines, paginated."""
    def esc(s: str) -> str:
        return s.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)").encode("latin-1", "replace").decode("latin-1")
    wrapped = []
    for line in text.splitlines():
        while len(line) > 95:
            wrapped.append(line[:95])
            line = "    " + line[95:]
        wrapped.append(line)
    pages = [wrapped[i:i + 60] for i in range(0, len(wrapped), 60)] or [[""]]
    objects = ["<< /Type /Catalog /Pages 2 0 R >>", None, "<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>"]
    kids = []
    for page_lines in pages:
        content = "BT /F1 8 Tf 40 800 Td 11 TL " + " ".join(f"({esc(l)}) '" for l in page_lines) + " ET"
        objects.append(f"<< /Length {len(content.encode('latin-1'))} >>\nstream\n{content}\nendstream")
        content_id = len(objects)
        objects.append(f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents {content_id} 0 R >>")
        kids.append(len(objects))
    objects[1] = f"<< /Type /Pages /Kids [{' '.join(f'{k} 0 R' for k in kids)}] /Count {len(kids)} >>"
    out = bytearray(b"%PDF-1.4\n")
    offsets = []
    for i, obj in enumerate(objects, start=1):
        offsets.append(len(out))
        out += f"{i} 0 obj\n{obj}\nendobj\n".encode("latin-1")
    xref = len(out)
    out += f"xref\n0 {len(objects) + 1}\n0000000000 65535 f \n".encode()
    for off in offsets:
        out += f"{off:010d} 00000 n \n".encode()
    out += f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R /Info << /Title ({esc(title)}) >> >>\nstartxref\n{xref}\n%%EOF\n".encode("latin-1")
    return bytes(out)
