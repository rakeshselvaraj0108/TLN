"""Routes tagged "agentic": the LLM tool-use investigator."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from tracex_api.agentic import loop, providers, tools
from tracex_api.auth import User, current_user
from tracex_api.engine.dataset import current

router = APIRouter(tags=["agentic"])


class InvestigateIn(BaseModel):
    objective: str = Field(min_length=5, max_length=500, description="What to establish, in plain language.")
    entity_id: str | None = Field(None, pattern=r"^P\d{4}$")
    max_steps: int = Field(8, ge=1, le=12)


@router.get("/agentic/status", summary="Agent status")
def status(user: User = Depends(current_user)):
    """The provider that would run, whether evidence stays on this machine, and exactly what the agent is allowed to do."""
    info = providers.status()
    return {
        **info,
        "tools": [{"name": t.name, "description": t.description, "read_only": t.read_only} for t in tools.TOOLS.values()],
        "guarantees": [
            "Every tool is read-only: the agent can look but cannot write, approve, freeze or send anything.",
            "Tool arguments are schema-validated and tool output is sanitised: instruction-like text in evidence is redacted before the model sees it.",
            "Every factual sentence in the answer is re-checked against the records it cites; a fabricated or altered citation triggers one repair round.",
            "Scores come from the trained model and evidence from the records — the language model only chooses tools and phrases the answer.",
        ] + ([] if info["all_local"] else ["A cloud provider is active: evidence returned by tools is sent to that provider."]),
    }


@router.post("/agentic/investigate", summary="Run the investigator agent")
def investigate(body: InvestigateIn, user: User = Depends(current_user)):
    ds = current()
    if body.entity_id and body.entity_id not in ds.persons:
        raise HTTPException(status_code=404, detail="no such entity in the graph")
    return loop.run_agent(ds, body.objective, entity_id=body.entity_id, max_steps=body.max_steps, user=user.username)
