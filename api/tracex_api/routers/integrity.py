"""Routes tagged "integrity"."""
from __future__ import annotations

import json
import secrets

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from tracex_api import audit, db, evidence, hashing
from tracex_api.auth import User, current_user, require_supervisor

router = APIRouter(tags=["integrity"])

CONFIRM = "I UNDERSTAND THIS ALTERS STORED EVIDENCE"


class TamperDrillIn(BaseModel):
    source_type: str = "bank"
    record_id: str | None = None
    field: str = "amount"
    new_value: str = "1"
    confirm: str


class RestoreIn(BaseModel):
    source_type: str
    record_id: str
    restore_token: str | None = None


@router.get("/integrity/verify", summary="Verify")
def verify(source_type: str | None = Query(None), user: User = Depends(current_user)):
    """Re-hash every stored record and re-walk every chain."""
    results = [evidence.verify_batch(b) for b in evidence.batches(source_type)]
    total = sum(b["records"] for b in results)
    compromised = sum(1 for b in results if not b["intact"])
    if compromised:
        summary = f"{compromised} of {len(results)} batches failed verification — stored evidence no longer matches what was recorded at ingest."
    else:
        summary = f"{total} records across {len(results)} batches re-hashed and verified against the chain recorded at ingest."
    return {
        "all_intact": compromised == 0,
        "batches": results,
        "batch_count": len(results),
        "total_records": total,
        "compromised_batches": compromised,
        "summary": summary,
    }


def _record(source_type: str, record_id: str | None):
    if record_id:
        row = db.query_one("SELECT id, record_id, payload, row_sha256 FROM records WHERE source_type = ? AND record_id = ? ORDER BY id LIMIT 1", (source_type, record_id))
    else:
        row = db.query_one("SELECT id, record_id, payload, row_sha256 FROM records WHERE source_type = ? ORDER BY id LIMIT 1", (source_type,))
    if not row:
        raise HTTPException(status_code=404, detail=f"no {source_type} record {record_id or ''}".strip())
    return row


@router.post("/integrity/drill", summary="Tamper Drill")
def tamper_drill(body: TamperDrillIn, user: User = Depends(current_user)):
    """Alter one stored record in place so the verifier can be seen catching it."""
    require_supervisor(user, "the tamper drill alters stored evidence and requires the supervisor role")
    if body.confirm != CONFIRM:
        raise HTTPException(status_code=422, detail=f"confirm must be exactly: {CONFIRM}")
    if body.source_type not in evidence.SOURCES:
        raise HTTPException(status_code=422, detail=f"unknown source_type {body.source_type}")
    row = _record(body.source_type, body.record_id)
    payload = json.loads(row["payload"])
    if body.field not in payload or body.field == "record_id":
        raise HTTPException(status_code=422, detail=f"{body.source_type} records have no editable field '{body.field}'")
    original = payload[body.field]
    payload[body.field] = body.new_value
    db.execute("UPDATE records SET payload = ? WHERE id = ?", (json.dumps(payload, ensure_ascii=False), row["id"]))
    evidence.bump()
    token = secrets.token_urlsafe(16)
    drill = {
        "source_type": body.source_type, "record_id": row["record_id"], "field": body.field,
        "original_value": original, "new_value": body.new_value, "restore_token": token,
        "recorded_row_sha256": row["row_sha256"], "altered_row_sha256": hashing.row_sha256(payload),
    }
    db.doc_put("drills", f"{body.source_type}:{row['record_id']}", {**drill, "by": user.username, "at": db.now_iso()})
    audit.record(user.username, "integrity.drill", body.source_type, row["record_id"],
                 json.dumps({"field": body.field, "original_value": original, "new_value": body.new_value}))
    return {**drill, "next": "GET /integrity/verify will now name this record"}


@router.post("/integrity/restore", summary="Restore")
def restore(body: RestoreIn, user: User = Depends(current_user)):
    """Put a drilled record back exactly as it was ingested."""
    require_supervisor(user, "restoring stored evidence requires the supervisor role")
    row = _record(body.source_type, body.record_id)
    drill = db.doc_get("drills", f"{body.source_type}:{body.record_id}")
    if drill is None:
        # Reconstruct from the drill's own audit entry.
        entry = db.query_one("SELECT detail FROM audit WHERE action = 'integrity.drill' AND target_type = ? AND target_id = ? ORDER BY id DESC LIMIT 1",
                             (body.source_type, body.record_id))
        if not entry:
            raise HTTPException(status_code=404, detail="no drill is recorded against this record")
        drill = json.loads(entry["detail"])
    elif body.restore_token and body.restore_token != drill.get("restore_token"):
        raise HTTPException(status_code=403, detail="restore token does not match the drill")
    payload = json.loads(row["payload"])
    payload[drill["field"]] = drill["original_value"]
    if hashing.row_sha256(payload) != row["row_sha256"]:
        raise HTTPException(status_code=409, detail="the reconstructed record does not hash to the value recorded at ingest; not written")
    db.execute("UPDATE records SET payload = ? WHERE id = ?", (json.dumps(payload, ensure_ascii=False), row["id"]))
    db.doc_delete("drills", f"{body.source_type}:{body.record_id}")
    evidence.bump()
    audit.record(user.username, "integrity.restore", body.source_type, body.record_id, f"field={drill['field']}")
    return {"source_type": body.source_type, "record_id": body.record_id, "restored": True, "row_sha256": row["row_sha256"]}
