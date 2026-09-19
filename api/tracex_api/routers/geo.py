"""Routes tagged "geo"."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query

from tracex_api import audit
from tracex_api.auth import User, current_user
from tracex_api.engine import views
from tracex_api.engine.dataset import current

router = APIRouter(tags=["geo"])


@router.get("/geo/towers", summary="Towers")
def towers(user: User = Depends(current_user)):
    """Every cell site with a fix, weighted by the traffic it carried."""
    sites = views.towers(current())
    return {"towers": sites, "total": len(sites), "engine": "local"}


@router.get("/geo/movement/{entity_id}", summary="Movement")
def movement(entity_id: str, start: str | None = Query(None), end: str | None = Query(None), user: User = Depends(current_user)):
    """Ordered track of the cell sites that served this person's calls."""
    ds = current()
    if entity_id not in ds.persons:
        raise HTTPException(status_code=404, detail="no such entity in the graph")
    return views.movement(ds, entity_id, start, end)


@router.get("/geo/proximity", summary="Proximity")
def proximity(
    lat: float = Query(...),
    lon: float = Query(...),
    at: str = Query(...),
    window_minutes: int = Query(30, ge=1, le=1440),
    radius_km: float = Query(2, gt=0, le=50),
    user: User = Depends(current_user),
):
    """Who was served by a cell site near this point, around this time. Audited."""
    try:
        result = views.proximity(current(), lat, lon, at, window_minutes, radius_km)
    except ValueError:
        raise HTTPException(status_code=422, detail="at must be an ISO timestamp")
    audit.record(user.username, "geo.proximity", "location", f"{lat},{lon}", f"at={at} window={window_minutes}m radius={radius_km}km hits={result['total_observations']}")
    return result


@router.get("/geo/contradictions", summary="Contradictions")
def contradictions(user: User = Depends(current_user)):
    """Observations that cannot all describe the same person in one place."""
    return views.contradictions(current())
