"""Routes tagged "verification"."""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Body, Depends
from pydantic import BaseModel

from tracex_api import audit
from tracex_api.auth import User, current_user
from tracex_api.engine import verify as verifier

router = APIRouter(tags=["verification"])


class ClaimIn(BaseModel):
    claim: str
    cited: list[str] | None = None


class VerifyIn(BaseModel):
    answer: str = ""
    data: dict | list[Any] | None = None
    claims: list[ClaimIn] | None = None


class FindingsIn(BaseModel):
    findings: list[dict]


@router.post("/verify/answer", summary="Verify Answer")
def verify_answer(body: VerifyIn = Body(...), user: User = Depends(current_user)):
    """Verify one answer: ground every citation, then judge what is left."""
    result = verifier.verify([c.model_dump() for c in body.claims or []], body.answer)
    audit.record(user.username, "verify.answer", "verification", result["verdict"], f"trust={result['trust']} claims={len(result['claims'])} counts={result['counts']}")
    return result


@router.post("/verify/findings", summary="Verify Findings")
def verify_findings(body: FindingsIn = Body(...), user: User = Depends(current_user)):
    """Verify a list of report findings; each is a claim with its evidence rows."""
    claims = [{"claim": f.get("claim") or f.get("title") or f.get("detail", ""), "cited": f.get("cited") or f.get("evidence_rows") or [],
               "basis": f.get("basis")} for f in body.findings]
    result = verifier.verify(claims)
    audit.record(user.username, "verify.findings", "verification", result["verdict"], f"findings={len(claims)}")
    return result


@router.get("/verify/selfeval", summary="Self Evaluation")
def selfeval(user: User = Depends(current_user)):
    result = verifier.selfeval()
    audit.record(user.username, "verify.selfeval", "verification", None, f"accuracy={result['accuracy']} fabrication_recall={result['fabrication_recall']}")
    return result


@router.get("/verify/panel", summary="Panel")
def panel(user: User = Depends(current_user)):
    return verifier.PANEL
