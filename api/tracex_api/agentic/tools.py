"""The investigator agent's tools.

Design rules, each enforced in code and covered by tests:
  * READ-ONLY. Every tool looks; none writes, approves, freezes or sends. An agent that is fooled — by a bad model,
    or by text planted in the evidence — can therefore mislead a reader but cannot act on the world.
  * Arguments are validated against a strict schema (unknown properties rejected) before any code runs.
  * Output is untrusted DATA: strings are truncated, control characters stripped, and text that reads like an
    instruction ("ignore previous instructions ...") is redacted before it can reach the model. Evidence records
    contain free text written by scammers and victims; that is an injection channel.
  * Each result carries the ids of the records it rests on, so the final answer can cite — and be re-checked against — them.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Callable

from tracex_api.engine import correlate, evidentiary, hunt, scoring
from tracex_api.engine import verify as verifier
from tracex_api.engine.dataset import Dataset

ENTITY_PATTERN = r"^P\d{4}$"
WRITE_VERBS = ("create", "update", "delete", "freeze", "approve", "reject", "execute", "send", "write", "record", "decide", "ingest", "attest")
MAX_STR = 240
REDACTION = "[redacted: instruction-like text in evidence data]"
INJECTION = re.compile(
    r"(ignore|disregard|forget|override)\s+(all|any|the|your|previous|prior|above|earlier)[^.\n]{0,60}(instruction|prompt|rule|guideline)s?"
    r"|you\s+are\s+now\b|\bsystem\s*prompt\b|\bact\s+as\b|\bnew\s+instructions?\b|<\s*/?\s*(system|assistant|tool|user)\s*>"
    r"|reveal\s+(your|the)\s+(prompt|instructions)|\bjailbreak\b",
    re.I,
)
CONTROL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")


class ToolError(ValueError):
    """A tool call that must be refused: unknown tool, bad arguments, unknown entity."""


@dataclass(frozen=True)
class Tool:
    name: str
    description: str
    schema: dict
    fn: Callable[[Dataset, dict], dict]
    read_only: bool = True


def _obj(props: dict, required: list[str]) -> dict:
    return {"type": "object", "properties": props, "required": required, "additionalProperties": False}


ENTITY_ARG = {"entity_id": {"type": "string", "pattern": ENTITY_PATTERN, "description": "An entity id such as P0006."}}


# ---- argument validation and output hygiene -----------------------------------------------------------------------
def validate_args(schema: dict, args) -> dict:
    if not isinstance(args, dict):
        raise ToolError("arguments must be a JSON object")
    props, required = schema["properties"], schema.get("required", [])
    extra = sorted(set(args) - set(props))
    if extra and schema.get("additionalProperties") is False:
        raise ToolError(f"unknown argument(s): {', '.join(extra)}")
    for key in required:
        if key not in args:
            raise ToolError(f"missing required argument: {key}")
    clean = {}
    for key, value in args.items():
        spec = props[key]
        kind = spec["type"]
        if kind == "string":
            if not isinstance(value, str):
                raise ToolError(f"{key} must be a string")
            if len(value) > spec.get("maxLength", 2000):
                raise ToolError(f"{key} is too long")
            if "pattern" in spec and not re.match(spec["pattern"], value):
                raise ToolError(f"{key} does not match the expected format")
        elif kind == "integer":
            if isinstance(value, bool) or not isinstance(value, int):
                raise ToolError(f"{key} must be an integer")
            if not spec.get("minimum", value) <= value <= spec.get("maximum", value):
                raise ToolError(f"{key} must be between {spec.get('minimum')} and {spec.get('maximum')}")
        elif kind == "array":
            if not isinstance(value, list) or len(value) > spec.get("maxItems", 50) or not all(isinstance(v, str) for v in value):
                raise ToolError(f"{key} must be a short list of strings")
        clean[key] = value
    return clean


def sanitize(value, flags: list | None = None):
    """Recursively truncate strings, strip control characters and redact instruction-like text. `flags` collects a
    note per redaction so the caller can record that the evidence attempted an injection."""
    flags = flags if flags is not None else []
    if isinstance(value, str):
        text = CONTROL.sub("", value)
        if INJECTION.search(text):
            flags.append(text[:80])
            text = INJECTION.sub(REDACTION, text)
        return text[:MAX_STR] + ("…" if len(text) > MAX_STR else "")
    if isinstance(value, dict):
        return {k: sanitize(v, flags) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [sanitize(v, flags) for v in value]
    return value


def _entity(ds: Dataset, args: dict) -> str:
    eid = args["entity_id"]
    if eid not in ds.persons:
        raise ToolError(f"no such entity: {eid}")
    return eid


# ---- the tools ----------------------------------------------------------------------------------------------------
def _entity_risk(ds, args):
    eid = _entity(ds, args)
    s = scoring.scores(ds)[eid]
    return {"data": {"entity_id": eid, "name": ds.persons[eid].name, "risk_score": s["risk_score"], "band": s["band"], "model": s["model"],
                     "top_factors": [{"feature": f["feature"], "value": f["value"], "direction": f["direction"]} for f in s["top_factors"][:5]]},
            "evidence": [], "summary": f"{eid} scored {s['risk_score']:.2f} ({s['band']}) by {s['model']}"}


def _top_risk(ds, args):
    items = scoring.ranked(ds)[: args.get("limit", 5)]
    return {"data": {"items": [{"entity_id": s["entity_id"], "name": ds.persons[s["entity_id"]].name, "risk_score": s["risk_score"],
                                "band": s["band"], "model": s["model"]} for s in items]},
            "evidence": [], "summary": f"top {len(items)} entities by risk score"}


def _call_debit(ds, args):
    eid = _entity(ds, args)
    links = sorted((l for l in correlate.call_to_debit(ds) if l["person"] == eid), key=lambda l: l["latency_s"])[:6]
    return {"data": {"entity_id": eid, "links": [{"call_record": l["call_rec_id"], "debit_record": l["debit_rec_id"], "amount_inr": l["amount"],
                                                  "latency_seconds": l["latency_s"], "narration": l["narration"]} for l in links]},
            "evidence": [r for l in links for r in (l["call_rec_id"], l["debit_rec_id"])],
            "summary": f"{len(links)} call-then-debit link(s) for {eid}"}


def _fanout(ds, args):
    eid = _entity(ds, args)
    fans = sorted((f for f in correlate.fanout(ds) if f["person"] == eid), key=lambda f: -f["hop_count"])[:4]
    return {"data": {"entity_id": eid, "patterns": [{"inbound_record": f["inbound_rec_id"], "inbound_amount_inr": f["inbound_amount"],
                                                     "onward_records": f["outbound_rec_ids"][:8], "passthrough_ratio": f["passthrough_ratio"],
                                                     "hops": f["hop_count"]} for f in fans]},
            "evidence": [r for f in fans for r in [f["inbound_rec_id"], *f["outbound_rec_ids"][:8]]],
            "summary": f"{len(fans)} pass-through pattern(s) for {eid}"}


def _device_rotation(ds, args):
    eid = _entity(ds, args)
    devices = [d for d in correlate.imei_persistence(ds, 2) if eid in d["persons"]][:3]
    evidence = []
    for d in devices:
        evidence += [c.rec_id for c in ds.calls if c.imei == d["imei"]][:3]
    return {"data": {"entity_id": eid, "handsets": [{"imei": d["imei"], "sims_seen": d["sim_count"], "numbers": d["numbers"][:6]} for d in devices]},
            "evidence": evidence, "summary": f"{len(devices)} multi-SIM handset(s) for {eid}"}


def _campaigns(ds, args):
    camps = hunt.sweep(ds)["campaigns"][:5]
    return {"data": {"campaigns": [{"campaign_id": c["campaign_id"], "members": c["members"], "typology": c["typology"], "confidence": c["confidence"],
                                    "exposure_inr": c["exposure_inr"]} for c in camps]},
            "evidence": [e for c in camps for l in c["links"][:2] for e in l["evidence"][:2]],
            "summary": f"{len(camps)} coordinated campaign(s) detected"}


def _exculpatory(ds, args):
    eid = _entity(ds, args)
    ex = evidentiary.exculpatory(ds, eid)
    return {"data": {"entity_id": eid, "original_risk_score": ex["original_risk_score"], "adjusted_risk_score": ex["adjusted_risk_score"],
                     "innocent_explanations_that_apply": [{"check": f["check"], "reason": f["reason"]} for f in ex["findings"] if f["applies"]],
                     "checks_that_do_not_apply": [f["check"] for f in ex["findings"] if not f["applies"]]},
            "evidence": [], "summary": f"{len(ex['applied'])} innocent explanation(s) apply to {eid}"}


def _lookup(ds, args):
    rid = args["record_id"]
    found = verifier._lookup(rid)
    if found is None:
        raise ToolError(f"no record with id {rid}")
    return {"data": {"record_id": rid, "source_type": found["source_type"], "intact": found["hash_ok"], "fields": found["payload"]},
            "evidence": [rid], "summary": f"{found['source_type']} record {rid}"}


def _verify_claim(ds, args):
    check = verifier.check_claim(args["claim"], args.get("cited_records") or [])
    return {"data": {"verdict": check["verdict"], "reason": check["reason"]}, "evidence": [], "summary": f"claim check: {check['verdict']}"}


TOOLS: dict[str, Tool] = {t.name: t for t in [
    Tool("get_entity_risk", "The trained model's risk score for one entity, its band, and the features that drive it. A score ranks a review queue; it is not evidence of guilt.",
         _obj(ENTITY_ARG, ["entity_id"]), _entity_risk),
    Tool("list_top_risk", "The highest-scoring entities in the case, most suspicious first.",
         _obj({"limit": {"type": "integer", "minimum": 1, "maximum": 10}}, []), _top_risk),
    Tool("get_call_debit_links", "Calls that reached this entity followed within hours by a debit from their account, with record ids and latency.",
         _obj(ENTITY_ARG, ["entity_id"]), _call_debit),
    Tool("get_fanout_patterns", "Money that arrived in this entity's account and was passed on almost immediately across several accounts.",
         _obj(ENTITY_ARG, ["entity_id"]), _fanout),
    Tool("get_device_rotation", "Handsets used by this entity that carried several SIM cards (burner rotation).",
         _obj(ENTITY_ARG, ["entity_id"]), _device_rotation),
    Tool("get_campaigns", "Coordinated fraud campaigns found across the whole case: linked members, typology, confidence and rupee exposure.",
         _obj({}, []), _campaigns),
    Tool("check_exculpatory", "The innocent explanations that fit this entity's pattern equally well (a busy business, a shared household phone). ALWAYS consult before concluding anything about a person.",
         _obj(ENTITY_ARG, ["entity_id"]), _exculpatory),
    Tool("lookup_record", "The stored fields of one evidence record by id (CDR/IPDR/TXN/SOC/ALP), and whether it still matches its ingest hash.",
         _obj({"record_id": {"type": "string", "pattern": r"^[A-Z]{3,4}\d{5}$"}}, ["record_id"]), _lookup),
    Tool("verify_claim", "Check one sentence against the records it cites: fabricated, tampered, unsupported or verified. Use to test a claim before you assert it.",
         _obj({"claim": {"type": "string", "maxLength": 500}, "cited_records": {"type": "array", "maxItems": 10}}, ["claim"]), _verify_claim),
]}

# The registry is checked when the module loads: an agent tool that could act would be a design error, not a runtime one.
for _t in TOOLS.values():
    assert _t.read_only and not _t.name.startswith(WRITE_VERBS), f"tool {_t.name} is not read-only"


def specs(tools: dict[str, Tool] = TOOLS) -> list[dict]:
    return [{"name": t.name, "description": t.description, "schema": t.schema} for t in tools.values()]


def execute(ds: Dataset, name: str, args, tools: dict[str, Tool] = TOOLS) -> tuple[dict, list]:
    """Run one tool call. Returns (sanitised result, injection flags). Raises ToolError for a refused call."""
    tool = tools.get(name)
    if tool is None:
        raise ToolError(f"unknown tool {name!r}; available: {', '.join(tools)}")
    clean = validate_args(tool.schema, args)
    result = tool.fn(ds, clean)
    flags: list = []
    result = {**result, "data": sanitize(result["data"], flags)}
    result["evidence"] = list(dict.fromkeys(result["evidence"]))  # de-duplicated, order kept
    return result, flags
