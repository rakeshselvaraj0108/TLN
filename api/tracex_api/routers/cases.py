"""Routes tagged "cases"."""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Body, Depends, HTTPException
from pydantic import BaseModel

from tracex_api import audit, db
from tracex_api.auth import User, current_user, require_supervisor
from tracex_api.engine import scoring
from tracex_api.engine.dataset import current

router = APIRouter(tags=["cases"])

STATUSES = {"open", "under_review", "escalated", "closed"}


class CaseCreate(BaseModel):
    title: str


class CaseEntityIn(BaseModel):
    entity_id: str
    entity_kind: str = "person"
    label: str | None = None


class CaseNoteIn(BaseModel):
    body: str


class CaseOut(BaseModel):
    id: int
    case_code: str
    title: str
    status: str
    created_by: str


class CaseStatusIn(BaseModel):
    status: str


def _case(case_id: int):
    row = db.query_one("SELECT * FROM cases WHERE id = ?", (case_id,))
    if not row:
        raise HTTPException(status_code=404, detail="no such case")
    return row


@router.get("/cases", response_model=list[CaseOut], summary="List Cases")
def list_cases(user: User = Depends(current_user)):
    return [dict(r) for r in db.query("SELECT id, case_code, title, status, created_by FROM cases ORDER BY id")]


@router.post("/cases", response_model=CaseOut, status_code=201, summary="Create Case")
def create_case(body: CaseCreate = Body(...), user: User = Depends(current_user)):
    title = body.title.strip()
    if not title:
        raise HTTPException(status_code=422, detail="a case needs a title")
    year = datetime.now(timezone.utc).year
    with db.transaction() as conn:
        n = conn.execute("SELECT COUNT(*) AS n FROM cases WHERE case_code LIKE ?", (f"TRX-{year}-%",)).fetchone()["n"] + 1
        cur = conn.execute("INSERT INTO cases(case_code, title, status, created_by, created_at) VALUES (?,?,?,?,?)",
                           (f"TRX-{year}-{n:04d}", title, "open", user.username, db.now_iso()))
        case_id = cur.lastrowid
    audit.record(user.username, "case.create", "case", case_id, title)
    return dict(db.query_one("SELECT id, case_code, title, status, created_by FROM cases WHERE id = ?", (case_id,)))


@router.get("/cases/{case_id}", summary="Get Case")
def get_case(case_id: int, user: User = Depends(current_user)):
    case = dict(_case(case_id))
    scores = scoring.scores(current())
    entities = []
    for r in db.query("SELECT entity_id, entity_kind, label, added_by, added_at FROM case_entities WHERE case_id = ? ORDER BY rowid", (case_id,)):
        s = scores.get(r["entity_id"])
        entities.append({**dict(r), "risk_score": s["risk_score"] if s else None, "band": s["band"] if s else None,
                         "top_factors": s["top_factors"] if s else []})
    notes = [dict(r) for r in db.query("SELECT id, body, author, created_at FROM case_notes WHERE case_id = ? ORDER BY id", (case_id,))]
    return {**case, "entities": entities, "notes": notes}


@router.patch("/cases/{case_id}/status", response_model=CaseOut, summary="Set Status")
def set_status(case_id: int, body: CaseStatusIn = Body(...), user: User = Depends(current_user)):
    case = _case(case_id)
    if body.status not in STATUSES:
        raise HTTPException(status_code=422, detail=f"status must be one of {sorted(STATUSES)}")
    if body.status == "closed":
        require_supervisor(user, "closing a case requires the supervisor role")
    db.execute("UPDATE cases SET status = ? WHERE id = ?", (body.status, case_id))
    audit.record(user.username, "case.status", "case", case_id, f"{case['status']} -> {body.status}")
    return dict(db.query_one("SELECT id, case_code, title, status, created_by FROM cases WHERE id = ?", (case_id,)))


@router.post("/cases/{case_id}/entities", status_code=201, summary="Add Entity")
def add_entity(case_id: int, body: CaseEntityIn = Body(...), user: User = Depends(current_user)):
    _case(case_id)
    ds = current()
    if body.entity_kind == "person" and body.entity_id not in ds.persons:
        raise HTTPException(status_code=404, detail="no such entity in the graph")
    if db.query_one("SELECT 1 FROM case_entities WHERE case_id = ? AND entity_id = ?", (case_id, body.entity_id)):
        raise HTTPException(status_code=409, detail=f"{body.entity_id} is already pinned to this case")
    s = scoring.scores(ds).get(body.entity_id)
    label = body.label or (f"{s['band']} risk ({s['risk_score']:.2f})" if s else None)
    db.execute("INSERT INTO case_entities(case_id, entity_id, entity_kind, label, added_by, added_at) VALUES (?,?,?,?,?,?)",
               (case_id, body.entity_id, body.entity_kind, label, user.username, db.now_iso()))
    audit.record(user.username, "case.entity.add", "case", case_id, body.entity_id)
    return {"case_id": case_id, "entity_id": body.entity_id, "entity_kind": body.entity_kind, "label": label}


@router.delete("/cases/{case_id}/entities/{entity_id}", summary="Remove Entity")
def remove_entity(case_id: int, entity_id: str, user: User = Depends(current_user)):
    _case(case_id)
    if db.execute("DELETE FROM case_entities WHERE case_id = ? AND entity_id = ?", (case_id, entity_id)).rowcount == 0:
        raise HTTPException(status_code=404, detail=f"{entity_id} is not pinned to this case")
    audit.record(user.username, "case.entity.remove", "case", case_id, entity_id)
    return {"case_id": case_id, "entity_id": entity_id, "removed": True}


@router.post("/cases/{case_id}/notes", status_code=201, summary="Add Note")
def add_note(case_id: int, body: CaseNoteIn = Body(...), user: User = Depends(current_user)):
    _case(case_id)
    text = body.body.strip()
    if not text:
        raise HTTPException(status_code=422, detail="a note needs a body")
    cur = db.execute("INSERT INTO case_notes(case_id, body, author, created_at) VALUES (?,?,?,?)", (case_id, text, user.username, db.now_iso()))
    audit.record(user.username, "case.note.add", "case", case_id)
    return dict(db.query_one("SELECT id, body, author, created_at FROM case_notes WHERE id = ?", (cur.lastrowid,)))
