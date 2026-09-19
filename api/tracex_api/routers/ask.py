"""Routes tagged "ask"."""
from __future__ import annotations

import json
from pathlib import Path

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from pydantic import BaseModel

from tracex_api import audit, db
from tracex_api.auth import User, current_user
from tracex_api.engine import ask as engine
from tracex_api.engine import verify as verifier
from tracex_api.engine.dataset import current

router = APIRouter(tags=["ask"])
CATALOG = Path(__file__).resolve().parents[1] / "seed_data" / "catalog"


class AskIn(BaseModel):
    question: str
    source: str = "text"
    verify: bool = False
    session_key: str = "default"


@router.post("/ask", summary="Ask")
def ask(body: AskIn = Body(...), user: User = Depends(current_user)):
    """Answer a question from the record. No model in the path; every claim cites its records."""
    question = body.question.strip()
    if not question:
        raise HTTPException(status_code=422, detail="ask a question")
    result = engine.answer(current(), question)
    verdict, trust = "off", 0.0
    if body.verify:
        v = verifier.verify(result["claims"], result["answer"])
        result["verification"] = v
        verdict, trust = v["verdict"], v["trust"]
    turn_id = db.next_id("ask_turns")
    turn = {"id": turn_id, "question": question, "source": body.source, "intent": result["intent"], "entity_id": result["entity_id"],
            "verdict": verdict, "trust": trust, "at": db.now_iso(), "answer": result, "session_key": body.session_key, "user": user.username}
    db.doc_put("ask_turns", turn_id, turn)
    audit.record(user.username, "ask.query", "question", result["intent"], f"[{body.source}] verify={verdict} {question[:120]}")
    return {**result, "turn_id": turn_id, "verdict": verdict, "trust": trust}


def _turns(session_key: str, user: str) -> list[dict]:
    return sorted((t for t in db.doc_list("ask_turns") if t.get("session_key") == session_key and t.get("user", "investigator") == user), key=lambda t: t["id"])


@router.get("/ask/history", summary="History")
def history(session_key: str = Query("default"), limit: int = Query(50, ge=1, le=500), user: User = Depends(current_user)):
    """Replay this conversation, oldest first."""
    turns = _turns(session_key, user.username)[-limit:]
    return {"turns": [{k: v for k, v in t.items() if k not in ("session_key", "user")} for t in turns], "session_key": session_key}


@router.delete("/ask/history", summary="Clear History")
def clear_history(session_key: str = Query("default"), user: User = Depends(current_user)):
    """Start a fresh conversation. Deletes only this user's turns; the audit log is untouched."""
    turns = _turns(session_key, user.username)
    for t in turns:
        db.doc_delete("ask_turns", t["id"])
    return {"cleared": len(turns), "session_key": session_key}


@router.get("/ask/examples", summary="Examples")
def examples(user: User = Depends(current_user)):
    """What the engine knows how to answer, built against the ids this deployment holds."""
    return json.loads((CATALOG / "ask_examples.json").read_text(encoding="utf-8"))
