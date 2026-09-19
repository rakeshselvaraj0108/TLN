"""Routes tagged "reasoning": the persistent reasoning ledger."""
from __future__ import annotations

from fastapi import APIRouter, Body, Depends, Path, Query
from pydantic import BaseModel

from tracex_api import audit
from tracex_api.auth import User, current_user
from tracex_api.engine import reasoning as ledger

router = APIRouter(tags=["reasoning"])


class ConcludeIn(BaseModel):
    statement: str
    supporting: list[int]
    subject_entity_id: str | None = None


class HypothesisIn(BaseModel):
    statement: str
    subject_entity_id: str | None = None
    prior: float = 0.5
    alternatives: list[str] | None = None


class LinkIn(BaseModel):
    claim_id: int
    hypothesis_id: int | None = None
    target_claim_id: int | None = None
    relation: str
    weight: float = 1.0
    rationale: str = ''


class PendingIn(BaseModel):
    questions: list[str] | None = None


class SessionIn(BaseModel):
    objective: str
    user_intent: str = ''
    case_id: str | None = None
    session_key: str | None = None


class TransitionIn(BaseModel):
    stage: str
    action: str
    tool_name: str | None = None
    args: dict | None = None
    outcome: str = 'ok'
    result_digest: str = ''
    info_gain: float = 0.0
    redundant: bool = False
    provider: str | None = None
    model: str | None = None
    tokens_in: int = 0
    tokens_out: int = 0
    latency_ms: int = 0
    error: str | None = None


class ClaimIn(BaseModel):
    epistemic_class: str
    statement: str
    subject_entity_id: str | None = None
    source_kind: str = 'agent'
    source_ref: str | None = None
    row_sha256: str | None = None
    reliability: float = 0.5
    confidence: float = 0.5
    derived_from: list[int] | None = None


@router.get("/reasoning/providers", summary="List Providers")
def list_providers(user: User = Depends(current_user)):
    """The provider fleet, with readiness probed rather than assumed.
`local_only` is surfaced per provider because the air-gap claim is a
property the operator should be able to check, not take on trust."""
    return ledger.providers()


@router.get("/reasoning/sessions", response_model=list[dict], summary="List Sessions")
def list_sessions(status: str | None = Query(None), limit: int = Query(50, ge=1, le=1000), user: User = Depends(current_user)):
    return ledger.list_sessions(status, limit)


@router.post("/reasoning/sessions", status_code=201, summary="Create Session")
def create_session(body: SessionIn = Body(...), user: User = Depends(current_user)):
    s = ledger.open_session(body.objective, body.user_intent, body.case_id, body.session_key, user.username)
    audit.record(user.username, "reasoning.session.open", "reasoning_session", s["session_key"], body.objective[:200])
    return ledger.summary(s)


@router.get("/reasoning/sessions/{session_key}", summary="Get State")
def get_state(session_key: str = Path(...), user: User = Depends(current_user)):
    """The full continuation state — what is known, believed, disputed, and open."""
    return ledger.detail(ledger.load(session_key))


@router.get("/reasoning/sessions/{session_key}/claims", response_model=list[dict], summary="List Claims")
def list_claims(session_key: str = Path(...), epistemic_class: str | None = Query(None), user: User = Depends(current_user)):
    claims = ledger.load(session_key)["claims"]
    return [c for c in claims if epistemic_class is None or c["epistemic_class"] == epistemic_class]


@router.post("/reasoning/sessions/{session_key}/claims", status_code=201, summary="Add Claim")
def add_claim(session_key: str = Path(...), body: ClaimIn = Body(...), user: User = Depends(current_user)):
    s = ledger.load(session_key)
    claim = ledger.add_claim(s, body.model_dump())
    ledger.save(s)
    return claim


@router.get("/reasoning/sessions/{session_key}/hypotheses", response_model=list[dict], summary="List Hypotheses")
def list_hypotheses(session_key: str = Path(...), user: User = Depends(current_user)):
    return ledger.load(session_key)["hypotheses"]


@router.post("/reasoning/sessions/{session_key}/hypotheses", status_code=201, summary="Add Hypothesis")
def add_hypothesis(session_key: str = Path(...), body: HypothesisIn = Body(...), user: User = Depends(current_user)):
    s = ledger.load(session_key)
    h = ledger.add_hypothesis(s, body.model_dump())
    ledger.save(s)
    return h


@router.post("/reasoning/sessions/{session_key}/links", status_code=201, summary="Add Link")
def add_link(session_key: str = Path(...), body: LinkIn = Body(...), user: User = Depends(current_user)):
    s = ledger.load(session_key)
    link = ledger.add_link(s, body.model_dump())
    ledger.save(s)
    return link


@router.post("/reasoning/sessions/{session_key}/conclusions", status_code=201, summary="Add Conclusion")
def add_conclusion(session_key: str = Path(...), body: ConcludeIn = Body(...), user: User = Depends(current_user)):
    """Promote a finding to a conclusion. Refused if it cites nothing live."""
    s = ledger.load(session_key)
    c = ledger.conclude(s, body.model_dump())
    ledger.save(s)
    audit.record(user.username, "reasoning.conclude", "reasoning_session", session_key, body.statement[:200])
    return c


@router.post("/reasoning/sessions/{session_key}/transitions", status_code=201, summary="Add Transition")
def add_transition(session_key: str = Path(...), body: TransitionIn = Body(...), user: User = Depends(current_user)):
    """Append one step to the session's trace.
Steps that FAILED are recorded with their real outcome. A trace that only
contains successes cannot explain why a run took the path it did, and a
gap reads as if the step never happened."""
    s = ledger.load(session_key)
    step = ledger.add_transition(s, body.model_dump())
    ledger.save(s)
    return step


@router.get("/reasoning/sessions/{session_key}/trace", response_model=list[dict], summary="Get Trace")
def get_trace(session_key: str = Path(...), limit: int = Query(200, ge=1, le=10000), user: User = Depends(current_user)):
    """The replayable step trace, failures included."""
    return ledger.load(session_key)["trace"][:limit]


@router.post("/reasoning/sessions/{session_key}/pending", summary="Set Pending")
def set_pending(session_key: str = Path(...), body: PendingIn = Body(...), user: User = Depends(current_user)):
    """Record what remains unanswered. Unresolved questions are part of the state."""
    s = ledger.load(session_key)
    s["pending"] = [q for q in body.questions or [] if q.strip()]
    ledger.save(s)
    return {"session_key": session_key, "pending": s["pending"]}
