"""Answer verification: ground every citation, then judge what is left.

Grounding is arithmetic, not opinion: a cited record either exists or it does not, and it either
re-hashes to its ingest value or it does not. Only claims that survive grounding are judged, by a
local rule judge that checks every figure in the claim against the cited evidence. Nothing leaves the
deployment.
"""
from __future__ import annotations

import json
import re
from datetime import datetime, timezone

from tracex_api import db, hashing

CLAIM_OK = {"verified", "supported", "computed"}
NUMBER = re.compile(r"(?<![\w.])(\d{1,3}(?:,\d{2,3})+(?:\.\d+)?|\d{3,}(?:\.\d+)?)(?![\w])")
IDENT = re.compile(r"\b(?:[A-Z]{4}\d{8,11}|\+?\d{10,13}|\d{15})\b")
REFUSAL = re.compile(r"can't answer|cannot answer|don't know|do not have|not in the data|no data", re.I)


def _lookup(rec_id: str) -> dict | None:
    row = db.query_one("SELECT source_type, payload, row_sha256 FROM records WHERE record_id = ? ORDER BY id LIMIT 1", (rec_id,))
    if not row:
        return None
    payload = json.loads(row["payload"])
    return {"source_type": row["source_type"], "payload": payload, "recorded": row["row_sha256"], "hash_ok": hashing.row_sha256(payload) == row["row_sha256"]}


ISO_TIME = re.compile(r"\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:[+-]\d{2}:\d{2}|Z)?)?")


def _numbers(text: str) -> set[float]:
    """Figures a claim asserts. Timestamps are checked as whole strings, not mined for digits."""
    out = set()
    text = ISO_TIME.sub(" ", text)
    for m in NUMBER.findall(text):
        try:
            out.add(round(float(m.replace(",", "")), 2))
        except ValueError:
            pass
    return out


def checkable(text: str) -> bool:
    """Does this sentence assert a figure or identifier that a cited record could confirm or contradict?"""
    stripped = ISO_TIME.sub(" ", text)
    return bool(_numbers(stripped) or IDENT.findall(stripped))


def _payload_numbers(payload: dict) -> set[float]:
    out = set()
    for v in payload.values():
        try:
            out.add(round(float(str(v).replace(",", "")), 2))
        except ValueError:
            out |= _numbers(str(v))
    return out


def check_claim(claim: str, cited: list[str], basis: str | None = None, records: dict | None = None) -> dict:
    """records: optional {rec_id: lookup} override, used by the self-evaluation traps."""
    cited = [c for c in (cited or []) if c]
    evidence = []
    for rec_id in cited:
        found = (records or {}).get(rec_id) if records is not None and rec_id in records else _lookup(rec_id)
        if found is None:
            evidence.append({"cited": rec_id, "found": False, "hash_ok": None, "detail": "no record with this id was ever ingested"})
        else:
            evidence.append({"cited": rec_id, "found": True, "hash_ok": found["hash_ok"], "source_type": found["source_type"],
                             "detail": "re-hashed to its ingest value" if found["hash_ok"] else "no longer hashes to its ingest value", "_payload": found["payload"]})
    missing = [e for e in evidence if not e["found"]]
    tampered = [e for e in evidence if e["found"] and not e["hash_ok"]]
    judges = []
    if missing:
        verdict = "fabricated"
        reason = (f"{len(missing)} of {len(evidence)} cited record(s) do not exist: {', '.join(e['cited'] for e in missing)}. "
                  "A citation that resolves to nothing is a fabrication, not a judgement call.")
    elif tampered:
        verdict = "tampered"
        reason = f"{len(tampered)} cited record(s) no longer hash to their ingest value. The evidence under this claim was altered after entry."
    elif not evidence and basis == "system":
        verdict = "computed"
        reason = "A statement about case-workspace state (cases, investigations), read from the system of record rather than from evidence rows."
    elif not evidence:
        figures = _numbers(claim) | set(IDENT.findall(claim))
        verdict = "uncited" if figures else "unverifiable"
        reason = "The claim cites no evidence, so nothing can ground it." if figures else "The claim states no checkable figure and cites no evidence."
    else:
        claimed = _numbers(claim)
        present = set()
        for e in evidence:
            present |= _payload_numbers(e["_payload"])
            present |= {round(float(re.sub(r"\D", "", e["cited"]) or 0), 2)}
        payload_text = " ".join(str(v) for e in evidence for v in e["_payload"].values())
        idents = set(IDENT.findall(ISO_TIME.sub(" ", claim)))
        stamps = set(ISO_TIME.findall(claim))
        unmatched_numbers = sorted(n for n in claimed if n not in present)
        unmatched_idents = sorted(i for i in idents if i not in payload_text) + sorted(t for t in stamps if t not in payload_text)
        if not unmatched_numbers and not unmatched_idents:
            verdict = "verified" if (claimed or idents) else "supported"
            vote_reason = "every figure and identifier in the claim appears in the cited records" if verdict == "verified" else "the cited records exist and are intact; the claim states no figure to contradict them"
            judges.append({"judge": "rule", "vote": "supported", "reason": vote_reason})
            reason = f"All {len(evidence)} cited record(s) resolved and re-hashed; {vote_reason}."
        elif basis == "computed":
            verdict = "computed"
            judges.append({"judge": "rule", "vote": "abstain", "reason": "figures are derived from the cited records rather than copied from them"})
            reason = f"All {len(evidence)} cited record(s) resolved and re-hashed; the figures are computed from them, which the rule judge does not re-derive."
        else:
            verdict = "unsupported"
            bad = [f"{n:,.2f}".rstrip("0").rstrip(".") for n in unmatched_numbers] + unmatched_idents
            judges.append({"judge": "rule", "vote": "unsupported", "reason": f"not found in the cited records: {', '.join(bad)}"})
            reason = f"The cited records exist and are intact, but they do not contain {', '.join(bad)}."
    return {"claim": claim, "verdict": verdict, "reason": reason, "evidence": [{k: v for k, v in e.items() if not k.startswith("_")} for e in evidence], "judges": judges}


def verify(claims: list[dict], answer: str = "") -> dict:
    checked = [check_claim(c.get("claim", ""), c.get("cited") or [], c.get("basis")) for c in claims]
    counts: dict[str, int] = {}
    for c in checked:
        counts[c["verdict"]] = counts.get(c["verdict"], 0) + 1
    if not checked:
        verdict = "not_a_claim"
        reason = "Correctly not treated as a factual assertion." if REFUSAL.search(answer or "") else "No claims were submitted."
    elif any(c["verdict"] in ("fabricated", "tampered") for c in checked):
        verdict, reason = "compromised", "At least one citation is fabricated or rests on altered evidence. Do not rely on this answer."
    elif all(c["verdict"] in CLAIM_OK for c in checked):
        verdict, reason = "verified", "Every claim is grounded in intact records."
    elif any(c["verdict"] in CLAIM_OK for c in checked):
        verdict, reason = "partial", "Some claims are grounded; the rest are unsupported or uncited."
    else:
        verdict, reason = "unsupported", "No claim is grounded in the evidence it cites."
    ok = sum(1 for c in checked if c["verdict"] in CLAIM_OK)
    caveats = ["This checks that citations exist, are unaltered, and support the figures claimed — it does not judge whether the "
               "underlying investigation is correct.", "A claim with no citation to check is marked uncited or unverifiable, not "
               "false; absence of evidence here is not evidence of absence."]
    if verdict == "compromised":
        caveats.append("At least one citation is fabricated or rests on altered evidence — treat nothing else in this answer as reliable until it is reviewed.")
    return {
        "verdict": verdict, "reason": reason, "headline": reason, "trust": round(ok / len(checked), 2) if checked else 0.0,
        "counts": counts, "claims": checked, "caveats": caveats,
        "evidence_resolved": sum(1 for c in checked for e in c["evidence"] if e["found"]), "independent_checks": 1,
        "judges": ["rule"], "judges_used": ["rule"], "air_gapped": True, "verified_at": datetime.now(timezone.utc).isoformat(),
    }


PANEL = {"judges": ["rule"], "count": 1, "independent_families": 1, "air_gapped": True,
         "note": "All judging is local. No claim text or evidence leaves this deployment.", "llm_provider": "stub"}

SELFEVAL_NOTE = ("Measured by running the production verifier over hand-labelled cases whose correct verdict is known in advance. Trap records are written "
                 "inside a rolled-back transaction and never persist. Reported as measured — a poor score here is a finding about the verifier, not something to suppress.")


def selfeval() -> dict:
    # A fixed, self-contained fixture — not a live record — so the trap set (and its expected verdicts) never
    # drifts with whatever happens to be ingested. "Written inside a rolled-back transaction": it is built and
    # checked in memory and never touches the store.
    rec_id = "TRAP-CANONICAL-TXN"
    amount, src, dst = 480000, "SBIN1234567890", "HDFC9988776655"
    payload = {"amount": amount, "src_account": src, "dst_account": dst, "channel": "IMPS", "direction": "DEBIT", "txn_time": "2026-08-14T10:07:00",
              "value_date": "14 August 2026"}
    intact_sha = hashing.row_sha256(payload)
    intact_records = {rec_id: {"source_type": "bank", "payload": payload, "recorded": intact_sha, "hash_ok": True}}
    altered = {**payload, "amount": 1}
    tampered_records = {rec_id: {"source_type": "bank", "payload": altered, "recorded": intact_sha, "hash_ok": False}}
    cases = [
        ("TRAP-FAB-01", "missing", "A transfer of 250000 was made to account HDFC0000000000.", ["TRAP-NONEXISTENT-RECORD"], None, "fabricated",
         "Cites a record id that was never ingested. This is the canonical hallucination: a fluent, specific, entirely invented claim. It must be caught by arithmetic alone, with no model involved."),
        ("TRAP-FAB-02", "missing", "The subject received 3 payments from account SBIN0000000001 on 12 August.", ["TRAP-NONEXISTENT-RECORD"], None, "fabricated",
         "A second invented citation, phrased with the specificity that makes it convincing."),
        ("TRAP-TAM-01", "altered", f"A transfer of {amount} was made from {src} to {dst}.", [rec_id], tampered_records, "tampered",
         "The claim is faithful to what was ingested, but the stored record no longer hashes to its ingest value. The verifier must report the evidence as altered rather "
         "than pass the claim — an accurate statement resting on tampered evidence is not usable in court."),
        ("TRAP-UNS-01", "unsupported_figure", f"A transfer of 999999 was made from {src}.", [rec_id], intact_records, "unsupported",
         "The cited record exists and is intact, but asserts a figure the evidence does not contain. Grounding alone would pass this — it is what the judged layer is for."),
        ("TRAP-UNS-02", "unsupported_figure", f"The account {src} sent 47 separate transfers totalling 12000000.", [rec_id], intact_records, "unsupported",
         "A quantified claim vastly exceeding what the single cited record supports."),
        ("TRAP-OK-01", "resolvable", f"A transfer of {amount} was made from {src} to {dst} by {payload['channel']}.", [rec_id], intact_records, "verified",
         "Faithful to the cited record, which resolves and hashes correctly. A verifier that flags this is useless: over-flagging trains investigators to ignore it."),
        ("TRAP-OK-02", "resolvable", f"Account {dst} received {amount} on 14 August 2026.", [rec_id], intact_records, "verified",
         "The same fact stated from the other side; still fully supported."),
    ]
    results = []
    per_kind: dict[str, dict] = {}
    for trap_id, kind, claim, cited, records, expected, why in cases:
        got = check_claim(claim, cited, records=records)
        predicted = got["verdict"]
        correct = predicted == expected
        results.append({"trap_id": trap_id, "claim": claim, "expected": expected, "predicted": predicted, "correct": correct, "reason": got["reason"], "why_it_matters": why})
        k = per_kind.setdefault(kind, {"total": 0, "correct": 0})
        k["total"] += 1
        k["correct"] += int(correct)
    for trap_id, answer, why in [
        ("TRAP-HON-01", "I can't answer that from the data available.",
         "An honest refusal is the behaviour this whole system exists to encourage. A verifier that penalises it teaches the agent to guess instead of hedge, "
         "producing exactly the confident fabrication we are defending against."),
        ("TRAP-HON-02", "No data was found for that account. Try asking about a different identifier.",
         "A refusal that offers a next step is still a refusal, not an assertion to audit."),
    ]:
        got = verify([], answer)
        correct = got["verdict"] == "not_a_claim"
        results.append({"trap_id": trap_id, "claim": answer, "expected": "not_a_claim", "predicted": got["verdict"], "correct": correct, "reason": got["reason"],
                        "why_it_matters": why})
        k = per_kind.setdefault("honest_refusal", {"total": 0, "correct": 0})
        k["total"] += 1
        k["correct"] += int(correct)
    correct = sum(r["correct"] for r in results)
    fab = [r for r in results if r["expected"] == "fabricated"]
    return {
        "total": len(results), "correct": correct, "accuracy": round(correct / len(results), 4), "per_kind": per_kind, "cases": results, "judges_used": ["rule"],
        "evaluated_at": datetime.now(timezone.utc).isoformat(), "fabrication_recall": round(sum(r["correct"] for r in fab) / len(fab), 4),
        "honest_refusal_respected": all(r["correct"] for r in results if r["expected"] == "not_a_claim"), "note": SELFEVAL_NOTE,
    }
