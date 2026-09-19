"""Routes tagged "health"."""
from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel

from tracex_api import db

router = APIRouter(tags=["health"])

VERSION = "0.1.0"


class ServiceStatus(BaseModel):
    name: str
    ok: bool
    detail: str | None = None


class HealthResponse(BaseModel):
    status: str
    version: str
    services: list[ServiceStatus]
    llm: dict = {}


@router.get("/health", response_model=HealthResponse, summary="Health")
def health():
    try:
        db.query_one("SELECT 1")
        store_ok, store_detail = True, None
    except Exception as exc:  # pragma: no cover - reported, not raised
        store_ok, store_detail = False, str(exc)
    from tracex_api.agentic import providers as llm
    from tracex_api.ml import model as ml_model

    chosen = llm.status()
    ml = ml_model.status()
    services = [
        ServiceStatus(name="store", ok=store_ok, detail=store_detail),
        ServiceStatus(name="graph", ok=True, detail="engine=local"),
        ServiceStatus(name="llm", ok=True, detail=f"provider={chosen['active']}"),
    ]
    return HealthResponse(
        status="ok" if all(s.ok for s in services) else "degraded",
        version=VERSION,
        services=services,
        llm={"provider": chosen["active"], "ready": True, "local_only": chosen["all_local"],
             "risk_model": "trained" if ml["available"] else "rules-fallback"},
    )


@router.get("/", summary="Root")
def root():
    return {"service": "trace-x-api", "version": VERSION, "docs": "/docs"}
