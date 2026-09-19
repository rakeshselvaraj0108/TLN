"""Routes tagged "compliance"."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Path, Query
from fastapi.responses import PlainTextResponse

from tracex_api import audit
from tracex_api.auth import User, current_user, export_user, require_supervisor
from tracex_api.engine import compliance

router = APIRouter(tags=["compliance"])


@router.get("/compliance/program", summary="Program")
def program(user: User = Depends(current_user)):
    """The programme: scope, domain posture, and what needs attention."""
    p = compliance.program()
    audit.record(user.username, "compliance.program.view", "compliance", None,
                 f"readiness={p['readiness']} gaps={p['counts']['gap']} unclaimed={p['counts']['manual']}")
    return p


@router.get("/compliance/controls", summary="Controls")
def controls(domain: str | None = Query(None), status: str | None = Query(None), owner: str | None = Query(None), user: User = Depends(current_user)):
    """Every security control, with the evidence gathered for each. Ordered worst-first."""
    result = compliance.controls(domain, status, owner)
    audit.record(user.username, "compliance.controls.view", "compliance", None, f"returned={result['count']} status={status or 'any'} owner={owner or 'any'}")
    return result


@router.get("/compliance/controls/{control_id}", summary="Control")
def control(control_id: str = Path(...), user: User = Depends(current_user)):
    """One control, re-evaluated now."""
    c = compliance.control(control_id)
    if c is None:
        raise HTTPException(status_code=404, detail="no such control")
    return c


@router.post("/compliance/attest/{control_id}", summary="Attest")
def attest(control_id: str = Path(...), note: str = Query(..., min_length=10), user: User = Depends(current_user)):
    """Record a supervisor's attestation. This does NOT flip the control green."""
    require_supervisor(user, "attesting a control requires the supervisor role")
    record = compliance.attest(control_id, note, user)
    if record is None:
        raise HTTPException(status_code=404, detail="no such control")
    return record


@router.get("/compliance/attestations", summary="Attestations")
def attestations(user: User = Depends(current_user)):
    return compliance.attestations()


@router.get("/compliance/report.txt", response_class=PlainTextResponse, summary="Report")
def report(user: User = Depends(export_user)):
    """The whole assessment as plain text. Supervisor-gated: it lists the deployment's own weaknesses."""
    require_supervisor(user)
    audit.record(user.username, "compliance.report.export", "compliance", None)
    return PlainTextResponse(compliance.report_text(user.username))
