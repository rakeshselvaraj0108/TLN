"""Routes tagged "agents": the eight-stage investigation pipeline."""
from __future__ import annotations

import json
from pathlib import Path

from fastapi import APIRouter, Body, Depends
from pydantic import BaseModel

from tracex_api.auth import User, current_user
from tracex_api.engine import reasoning

router = APIRouter(tags=["agents"])
CATALOG = Path(__file__).resolve().parents[1] / "seed_data" / "catalog"


class AgentRunIn(BaseModel):
    skip_ingest: bool = False


@router.get("/agents/pipeline/info", summary="Pipeline Info")
def pipeline_info():
    return json.loads((CATALOG / "pipeline_info.json").read_text(encoding="utf-8"))


@router.post("/agents/pipeline/run", summary="Run")
def run(body: AgentRunIn | None = Body(None), user: User = Depends(current_user)):
    """Run all eight stages over the stored evidence and record the run as a reasoning session."""
    return reasoning.run_pipeline(user.username, bool(body and body.skip_ingest))
