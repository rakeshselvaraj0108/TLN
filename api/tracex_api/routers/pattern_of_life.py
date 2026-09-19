"""Routes tagged "pattern-of-life"."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query

from tracex_api import audit
from tracex_api.auth import User, current_user
from tracex_api.engine import pattern
from tracex_api.engine.dataset import current, ts

router = APIRouter(tags=["pattern-of-life"])


@router.get("/pattern/timeline/{entity_id}", summary="Timeline")
def timeline(entity_id: str, user: User = Depends(current_user)):
    """One time-ordered stream of this entity's financial and physical events."""
    ds = current()
    if entity_id not in ds.persons:
        raise HTTPException(status_code=404, detail="no such entity in the graph")
    audit.record(user.username, "pattern.timeline", "entity", entity_id)
    return pattern.entity_timeline(ds, entity_id)


@router.get("/pattern/vehicle/{plate}", summary="Vehicle")
def vehicle(plate: str, user: User = Depends(current_user)):
    """Habitual places and hours for one plate, derived from its own history."""
    result = pattern.vehicle(current(), plate.upper().replace(" ", ""))
    if result is None:
        raise HTTPException(status_code=404, detail=f"no reads for plate {plate}")
    return result


@router.get("/pattern/contradictions", summary="Contradictions")
def contradictions(limit: int = Query(5000, ge=1, le=100000), user: User = Depends(current_user)):
    """Reads that cannot both be true — a misread, or a cloned plate."""
    ds = current()
    items = pattern.contradictions(ds)[:limit]
    audit.record(user.username, "pattern.contradictions", "entity", "all")
    return {"count": len(items), "items": items, "engine": "local", "threshold_kmh": pattern.THRESHOLDS["max_plausible_kmh"],
            "reads_examined": min(len(ds.reads), limit), "thresholds": pattern.THRESHOLDS}


@router.get("/pattern/corroborate", summary="Corroborate")
def corroborate(at: str = Query(...), camera_id: str = Query(...), detail: str = Query("event"), user: User = Depends(current_user)):
    """What physical evidence sits around an arbitrary moment at one camera."""
    ds = current()
    if camera_id not in ds.cameras:
        raise HTTPException(status_code=404, detail="no such camera")
    try:
        when = ts(at)
    except ValueError:
        raise HTTPException(status_code=422, detail="at must be an ISO timestamp")
    return pattern.corroborate_at(ds, when, camera_id)


@router.get("/pattern/summary", summary="Summary")
def summary(user: User = Depends(current_user)):
    return pattern.summary(current())


@router.get("/pattern/cameras", summary="Cameras")
def cameras(user: User = Depends(current_user)):
    """The camera network, as nodes rather than as a count."""
    return pattern.cameras(current())
