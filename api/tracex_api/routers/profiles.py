"""Routes tagged "profiles"."""
from __future__ import annotations

import re

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from tracex_api import audit, db
from tracex_api.auth import User, current_user
from tracex_api.engine import views
from tracex_api.engine.dataset import current

router = APIRouter(tags=["profiles"])


class NoteIn(BaseModel):
    subject: str
    body: str
    subject_b: str | None = None
    subject_kind: str = "node"


def _guess(term: str) -> list[str]:
    t = term.strip()
    guesses = []
    if re.fullmatch(r"P\d{4}", t, re.I):
        guesses.append("person id")
    if re.fullmatch(r"\+?\d{10,13}", t):
        guesses.append("phone number")
    if re.fullmatch(r"\d{15}", t):
        guesses.append("IMEI or IMSI")
    if re.fullmatch(r"[A-Z]{4}\d{6,}", t, re.I):
        guesses.append("bank account")
    if re.fullmatch(r"[\d.]{7,15}", t) and t.count(".") == 3:
        guesses.append("IP address")
    if t.startswith("@") or "@" in t:
        guesses.append("handle or UPI id")
    return guesses


@router.get("/search", summary="Search")
def search(q: str = Query(..., min_length=1), limit: int = Query(25, ge=1, le=200), user: User = Depends(current_user)):
    """One box, every identifier type. Audited."""
    ds = current()
    needle = q.strip().lower()
    groups: dict[str, list[dict]] = {}

    def add(kind: str, label: str, entity_id: str | None):
        bucket = groups.setdefault(kind, [])
        if all(h["label"] != label for h in bucket):
            bucket.append({"label": label, "entity_id": entity_id})

    for pid, p in ds.persons.items():
        if needle in pid.lower() or needle in p.name.lower():
            add("Person", f"{pid} · {p.name}", pid)
    phones = {c.a_party for c in ds.calls} | {c.b_party for c in ds.calls} | {s.msisdn for s in ds.sessions}
    for ph in sorted(phones):
        if needle in ph.lower():
            add("Phone", ph, ds.by_phone.get(ph))
    for imei in sorted({c.imei for c in ds.calls} | {s.imei for s in ds.sessions}):
        if needle in imei:
            add("Device", imei, ds.by_device.get(imei))
    sim_owner = {}
    for c in ds.calls:
        sim_owner.setdefault(c.imsi, ds.by_phone.get(c.a_party))
    for s in ds.sessions:
        sim_owner.setdefault(s.imsi, ds.by_phone.get(s.msisdn))
    for imsi in sorted(sim_owner):
        if needle in imsi:
            add("Sim", imsi, sim_owner[imsi])
    for acct in sorted(ds.account_ifsc):
        if needle in acct.lower():
            add("Account", acct, ds.by_account.get(acct))
    ip_owner = {}
    for s in ds.sessions:
        ip_owner.setdefault(s.public_ip, ds.by_phone.get(s.msisdn))
    for ip in sorted(ip_owner):
        if needle in ip:
            add("Ip", ip, ip_owner[ip])
    for post in ds.posts:
        if needle in post.handle.lower():
            add("SocialHandle", post.handle, ds.by_handle.get(post.handle))
    order = ["Person", "Phone", "Device", "Sim", "Account", "UpiId", "Ip", "SocialHandle"]
    result_groups = [{"kind": k, "count": len(groups[k]), "hits": groups[k][:limit]} for k in order if groups.get(k)]
    total = sum(g["count"] for g in result_groups)
    audit.record(user.username, "search.query", "search", q, f"hits={total}")
    return {"term": q, "guessed_types": _guess(q), "total": total, "groups": result_groups}


@router.get("/profiles/{entity_id}", summary="Profile")
def get_profile(entity_id: str, user: User = Depends(current_user)):
    """Everything known about one resolved person, in one record."""
    ds = current()
    if entity_id not in ds.persons:
        raise HTTPException(status_code=404, detail="no such entity in the graph")
    result = views.profile(ds, entity_id)
    result["notes"] = _notes(entity_id, None)
    return result


def _notes(subject: str | None, subject_b: str | None) -> list[dict]:
    sql = "SELECT id, subject, subject_b, subject_kind, body, author, created_at FROM notes"
    clauses, params = [], []
    if subject:
        clauses.append("(subject = ? OR subject_b = ?)")
        params += [subject, subject]
    if subject_b:
        clauses.append("(subject = ? OR subject_b = ?)")
        params += [subject_b, subject_b]
    if clauses:
        sql += " WHERE " + " AND ".join(clauses)
    return [dict(r) for r in db.query(sql + " ORDER BY id DESC", params)]


@router.get("/notes", summary="List Notes")
def list_notes(subject: str | None = Query(None), subject_b: str | None = Query(None), user: User = Depends(current_user)):
    notes = _notes(subject, subject_b)
    return {"notes": notes, "total": len(notes)}


@router.post("/notes", status_code=201, summary="Create Note")
def create_note(body: NoteIn, user: User = Depends(current_user)):
    if not body.body.strip():
        raise HTTPException(status_code=422, detail="a note needs a body")
    cur = db.execute(
        "INSERT INTO notes(subject, subject_b, subject_kind, body, author, created_at) VALUES (?,?,?,?,?,?)",
        (body.subject, body.subject_b, body.subject_kind, body.body.strip(), user.username, db.now_iso()),
    )
    audit.record(user.username, "note.create", body.subject_kind, body.subject, body.subject_b)
    return dict(db.query_one("SELECT id, subject, subject_b, subject_kind, body, author, created_at FROM notes WHERE id = ?", (cur.lastrowid,)))


@router.delete("/notes/{note_id}", summary="Delete Note")
def delete_note(note_id: int, user: User = Depends(current_user)):
    note = db.query_one("SELECT author FROM notes WHERE id = ?", (note_id,))
    if not note:
        raise HTTPException(status_code=404, detail="no such note")
    if note["author"] != user.username and not user.is_supervisor:
        raise HTTPException(status_code=403, detail="only the author or a supervisor can delete a note")
    db.execute("DELETE FROM notes WHERE id = ?", (note_id,))
    audit.record(user.username, "note.delete", "note", note_id)
    return {"deleted": note_id}
