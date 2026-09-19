"""Routes tagged "audit"."""
from __future__ import annotations

from fastapi import APIRouter, Depends, Query

from tracex_api import audit
from tracex_api.auth import User, current_user

router = APIRouter(tags=["audit"])


@router.get("/audit", summary="List Audit")
def list_audit(
    limit: int = Query(200, ge=1, le=5000),
    action: str | None = Query(None),
    actor: str | None = Query(None),
    user: User = Depends(current_user),
):
    items = audit.entries(limit=limit, action=action, actor=actor)
    return {"count": len(items), "items": items}
