"""Routes tagged "timeline"."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from tracex_api import audit, db
from tracex_api.auth import User, current_user
from tracex_api.engine import views
from tracex_api.engine.dataset import current

router = APIRouter(tags=["timeline"])


@router.get("/timeline/entity/{entity_id}", summary="Entity Timeline")
def entity_timeline(entity_id: str, user: User = Depends(current_user)):
    ds = current()
    if entity_id not in ds.persons:
        raise HTTPException(status_code=404, detail="no such entity in the graph")
    events = views.entity_events(ds, entity_id)
    audit.record(user.username, "timeline.entity.view", "entity", entity_id)
    return {"entity_id": entity_id, "count": len(events), "events": events, "engine": "local"}


@router.get("/timeline/case/{case_id}", summary="Case Timeline")
def case_timeline(case_id: int, user: User = Depends(current_user)):
    case = db.query_one("SELECT id, case_code FROM cases WHERE id = ?", (case_id,))
    if not case:
        raise HTTPException(status_code=404, detail="no such case")
    entity_ids = [r["entity_id"] for r in db.query("SELECT entity_id FROM case_entities WHERE case_id = ? ORDER BY rowid", (case_id,))]
    events = views.case_events(current(), entity_ids)
    audit.record(user.username, "timeline.case.view", "case", case_id)
    return {"case_id": case_id, "case_code": case["case_code"], "entities": entity_ids, "count": len(events), "events": events, "engine": "local"}
