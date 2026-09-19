"""Routes tagged "casework"."""
from __future__ import annotations

import json
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from tracex_api import audit, db
from tracex_api.auth import User, current_user, require_supervisor
from tracex_api.engine import scoring
from tracex_api.engine.dataset import current

router = APIRouter(tags=["casework"])

SEED = Path(__file__).resolve().parents[1] / "seed_data"
ACTIONS = {"escalate", "dismiss", "freeze_request", "sar_draft"}
SUPERVISOR_ACTIONS = {"freeze_request", "sar_draft"}
MIN_RATIONALE_CHARS = 10


class ActionIn(BaseModel):
    action: str
    rationale: str
    case_id: int | None = None


def _action_row(r) -> dict:
    return {
        "id": r["id"], "entity_id": r["entity_id"], "action": r["action"], "rationale": r["rationale"], "case_id": r["case_id"],
        "risk_score_at_action": r["risk_score"], "band_at_action": r["band"], "actor_username": r["created_by"], "created_at": r["created_at"],
    }


@router.post("/actions/{entity_id}", status_code=201, summary="Record Action")
def record_action(entity_id: str, body: ActionIn, user: User = Depends(current_user)):
    """Record a disposition against an entity."""
    ds = current()
    if entity_id not in ds.persons:
        raise HTTPException(status_code=404, detail="no such entity in the graph")
    if body.action not in ACTIONS:
        raise HTTPException(status_code=422, detail=f"action must be one of {sorted(ACTIONS)}")
    if len(body.rationale.strip()) < MIN_RATIONALE_CHARS:
        raise HTTPException(status_code=422, detail=f"a rationale of at least {MIN_RATIONALE_CHARS} characters is required")
    if body.action in SUPERVISOR_ACTIONS:
        require_supervisor(user, f"'{body.action}' requires the supervisor role")
    if body.case_id is not None and not db.query_one("SELECT 1 FROM cases WHERE id = ?", (body.case_id,)):
        raise HTTPException(status_code=404, detail="no such case")
    score = scoring.scores(ds).get(entity_id)
    cur = db.execute(
        "INSERT INTO actions(entity_id, action, rationale, case_id, risk_score, band, created_by, created_at) VALUES (?,?,?,?,?,?,?,?)",
        (entity_id, body.action, body.rationale.strip(), body.case_id, score["risk_score"] if score else None, score["band"] if score else None,
         user.username, db.now_iso()),
    )
    audit.record(user.username, f"action.{body.action}", "entity", entity_id, body.rationale.strip()[:200])
    return _action_row(db.query_one("SELECT * FROM actions WHERE id = ?", (cur.lastrowid,)))


@router.get("/actions", summary="List Actions")
def list_actions(entity_id: str | None = Query(None), action: str | None = Query(None), limit: int = Query(200, ge=1, le=1000),
                 user: User = Depends(current_user)):
    sql, clauses, params = "SELECT * FROM actions", [], []
    if entity_id:
        clauses.append("entity_id = ?"); params.append(entity_id)
    if action:
        clauses.append("action = ?"); params.append(action)
    if clauses:
        sql += " WHERE " + " AND ".join(clauses)
    rows = [_action_row(r) for r in db.query(sql + " ORDER BY id DESC LIMIT ?", params + [limit])]
    return {"actions": rows, "total": len(rows)}


@router.get("/sar", summary="Sar Queue")
def sar_queue(user: User = Depends(current_user)):
    """Entities with a drafted suspicious-activity report, newest first, with score drift flagged."""
    scores = scoring.scores(current())
    drafts = []
    for r in db.query("SELECT * FROM actions WHERE action = 'sar_draft' ORDER BY id DESC"):
        row = _action_row(r)
        now = scores.get(r["entity_id"])
        row["current_risk_score"] = now["risk_score"] if now else None
        row["current_band"] = now["band"] if now else None
        row["score_moved"] = bool(now and r["risk_score"] is not None and abs(now["risk_score"] - r["risk_score"]) >= 0.0001)
        drafts.append(row)
    return {"drafts": drafts, "total": len(drafts)}


@router.delete("/actions/{action_id}", summary="Withdraw Action")
def withdraw_action(action_id: int, user: User = Depends(current_user)):
    """Withdraw a recorded disposition. Supervisor only, and itself audited."""
    require_supervisor(user, "withdrawing a disposition requires the supervisor role")
    row = db.query_one("SELECT * FROM actions WHERE id = ?", (action_id,))
    if not row:
        raise HTTPException(status_code=404, detail="no such action")
    db.execute("DELETE FROM actions WHERE id = ?", (action_id,))
    audit.record(user.username, "action.withdraw", "action", action_id, json.dumps(_action_row(row)))
    return {"withdrawn": action_id}


POSITIVE_LABELS = ["collector", "fraud", "fraud_core", "handler", "mule", "scam_associate"]
ROLE_LABEL = {"associate": "scam_associate", "layering": "fraud", "sim_farm": "fraud_core"}
NEGATIVE_ROLES = {"bystander"}


@router.get("/model/monitor", summary="Model Monitor")
def model_monitor(user: User = Depends(current_user)):
    """What the model is, how scores are spread, and how well it separates."""
    ds = current()
    ranked = scoring.ranked(ds)
    card = json.loads((SEED / "catalog" / "model_card.json").read_text(encoding="utf-8"))
    values = [s["risk_score"] for s in ranked]
    histogram = [{"from": round(i / 10, 1) if i else 0, "to": round((i + 1) / 10, 1) if i < 9 else 1,
                  "count": sum(1 for v in values if i / 10 <= v < (i + 1) / 10 or (i == 9 and v == 1))} for i in range(10)]
    by_band = {"high": 0, "elevated": 0, "low": 0}
    models: dict[str, int] = {}
    for s in ranked:
        by_band[s["band"]] += 1
        models[s["model"]] = models.get(s["model"], 0) + 1

    positives, negatives, excluded = [], [], []
    for s in ranked:
        role = ds.persons[s["entity_id"]].role
        if role == "victim":
            excluded.append({"entity_id": s["entity_id"], "label": "victim", "score": s["risk_score"]})
        elif role.startswith("legit") or role in NEGATIVE_ROLES:
            negatives.append(s["risk_score"])
        elif role != "unknown":
            positives.append(s["risk_score"])
    pairs = [(p, n) for p in positives for n in negatives]
    auc = round(sum(1.0 if p > n else 0.5 if p == n else 0.0 for p, n in pairs) / len(pairs), 4) if pairs else None
    tp = sum(1 for p in positives if p >= 0.33)
    fp = sum(1 for n in negatives if n >= 0.33)
    return {
        "model": card,
        "distribution": {
            "scored_entities": len(values), "by_band": by_band, "histogram": histogram,
            "mean": round(sum(values) / len(values), 4) if values else None,
            "min": min(values) if values else None, "max": max(values) if values else None, "models_used": models,
        },
        "separation": {
            "available": bool(pairs), "auc": auc, "matched_entities": len(positives) + len(negatives), "unmatched_entities": 0,
            "positive_labels": POSITIVE_LABELS, "threshold": 0.33,
            "confusion": {"true_positive": tp, "false_negative": len(positives) - tp, "false_positive": fp, "true_negative": len(negatives) - fp},
            "recall": round(tp / len(positives), 4) if positives else None,
            "precision": round(tp / (tp + fp), 4) if tp + fp else None,
            "excluded": {
                "labels": ["victim"], "count": len(excluded), "entities": sorted(excluded, key=lambda e: e["entity_id"]),
                "note": "Victims are scored but never counted as fraud or as false positives — a victim legitimately appears in the data.",
            },
            "caveat": card["caveat"],
        },
    }
