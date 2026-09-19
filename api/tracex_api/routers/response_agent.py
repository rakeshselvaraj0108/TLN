"""Routes tagged "response-agent"."""
from __future__ import annotations

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from pydantic import BaseModel

from tracex_api import db
from tracex_api.auth import User, current_user
from tracex_api.engine import agent
from tracex_api.engine.dataset import current

router = APIRouter(tags=["response-agent"])


class DecisionIn(BaseModel):
    investigation_id: int
    action: str
    verdict: str
    rationale: str


class SimulateIn(BaseModel):
    investigation_id: int
    action: str


@router.post("/response-agent/investigate/{entity_id}", summary="Investigate")
def investigate(entity_id: str, trigger: str = Query("manual"), user: User = Depends(current_user)):
    """Run the full OBSERVE→…→PROPOSE loop for one entity."""
    ds = current()
    if entity_id not in ds.persons:
        raise HTTPException(status_code=404, detail="no such entity in the graph")
    return agent.investigate(ds, entity_id, trigger, user.username)


@router.get("/response-agent/investigations", summary="List Investigations")
def list_investigations(entity_id: str | None = Query(None), limit: int = Query(50, ge=1, le=500), user: User = Depends(current_user)):
    """Investigation history — the agent's memory, newest first."""
    return {"items": [agent.summary_row(i) for i in agent.list_investigations(entity_id, limit)]}


@router.get("/response-agent/investigations/{investigation_id}", summary="Get Investigation")
def get_investigation(investigation_id: int, user: User = Depends(current_user)):
    """Full stored trace — steps, evidence and proposals as they were."""
    inv = agent.get_investigation(investigation_id)
    return inv


@router.post("/response-agent/simulate", summary="Simulate")
def simulate(body: SimulateIn = Body(...), user: User = Depends(current_user)):
    """Dry-run a proposal. Computes the effect without causing it."""
    return agent.simulate(current(), body.investigation_id, body.action, user.username)


@router.post("/response-agent/decide", summary="Decide")
def decide(body: DecisionIn = Body(...), user: User = Depends(current_user)):
    """Record a human decision on a proposal — the only path by which a recommendation has any effect."""
    return agent.decide(current(), body.investigation_id, body.action, body.verdict, body.rationale, user)


@router.get("/response-agent/campaigns", summary="Campaigns")
def campaigns(user: User = Depends(current_user)):
    """Learned Fraud DNA signatures."""
    return {"items": sorted(db.doc_list("campaigns"), key=lambda c: c["first_seen"])}


@router.get("/response-agent/memory/{entity_id}", summary="Memory")
def memory(entity_id: str, user: User = Depends(current_user)):
    """What the agent already knows about one entity, including previously rejected actions."""
    return agent.memory(entity_id)


@router.get("/response-agent/stats", summary="Stats")
def stats(user: User = Depends(current_user)):
    return agent.stats()
