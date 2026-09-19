"""Routes tagged "intel"."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query

from tracex_api import audit
from tracex_api.auth import User, current_user
from tracex_api.engine import correlate, scoring
from tracex_api.engine.dataset import current

router = APIRouter(tags=["intel"])


@router.post("/intel/analyze", summary="Analyze")
def analyze(user: User = Depends(current_user)):
    """Re-run correlation and scoring over the current evidence."""
    ds = current()
    ds._cache.clear()
    scored = scoring.scores(ds)
    models = {s["model"] for s in scored.values()}
    bands: dict[str, int] = {}
    for s in scored.values():
        bands[s["band"]] = bands.get(s["band"], 0) + 1
    model = "+".join(sorted(models))
    audit.record(user.username, "intel.analyze", "graph", None, f"scored={len(scored)} model={model} engine=local")
    return {
        "scored": len(scored),
        "model": model, "models": sorted(models), "bands": bands,
        "call_to_debit_links": len(correlate.call_to_debit(ds)),
        "fanout_links": len(correlate.fanout(ds)),
        "imei_persistence_devices": len(correlate.imei_persistence(ds, 3)),
        "engine": "local",
    }


@router.get("/intel/correlations/call-to-debit", summary="Call To Debit")
def call_to_debit(window_s: int = Query(10800, ge=60, le=86400), user: User = Depends(current_user)):
    links = correlate.call_to_debit(current(), window_s)
    return {"window_s": window_s, "count": len(links), "links": links, "engine": "local"}


@router.get("/intel/correlations/fanout", summary="Fanout")
def fanout(window_s: int = Query(1800, ge=60), min_ratio: float = Query(0.7), max_ratio: float = Query(1.5), user: User = Depends(current_user)):
    links = correlate.fanout(current(), window_s, min_ratio, max_ratio)
    return {"window_s": window_s, "min_ratio": min_ratio, "max_ratio": max_ratio, "count": len(links), "links": links, "engine": "local"}


@router.get("/intel/detections/imei-persistence", summary="Imei Persistence")
def imei_persistence(min_sims: int = Query(2, ge=1), user: User = Depends(current_user)):
    devices = correlate.imei_persistence(current(), max(min_sims, 3) if min_sims <= 3 else min_sims)
    return {"min_sims": min_sims, "count": len(devices), "devices": devices, "engine": "local"}


@router.get("/intel/queue", summary="Queue")
def queue(band: str | None = Query(None), limit: int = Query(100, ge=1, le=1000), user: User = Depends(current_user)):
    items = [
        {k: s[k] for k in ("entity_id", "risk_score", "band", "model", "computed_at", "top_factors")}
        for s in scoring.ranked(current()) if band is None or s["band"] == band
    ][:limit]
    return {"count": len(items), "items": items}


@router.get("/intel/entity/{entity_id}", summary="Entity")
def entity(entity_id: str, user: User = Depends(current_user)):
    ds = current()
    person = ds.persons.get(entity_id)
    if person is None:
        raise HTTPException(status_code=404, detail="no such entity in the graph")
    score = scoring.scores(ds)[entity_id]
    identifiers = (
        [{"kind": "Account", "props": {"number": a, "ifsc": ds.account_ifsc.get(a)}} for a in person.accounts]
        + [{"kind": "Device", "props": {"imei": d}} for d in person.devices]
        + [{"kind": "Phone", "props": {"msisdn": p}} for p in person.phones]
        + [{"kind": "SocialHandle", "props": {"handle": h["handle"], "platform": h["platform"]}} for h in person.handles]
    )
    audit.record(user.username, "intel.entity.view", "entity", entity_id)
    return {
        "entity_id": entity_id,
        "risk_score": score["risk_score"],
        "band": score["band"],
        "model": score["model"],
        "features": score["features"],
        "top_factors": score["top_factors"],
        "identifiers": identifiers,
        "call_to_debit_links": [l for l in correlate.call_to_debit(ds) if l["person"] == entity_id],
        "fanout_links": [l for l in correlate.fanout(ds) if l["person"] == entity_id],
        "engine": "local",
    }
