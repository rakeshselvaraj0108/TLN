"""Grounded prose.

`compose_from_results` is the deterministic fallback's template: it writes an answer from tool results, citing the
records they came with. `write_report` asks a real model for the pipeline's run-report narrative — and refuses the
result if it contains a number that is not in the facts it was given, so a model cannot slip an invented figure into
a report a human will read.
"""
from __future__ import annotations

import json
import re

NUMBER = re.compile(r"\d[\d,]*(?:\.\d+)?")
REPORT_SYSTEM = (
    "You write a short run report for fraud investigators from a JSON facts object. Use ONLY the facts given: do not add, "
    "round, convert or infer any number, name or claim that is not present. Write at most four plain sentences. "
    "You describe; you do not score, decide or recommend action."
)


def _money(v) -> str:
    """Rupees exactly as the record holds them — rounding here would put a figure in the answer that no record contains."""
    v = float(v)
    return f"₹{int(v):,}" if v == int(v) else f"₹{v:,.2f}"


def compose_from_results(objective: str, results: list[dict]) -> str:
    """Template answer from tool results (each: {"tool", "data", "evidence"} or {"tool", "error"})."""
    by = {r["tool"]: r for r in results if "data" in r}
    errors = [r for r in results if "error" in r]
    lines: list[str] = []
    risk = by.get("get_entity_risk")
    if risk:
        d = risk["data"]
        lead = ", ".join(f["feature"] for f in d["top_factors"][:3])
        lines.append(f"{d['entity_id']} ({d['name']}) is scored {d['risk_score']:.2f} ({d['band']}) by the {d['model']} model; the leading factors are {lead}. "
                     "That ranks the entity for review and is not a finding.")
    top = by.get("list_top_risk")
    if top:
        ranked = "; ".join(f"{i['entity_id']} ({i['name']}) {i['risk_score']:.2f}" for i in top["data"]["items"])
        lines.append(f"The highest-scoring entities are {ranked}.")
    links = by.get("get_call_debit_links")
    if links and links["data"]["links"]:
        for l in links["data"]["links"][:3]:
            lines.append(f"A call reached {links['data']['entity_id']} and {_money(l['amount_inr'])} left the account soon afterwards [{l['call_record']}, {l['debit_record']}].")
    fan = by.get("get_fanout_patterns")
    if fan and fan["data"]["patterns"]:
        f = fan["data"]["patterns"][0]
        cites = ", ".join([f["inbound_record"], *f["onward_records"][:3]])
        lines.append(f"{_money(f['inbound_amount_inr'])} arrived and about {round(f['passthrough_ratio'] * 100)}% was passed on across {f['hops']} account(s) [{cites}].")
    dev = by.get("get_device_rotation")
    if dev and dev["data"]["handsets"]:
        cites = ", ".join(dev["evidence"][:3])
        sims = dev["data"]["handsets"][0]["sims_seen"]
        lines.append(f"A handset used by {dev['data']['entity_id']} carried {sims} SIM cards" + (f" [{cites}]." if cites else "."))
    camp = by.get("get_campaigns")
    if camp and camp["data"]["campaigns"]:
        c = camp["data"]["campaigns"][0]
        lines.append(f"{len(camp['data']['campaigns'])} coordinated campaign(s) were detected; the strongest is {c['campaign_id']} linking {len(c['members'])} entities ({c['typology']}).")
    exc = by.get("check_exculpatory")
    if exc and exc["data"]["innocent_explanations_that_apply"]:
        names = ", ".join(x["check"].replace("_", " ") for x in exc["data"]["innocent_explanations_that_apply"])
        lines.append(f"Counter-evidence: the pattern also fits an innocent explanation ({names}); a human reviewer should weigh it before any conclusion.")
    elif exc:
        lines.append("No innocent explanation checked here fits this pattern, which does not make it proof.")
    if not lines:
        why = errors[0]["error"] if errors else "none of the tools returned anything relevant"
        return f"I could not establish an answer from the records: {why}. I would rather say that than guess."
    lines.append("Everything above is a lead for human review, not a determination of guilt.")
    return " ".join(lines)


def ungrounded_numbers(text: str, facts: dict) -> list[str]:
    """Numbers in `text` that do not appear anywhere in `facts` (comparison ignores thousands separators)."""
    norm = lambda s: s.replace(",", "").rstrip(".")
    allowed = {norm(n) for n in NUMBER.findall(json.dumps(facts, default=str))}
    return sorted({n for n in NUMBER.findall(text) if norm(n) not in allowed})


def write_report(provider, facts: dict) -> tuple[str | None, dict]:
    """A model-written narrative from `facts`, or None with the reason it was not used."""
    if getattr(provider, "deterministic", False):
        return None, {"used": False, "reason": "deterministic provider: the template narrative is used"}
    from tracex_api.agentic.providers import ProviderError

    try:
        turn = provider.complete(REPORT_SYSTEM, [{"role": "user", "content": json.dumps(facts, default=str)}], [], max_tokens=300)
    except ProviderError as exc:
        return None, {"used": False, "reason": f"provider failed: {exc}"}
    text = turn.text.strip()
    bad = ungrounded_numbers(text, facts)
    if not text:
        return None, {"used": False, "reason": "empty reply", "usage": turn.usage}
    if bad:
        return None, {"used": False, "reason": f"rejected: figures not present in the facts: {', '.join(bad)}", "usage": turn.usage}
    return text, {"used": True, "provider": provider.name, "model": provider.model, "usage": turn.usage}
