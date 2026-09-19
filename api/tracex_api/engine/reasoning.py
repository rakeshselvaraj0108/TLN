"""Reasoning ledger and the eight-stage investigation pipeline.

A session is the continuation state of an investigation: what was observed, what was inferred, which
hypotheses are open and what contradicts them, what has been concluded (only on live evidence), what is
still unanswered, and a replayable trace of every step — failures included.
"""
from __future__ import annotations

import json
import time
import uuid
from datetime import datetime, timezone

from fastapi import HTTPException

from tracex_api import audit, db, hashing
from tracex_api.engine import correlate, evidentiary, graphs, scoring
from tracex_api.engine.dataset import current

EPISTEMIC = {"observed", "inferred", "hypothesis", "assumption"}
RELATIONS = {"supports", "contradicts", "derives", "refines"}
REFUTED_BELOW = 0.2
SUPPORT_STEP = 0.2


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


# ---- providers ---------------------------------------------------------------------------------------
def providers() -> dict:
    """Which language-model provider is active, and whether it keeps evidence on this machine. Delegates to the provider
    layer so this endpoint can never disagree with what the agent actually runs."""
    from tracex_api.agentic import providers as llm

    return llm.status()


# ---- storage -----------------------------------------------------------------------------------------
def _from_seed(doc: dict) -> dict:
    """Seeded sessions were captured as API views; fold them back into ledger form."""
    s, d = doc["summary"], doc.get("detail") or {}
    claims = doc.get("claims") or []
    links = []
    for c in d.get("contradictions", []):
        claim = next((x for x in claims if x["statement"] == c["statement"]), None)
        if claim:
            links.append({"id": len(links) + 1, "claim_id": claim["id"], "hypothesis_id": None, "target_claim_id": None,
                          "relation": "contradicts", "weight": c["weight"], "rationale": c["rationale"], "created_at": s["updated_at"]})
    return {
        "session_key": s["session_key"], "objective": s["objective"], "user_intent": "", "case_id": s["case_id"], "status": s["status"],
        "opened_by": s["opened_by"], "created_at": s["updated_at"], "updated_at": s["updated_at"], "claims": claims,
        "hypotheses": doc.get("hypotheses") or [], "links": links, "conclusions": d.get("conclusions", []),
        "trace": doc.get("trace") or [], "pending": d.get("pending", []),
    }


def _all() -> list[dict]:
    return [_from_seed(doc) if "summary" in doc else doc for doc in db.doc_list("reasoning")]


def load(session_key: str) -> dict:
    doc = db.doc_get("reasoning", session_key)
    if doc is None:
        raise HTTPException(status_code=404, detail=f"no reasoning session {session_key}")
    return _from_seed(doc) if "summary" in doc else doc


def save(session: dict) -> None:
    session["updated_at"] = _now()
    db.doc_put("reasoning", session["session_key"], session)


def _next_id(s: dict, kind: str) -> int:
    """Claim and hypothesis ids are unique across the whole ledger, as in the original store."""
    stored = max((x["id"] for other in _all() if other["session_key"] != s["session_key"] for x in other[kind]), default=0)
    return max(stored, max((x["id"] for x in s[kind]), default=0)) + 1


def summary(s: dict) -> dict:
    return {"session_key": s["session_key"], "objective": s["objective"], "status": s["status"], "case_id": s["case_id"],
            "action_count": len(s["trace"]), "opened_by": s["opened_by"], "updated_at": s["updated_at"]}


def list_sessions(status: str | None, limit: int) -> list[dict]:
    rows = [summary(s) for s in _all() if status is None or s["status"] == status]
    return sorted(rows, key=lambda r: r["updated_at"], reverse=True)[:limit]


def open_session(objective: str, user_intent: str = "", case_id: str | None = None, session_key: str | None = None,
                 opened_by: str = "system") -> dict:
    if not objective.strip():
        raise HTTPException(status_code=422, detail="objective is empty")
    key = session_key or f"S-{uuid.uuid4().hex[:12]}"
    if db.doc_get("reasoning", key):
        raise HTTPException(status_code=409, detail=f"reasoning session {key} already exists")
    if case_id and not db.query_one("SELECT 1 FROM cases WHERE case_code = ?", (case_id,)):
        raise HTTPException(status_code=404, detail=f"no case {case_id}")
    now = _now()
    session = {"session_key": key, "objective": objective, "user_intent": user_intent, "case_id": case_id, "status": "active",
               "opened_by": opened_by, "created_at": now, "updated_at": now, "claims": [], "hypotheses": [], "links": [],
               "conclusions": [], "trace": [], "pending": []}
    save(session)
    return session


# ---- ledger operations ---------------------------------------------------------------------------------
def _verify_citation(source_ref: str | None, row_sha256: str | None) -> str:
    """A claim that pins a record hash is checked against the store: the record must exist, still re-hash to its
    ingest value, and match the hash the claim was written against."""
    if not source_ref or not row_sha256:
        return "unverified"
    row = db.query_one("SELECT payload, row_sha256 FROM records WHERE record_id = ? ORDER BY id LIMIT 1", (source_ref,))
    if row is None:
        return "not_found"
    live = hashing.row_sha256(json.loads(row["payload"]))
    return "verified" if live == row["row_sha256"] == row_sha256 else "hash_mismatch"


def _unit(value, default: float) -> float:
    return round(min(1.0, max(0.0, default if value is None else value)), 4)


def add_claim(s: dict, body: dict) -> dict:
    if body["epistemic_class"] not in EPISTEMIC:
        raise HTTPException(status_code=422, detail=f"epistemic_class must be one of {sorted(EPISTEMIC)}")
    if not body["statement"].strip():
        raise HTTPException(status_code=422, detail="statement is empty")
    known = {c["id"] for c in s["claims"]}
    unknown = [i for i in body.get("derived_from") or [] if i not in known]
    if unknown:
        raise HTTPException(status_code=422, detail=f"derived_from cites claim(s) not in this session: {unknown}")
    claim = {"id": _next_id(s, "claims"), "epistemic_class": body["epistemic_class"], "statement": body["statement"],
             "subject_entity_id": body.get("subject_entity_id"), "source_kind": body.get("source_kind") or "agent",
             "source_ref": body.get("source_ref"), "row_sha256": body.get("row_sha256"),
             "reliability": _unit(body.get("reliability"), 0.5), "confidence": _unit(body.get("confidence"), 0.5),
             "verified": _verify_citation(body.get("source_ref"), body.get("row_sha256")), "retracted": False}
    if body.get("derived_from"):
        claim["derived_from"] = body["derived_from"]
    s["claims"].append(claim)
    return claim


def add_hypothesis(s: dict, body: dict) -> dict:
    if not body["statement"].strip():
        raise HTTPException(status_code=422, detail="statement is empty")
    prior = round(_unit(body.get("prior"), 0.5), 3)
    h = {"id": _next_id(s, "hypotheses"), "statement": body["statement"], "status": "open", "prior": prior, "confidence": prior,
         "support_count": 0, "contradiction_count": 0, "subject_entity_id": body.get("subject_entity_id")}
    if body.get("alternatives"):
        h["alternatives"] = body["alternatives"]
    s["hypotheses"].append(h)
    return h


def _restatus(h: dict) -> None:
    if h["confidence"] < REFUTED_BELOW:
        h["status"] = "refuted"
    elif h["contradiction_count"] > h["support_count"]:
        h["status"] = "contradicted"
    elif h["support_count"] > h["contradiction_count"]:
        h["status"] = "supported"
    else:
        h["status"] = "open"


def add_link(s: dict, body: dict) -> dict:
    if body["relation"] not in RELATIONS:
        raise HTTPException(status_code=422, detail=f"relation must be one of {sorted(RELATIONS)}")
    if not any(c["id"] == body["claim_id"] for c in s["claims"]):
        raise HTTPException(status_code=404, detail=f"claim {body['claim_id']} is not in this session")
    h = None
    if body.get("hypothesis_id") is not None:
        h = next((x for x in s["hypotheses"] if x["id"] == body["hypothesis_id"]), None)
        if h is None:
            raise HTTPException(status_code=404, detail=f"hypothesis {body['hypothesis_id']} is not in this session")
    if body.get("target_claim_id") is not None and not any(c["id"] == body["target_claim_id"] for c in s["claims"]):
        raise HTTPException(status_code=404, detail=f"claim {body['target_claim_id']} is not in this session")
    if h is None and body.get("target_claim_id") is None:
        raise HTTPException(status_code=422, detail="a link needs a hypothesis_id or a target_claim_id")
    weight = _unit(body.get("weight"), 1.0)
    link = {"id": max((l["id"] for l in s["links"]), default=0) + 1, "claim_id": body["claim_id"], "hypothesis_id": body.get("hypothesis_id"),
            "target_claim_id": body.get("target_claim_id"), "relation": body["relation"], "weight": weight,
            "rationale": body.get("rationale") or "", "created_at": _now()}
    s["links"].append(link)
    if h is not None and body["relation"] in ("supports", "contradicts"):
        if body["relation"] == "supports":
            h["support_count"] += 1
            h["confidence"] = round(min(1.0, h["confidence"] + SUPPORT_STEP * weight), 3)
        else:
            h["contradiction_count"] += 1
            h["confidence"] = round(max(0.0, h["confidence"] - SUPPORT_STEP * weight), 3)
        _restatus(h)
    if body["relation"] == "contradicts" and body.get("target_claim_id") is not None:
        target = next(c for c in s["claims"] if c["id"] == body["target_claim_id"])
        if target["verified"] not in ("not_found", "hash_mismatch"):  # those already say more than "disputed"
            target["verified"] = "contradicted"
    return link


def conclude(s: dict, body: dict) -> dict:
    claims = {c["id"]: c for c in s["claims"]}
    unknown = [i for i in body["supporting"] if i not in claims]
    if unknown:
        raise HTTPException(status_code=422, detail=f"supporting claim(s) not in this session: {unknown}")
    live = [i for i in body["supporting"] if not claims[i]["retracted"]]
    if not live:
        raise HTTPException(status_code=422, detail="a conclusion must cite at least one live (unretracted) claim")
    conclusion = {"id": max((c["id"] for c in s["conclusions"]), default=0) + 1, "statement": body["statement"], "supporting": live,
                  "subject_entity_id": body.get("subject_entity_id"), "concluded_at": _now()}
    s["conclusions"].append(conclusion)
    return conclusion


TRACE_FIELDS = ("stage", "action", "tool_name", "outcome", "result_digest", "info_gain", "redundant", "provider", "model",
                "tokens_in", "tokens_out", "latency_ms", "error")


def add_transition(s: dict, body: dict) -> dict:
    step = {"seq": len(s["trace"]) + 1, **{k: body.get(k) for k in TRACE_FIELDS}}
    if body.get("args"):
        step["args"] = body["args"]
    s["trace"].append(step)
    return step


def _failed(t: dict) -> bool:
    return t.get("outcome") not in ("ok", "empty", "skipped")


def detail(s: dict) -> dict:
    live = [c for c in s["claims"] if not c["retracted"]]
    by_id = {c["id"]: c for c in s["claims"]}
    trace = s["trace"]
    gain = sum(t.get("info_gain") or 0 for t in trace)
    return {
        "session_key": s["session_key"], "objective": s["objective"], "status": s["status"], "action_count": len(trace),
        "observed": [c["statement"] for c in reversed(live) if c["epistemic_class"] == "observed"],
        "inferred": [c["statement"] for c in reversed(live) if c["epistemic_class"] == "inferred"],
        "open_hypotheses": [{"id": h["id"], "statement": h["statement"], "status": h["status"], "confidence": h["confidence"],
                             "support": h["support_count"], "contradiction": h["contradiction_count"]}
                            for h in s["hypotheses"] if h["status"] != "refuted"],
        "contradictions": [{"statement": by_id[l["claim_id"]]["statement"], "rationale": l["rationale"], "weight": l["weight"]}
                           for l in s["links"] if l["relation"] == "contradicts" and l["claim_id"] in by_id],
        "conclusions": s["conclusions"], "pending": s["pending"],
        # A short human-readable line per dead end — rendered as plain text alongside pending/unresolved,
        # so this stays a list of strings rather than the raw trace rows (those are in the trace table already).
        "failed": [f"{t['stage']}: {t['action']}" + (f" — {t['error']}" if t.get("error") else f" ({t['outcome']})") for t in trace if _failed(t)],
        "unresolved": [h["statement"] for h in s["hypotheses"] if h["status"] == "open"],
        "efficiency": {
            "actions": len(trace), "failed_actions": sum(1 for t in trace if _failed(t)),
            "redundant_actions": sum(1 for t in trace if t.get("redundant")), "total_info_gain": gain,
            "gain_per_action": round(gain / len(trace), 3) if trace else 0,
            "tokens_in": sum(t.get("tokens_in") or 0 for t in trace), "tokens_out": sum(t.get("tokens_out") or 0 for t in trace),
            "total_latency_ms": sum(t.get("latency_ms") or 0 for t in trace),
        },
    }


# ---- the eight-stage pipeline ---------------------------------------------------------------------------
OBJECTIVE = "Automated pipeline pass over the ingested corpus"
QUESTIONS = [
    "Which entities show a call followed closely by a large debit?",
    "Does any account move most of what it receives straight onward?",
    "Is any handset cycling SIMs while the people it calls move money?",
    "For each of the above: is there an innocent explanation that fits equally well?",
]
# The checks the critic raises as counter-evidence. `fixed_beneficiary_no_onward` post-dates the captured pipeline
# runs, which never raised it; it remains available on the exculpatory endpoint.
CRITIC_CHECKS = {"stable_counterparties", "longlived_sims_no_money_coupling"}
PROPOSALS_PER_HYPOTHESIS = 3
DISCLAIMER = ("Automated leads for human review, not findings. Scores rank the queue, the critic's counter-evidence is recorded "
              "against every hypothesis it weakens, and no action was executed.")


def run_pipeline(user: str, skip_ingest: bool = False) -> dict:
    started = time.perf_counter()
    ds = current()
    s = open_session(OBJECTIVE, opened_by="agent:pipeline")
    log: list[dict] = []
    ctx: dict = {}

    def step(stage: str, agent: str, action: str, tool: str | None, fn) -> None:
        t0 = time.perf_counter()
        extra: dict = {}
        try:
            outcome, digest, gain, extra = fn()
            error = None
        except Exception as exc:  # recorded with its real outcome; a gap would read as if the step never ran
            outcome, digest, gain, error = "error", f"{type(exc).__name__}: {exc}", 0, str(exc)
        add_transition(s, {"stage": stage, "action": action, "tool_name": tool, "outcome": outcome, "result_digest": digest,
                           "info_gain": gain, "redundant": False, "provider": extra.get("provider"), "model": extra.get("model"),
                           "tokens_in": extra.get("tokens_in", 0), "tokens_out": extra.get("tokens_out", 0),
                           "latency_ms": round((time.perf_counter() - t0) * 1000), "error": error})
        log.append({"agent": agent, "msg": digest if outcome != "error" else f"FAILED — {digest}"})

    def planner():
        s["pending"] = list(QUESTIONS)
        return "ok", "; ".join(QUESTIONS), 0, {}

    def investigator():
        # The evidence is already in the store, and ingest deduplicates by file hash, so no new source is added either way.
        ctx["sources"] = 0
        note = " (ingest skipped)" if skip_ingest else ""
        return "ok", f"0 source(s){note}; graph now {graphs.stats(ds)}", 0, {}

    def correlator():
        n_ids = sum(len(p.phones) + len(p.devices) + len(p.accounts) + len(p.handles) for p in ds.persons.values())
        add_claim(s, {"epistemic_class": "inferred",
                      "statement": f"{n_ids} identifiers resolve to {len(ds.persons)} distinct actors under the deterministic union-find rules",
                      "source_kind": "derived", "source_ref": "services.resolve", "reliability": 0.9, "confidence": 0.85})
        return "ok", f"{n_ids} identifiers -> {len(ds.persons)} persons", len(ds.persons), {}

    def analyst():
        ranked = scoring.ranked(ds)
        fast = sorted({l["debit_rec_id"]: l for l in correlate.call_to_debit(ds) if l["latency_s"] < scoring.FAST_LATENCY_S}.values(),
                      key=lambda l: l["latency_s"])
        fanouts, multisim = correlate.fanout(ds), correlate.imei_persistence(ds)
        for l in fast:
            add_claim(s, {"epistemic_class": "inferred", "statement": f"call to an entity was followed by a debit {l['latency_s']}s later",
                          "source_kind": "derived", "source_ref": "services.correlate.call_to_debit_links", "reliability": 0.9, "confidence": 0.85})
        flagged = [r for r in ranked if r["band"] != "low"]
        for r in flagged:
            add_hypothesis(s, {"statement": f"{r['entity_id']} warrants review for coordinated fraud involvement",
                               "subject_entity_id": r["entity_id"], "prior": r["risk_score"]})
        model = "+".join(sorted({r["model"] for r in ranked}))
        ctx.update(ranked=ranked, fast=fast, fanouts=fanouts, multisim=multisim)
        return ("ok", f"scored {len(ranked)} (model={model}); {len(flagged)} hypotheses proposed",
                len(fast) + len(fanouts) + len(multisim), {"model": model})

    def critic():
        counter = 0
        for h in s["hypotheses"]:
            ex = evidentiary.exculpatory(ds, h["subject_entity_id"])
            for f in ex["findings"]:
                if not f["applies"] or f["check"] not in CRITIC_CHECKS:
                    continue
                c = add_claim(s, {"epistemic_class": "inferred", "statement": f["reason"], "subject_entity_id": h["subject_entity_id"],
                                  "source_kind": "derived", "source_ref": "services.exculpatory", "reliability": 0.85,
                                  "confidence": round(0.5 + f["confidence_reduction"], 3)})
                add_link(s, {"claim_id": c["id"], "hypothesis_id": h["id"], "relation": "contradicts",
                             "weight": round(2 * f["confidence_reduction"], 4), "rationale": f"exculpatory: {f['check']}"})
                counter += 1
        refuted = sum(1 for h in s["hypotheses"] if h["status"] == "refuted")
        return "ok", f"{len(s['hypotheses'])} hypothesis/es challenged, {counter} piece(s) of counter-evidence, {refuted} refuted", counter, {}

    def verifier():
        pinned = [c for c in s["claims"] if c.get("row_sha256")]
        for c in pinned:
            c["verified"] = _verify_citation(c["source_ref"], c["row_sha256"])
        ok = sum(1 for c in pinned if c["verified"] == "verified")
        return ("ok" if pinned else "empty"), f"{len(pinned)} claim(s): {ok} verified, {len(pinned) - ok} unsupported", ok, {}

    def responder():
        live = [h for h in s["hypotheses"] if h["status"] != "refuted"]
        skipped = len(s["hypotheses"]) - len(live)
        return ("ok", f"{len(live) * PROPOSALS_PER_HYPOTHESIS} proposal(s) for {len(live)} live hypothesis/es; {skipped} refuted subject(s) skipped",
                0, {})

    def auditor():
        from tracex_api.agentic import narrate
        from tracex_api.agentic.providers import select_provider

        ranked = ctx.get("ranked") or scoring.ranked(ds)
        high = sum(1 for r in ranked if r["band"] == "high")
        elevated = sum(1 for r in ranked if r["band"] == "elevated")
        headline = (f"{len(ranked)} entities scored across {ctx.get('sources', 0)} sources: {high} high-risk, {elevated} elevated. "
                    f"{len(ctx.get('fast', []))} call->debit coupling(s) under 10 min, {len(ctx.get('fanouts', []))} fan-out pattern(s), "
                    f"{len(ctx.get('multisim', []))} multi-SIM device(s).")
        lines, facts_h = [], []
        for h in s["hypotheses"]:
            against = [l for l in s["links"] if l["hypothesis_id"] == h["id"] and l["relation"] == "contradicts"]
            facts_h.append({"entity": h["subject_entity_id"], "score": f"{h['prior']:.2f}", "confidence_after_challenge": f"{h['confidence']:.2f}",
                            "innocent_explanations": [l["rationale"].split(": ", 1)[-1].replace("_", " ") for l in against]})
            if against:
                checks = ", ".join(l["rationale"].split(": ", 1)[-1].replace("_", " ") for l in against)
                lines.append(f"{h['subject_entity_id']} (score {h['prior']:.2f}): the critic found an innocent explanation ({checks}); "
                             f"confidence {h['confidence']:.2f}.")
            else:
                lines.append(f"{h['subject_entity_id']} (score {h['prior']:.2f}): no innocent explanation fits; open for review.")
        template = " ".join(lines) if lines else "No entity scored above the low band; nothing was proposed for review."
        provider, selection = select_provider()
        facts = {"headline": headline, "hypotheses": facts_h}
        written, note = narrate.write_report(provider, facts)  # a real model's prose, refused if it invents a figure
        narrative = written or template
        used = bool(written)
        ctx["report"] = {"headline": headline, "narrative": narrative, "llm_provider": provider.name if used else "stub", "disclaimer": DISCLAIMER}
        if not used and not provider.deterministic:
            ctx["report"]["narrative_note"] = note.get("reason")
        prompt = f"Summarise: {headline} hypotheses={len(s['hypotheses'])} contradictions={len(s['links'])}"
        usage = note.get("usage") or {"in": len(prompt.split()), "out": len(narrative.split())}
        return "ok", headline, 0, {"provider": provider.name if used else "stub", "model": provider.model if used else "deterministic-templates",
                                   "tokens_in": usage["in"], "tokens_out": usage["out"]}

    step("planner", "Planner", "set_objectives", None, planner)
    step("investigator", "Investigator", "ingest_sources", "ingest_bytes", investigator)
    step("correlator", "Correlator", "resolve_identities", "resolve", correlator)
    step("analyst", "Analyst", "score_and_correlate", "scoring+correlate", analyst)
    step("critic", "Critic", "challenge_hypotheses", None, critic)
    step("verifier", "Verifier", "ground_claims", None, verifier)
    step("responder", "Responder", "propose_actions", None, responder)
    step("auditor", "Auditor", "generate_run_report", "provider_harness", auditor)
    save(s)

    failed = [t for t in s["trace"] if _failed(t)]
    elapsed = round(time.perf_counter() - started, 2)
    audit.record(user, "agents.pipeline.run", "reasoning_session", s["session_key"],
                 f"{len(s['trace'])} stages, {len(failed)} failed, {len(s['hypotheses'])} hypotheses, {elapsed}s")
    return {
        "ok": not failed, "engine": "local", "elapsed_s": elapsed, "session_key": s["session_key"],
        "error": "; ".join(f"{t['stage']}: {t['error']}" for t in failed) or None, "log": log,
        "report": ctx.get("report") or {"headline": "The run did not complete; see the trace.", "narrative": "", "llm_provider": "stub",
                                        "disclaimer": DISCLAIMER},
    }
