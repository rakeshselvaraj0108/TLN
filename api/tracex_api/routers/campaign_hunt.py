"""Routes tagged "campaign-hunt"."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import PlainTextResponse

from tracex_api import audit
from tracex_api.auth import User, current_user, export_user
from tracex_api.engine import agent, hunt
from tracex_api.engine.dataset import current

router = APIRouter(tags=["campaign-hunt"])


@router.get("/hunt/sweep", summary="Sweep")
def sweep(min_members: int = Query(3, ge=2), min_confidence: float = Query(0, ge=0, le=1), user: User = Depends(current_user)):
    """Hunt the whole population for entities operating together."""
    result = hunt.sweep(current(), min_members, min_confidence)
    audit.record(user.username, "hunt.sweep", "sweep", "population", f"campaigns={len(result['campaigns'])} links={result['links_examined']}")
    return result


@router.get("/hunt/report/{entity_id}", summary="Report")
def report(entity_id: str, fmt: str = Query("json"), user: User = Depends(export_user)):
    """The investigation report for one entity."""
    ds = current()
    if entity_id not in ds.persons:
        raise HTTPException(status_code=404, detail="no such entity in the graph")
    latest = next(iter(agent.list_investigations(entity_id, 1)), None)
    result = hunt.report(ds, entity_id, user.username, latest)
    audit.record(user.username, "hunt.report", "entity", entity_id, f"fmt={fmt}")
    if fmt == "text":
        return PlainTextResponse(hunt.report_text(result))
    return result
