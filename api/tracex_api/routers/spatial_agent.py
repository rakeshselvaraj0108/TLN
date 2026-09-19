"""Routes tagged "spatial": case reconstruction, map layers, and cross-border exposure."""
from __future__ import annotations

from fastapi import APIRouter, Body, Depends, HTTPException, Path, Query
from pydantic import BaseModel

from tracex_api.auth import User, current_user
from tracex_api.engine import spatial
from tracex_api.engine.dataset import current

router = APIRouter(tags=["spatial"])


class AskIn(BaseModel):
    question: str
    case_id: int | None = None
    source: str = 'text'


@router.get("/spatial/case/{case_id}/reconstruct", summary="Reconstruct")
def reconstruct(case_id: int = Path(...), user: User = Depends(current_user)):
    """The case re-told as an ordered reconstruction."""
    return spatial.reconstruct(current(), case_id)


@router.get("/spatial/case/{case_id}/layers", summary="Layers")
def layers(case_id: int = Path(...), at: str | None = Query(None), user: User = Depends(current_user)):
    """Actors, money arcs, contradictions and towers, projected onto the map."""
    return spatial.layers(current(), case_id, at)


@router.get("/spatial/case/{case_id}/cross-border", summary="Cross Border")
def cross_border(case_id: int = Path(...), user: User = Depends(current_user)):
    """Which parts of this case leave Indian jurisdiction, and why.
Reported separately from risk because it changes the ROUTE, not the
verdict: a foreign leg means an MLAT request through the nodal agency
rather than a local summons."""
    return spatial.cross_border(current(), case_id)


@router.post("/spatial/ask", summary="Ask")
def ask(body: AskIn = Body(...), user: User = Depends(current_user)):
    """Answer a spatial / workflow question from the record. No model in the path."""
    return spatial.ask(current(), body.question, body.case_id)
