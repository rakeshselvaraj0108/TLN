"""Routes tagged "overview"."""
from __future__ import annotations

from fastapi import APIRouter, Depends

from tracex_api import evidence
from tracex_api.auth import User, current_user
from tracex_api.engine import correlate, scoring
from tracex_api.engine.dataset import current

router = APIRouter(tags=["overview"])


@router.get("/overview", summary="Overview")
def overview(user: User = Depends(current_user)):
    ds = current()
    counts = evidence.counts()
    sources = {k: counts.get(k, 0) for k in ["ipdr", "alpr", "bank", "cdr", "social"]}
    ranked = scoring.ranked(ds)
    bands = {"elevated": 0, "high": 0, "low": 0}
    for s in ranked:
        bands[s["band"]] += 1
    c2d = correlate.call_to_debit(ds)
    fast = [l for l in c2d if l["latency_s"] <= scoring.FAST_LATENCY_S]
    fan = correlate.fanout(ds)
    lead = None
    if fast:
        best = max(fast, key=lambda l: (l["amount"], -l["latency_s"]))
        person_fan = [l for l in fan if l["person"] == best["person"]]
        lead = {
            "person": best["person"], "caller": best["caller"], "latency_s": best["latency_s"], "amount": best["amount"],
            "narration": best["narration"], "debit_time": best["debit_time"],
            "passthrough_ratio": max((l["passthrough_ratio"] for l in person_fan), default=None),
            "fanout_hops": max((l["hop_count"] for l in person_fan), default=None),
        }
    return {
        "sources": sources,
        "total_records": sum(sources.values()),
        "scored": len(ranked),
        "bands": bands,
        "signals": {
            "fast_call_to_debit": len(fast),
            "fanout_patterns": len(fan),
            "imei_persistence_devices": len(correlate.imei_persistence(ds, 3)),
        },
        "lead": lead,
        "top_entities": [{k: s[k] for k in ("entity_id", "risk_score", "band")} for s in ranked[:5]],
        "ready": bool(ranked),
        "engine": "local",
    }
