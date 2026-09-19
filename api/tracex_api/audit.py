"""Append-only audit log."""
from __future__ import annotations

from tracex_api import db


def record(actor: str, action: str, target_type: str | None = None, target_id: str | int | None = None, detail: str | None = None) -> int:
    cur = db.execute(
        "INSERT INTO audit(ts, actor, action, target_type, target_id, detail) VALUES (?,?,?,?,?,?)",
        (db.now_iso(), actor, action, target_type, None if target_id is None else str(target_id), detail),
    )
    return cur.lastrowid


def entries(limit: int = 200, action: str | None = None, actor: str | None = None) -> list[dict]:
    sql = "SELECT id, ts, actor, action, target_type, target_id, detail FROM audit"
    clauses, params = [], []
    if action:
        clauses.append("action = ?"); params.append(action)
    if actor:
        clauses.append("actor = ?"); params.append(actor)
    if clauses:
        sql += " WHERE " + " AND ".join(clauses)
    sql += " ORDER BY id DESC LIMIT ?"
    params.append(limit)
    return [dict(r) for r in db.query(sql, params)]
