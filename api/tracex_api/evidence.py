"""Evidence store: source schemas, ingest, reads and chain verification."""
from __future__ import annotations

import csv
import hashlib
import io
import json
import threading
import uuid
from dataclasses import dataclass

from fastapi import HTTPException

from tracex_api import db, hashing


@dataclass(frozen=True)
class Source:
    key: str
    filename: str
    columns: tuple[str, ...]
    date_column: str
    search_columns: tuple[str, ...]


SOURCES: dict[str, Source] = {
    "cdr": Source(
        "cdr", "cdr.csv",
        ("record_id", "a_party", "b_party", "start_time", "duration_sec", "direction", "call_type", "imei", "imsi", "lac", "cell_id", "tower_lat", "tower_lon"),
        "start_time", ("record_id", "a_party", "b_party", "call_type", "imei", "imsi"),
    ),
    "ipdr": Source(
        "ipdr", "ipdr.csv",
        ("record_id", "msisdn", "imei", "imsi", "session_start", "session_end", "private_ip", "public_ip", "nat_port_start", "bytes_up", "bytes_down", "dest_ip", "dest_port", "protocol", "dest_domain", "app_hint"),
        "session_start", ("record_id", "msisdn", "imei", "imsi", "private_ip", "public_ip", "dest_ip", "protocol", "dest_domain", "app_hint"),
    ),
    "bank": Source(
        "bank", "bank_statements.csv",
        ("record_id", "txn_time", "amount", "direction", "channel", "src_account", "src_ifsc", "src_name", "dst_account", "dst_ifsc", "dst_name", "narration", "balance_after"),
        "txn_time", ("record_id", "channel", "src_account", "src_name", "dst_account", "dst_name", "narration"),
    ),
    "social": Source(
        "social", "social_posts.csv",
        ("record_id", "platform", "handle", "linked_msisdn", "post_time", "post_type", "text", "mentions", "url"),
        "post_time", ("record_id", "platform", "handle", "linked_msisdn", "text", "mentions"),
    ),
    "alpr": Source(
        "alpr", "alpr.csv",
        ("record_id", "read_time", "plate", "camera_id", "confidence"),
        "read_time", ("record_id", "plate", "camera_id"),
    ),
}
TABULAR = ["cdr", "ipdr", "bank", "social"]

# Bumped on every evidence mutation so derived analytics know to recompute.
_version = 0
_version_lock = threading.Lock()


def version() -> int:
    return _version


def bump() -> None:
    global _version
    with _version_lock:
        _version += 1


def require_tabular(source_type: str) -> Source:
    if source_type not in TABULAR:
        raise HTTPException(status_code=400, detail=f"source_type must be one of {TABULAR}")
    return SOURCES[source_type]


def rows(source_type: str) -> list[dict]:
    """All rows of one source, in ingest order, with their ingest metadata."""
    result = []
    for r in db.query(
        "SELECT r.record_id, r.payload, r.row_sha256, r.batch_id, r.seq, r.ingested_at, b.filename "
        "FROM records r JOIN batches b ON b.batch_id = r.batch_id WHERE r.source_type = ? "
        "ORDER BY b.ingested_at, r.batch_id, r.seq",
        (source_type,),
    ):
        payload = json.loads(r["payload"])
        payload["_row_sha256"] = r["row_sha256"]
        payload["_batch_id"] = r["batch_id"]
        payload["_source_filename"] = r["filename"]
        payload["_ingested_at"] = r["ingested_at"]
        result.append(payload)
    return result


def filter_rows(source: Source, all_rows: list[dict], search: str | None, date_from: str | None, date_to: str | None) -> list[dict]:
    needle = (search or "").strip().lower()
    out = []
    for row in all_rows:
        if needle and not any(needle in str(row.get(c, "")).lower() for c in source.search_columns):
            continue
        stamp = str(row.get(source.date_column, ""))
        if date_from and stamp < date_from:
            continue
        if date_to and stamp > date_to:
            continue
        out.append(row)
    return out


def counts() -> dict[str, int]:
    return {r["source_type"]: r["n"] for r in db.query("SELECT source_type, COUNT(*) AS n FROM records GROUP BY source_type")}


def batches(source_type: str | None = None) -> list[dict]:
    sql = "SELECT b.*, (SELECT COUNT(*) FROM records r WHERE r.batch_id = b.batch_id) AS records FROM batches b"
    params: tuple = ()
    if source_type:
        sql += " WHERE b.source_type = ?"
        params = (source_type,)
    return [dict(r) for r in db.query(sql + " ORDER BY b.source_type, b.ingested_at", params)]


# ---- ingest --------------------------------------------------------------------------------
def parse_csv(source: Source, content: bytes) -> list[dict]:
    text = content.decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(text))
    header = [h.strip() for h in (reader.fieldnames or [])]
    missing = [c for c in source.columns if c not in header]
    if missing:
        raise HTTPException(status_code=422, detail=f"{source.key}: missing columns {missing}")
    parsed = []
    for i, raw in enumerate(reader, start=2):
        row = {c: (raw.get(c) or "").strip() for c in source.columns}
        if not row["record_id"]:
            raise HTTPException(status_code=422, detail=f"{source.key}: line {i} has no record_id")
        parsed.append(row)
    if not parsed:
        raise HTTPException(status_code=422, detail=f"{source.key}: the file has no data rows")
    return parsed


def ingest_rows(source_type: str, filename: str, parsed: list[dict], user: str, file_sha: str) -> dict:
    """Append rows as one hash-chained batch. Identical files are not ingested twice."""
    existing = db.doc_get("ingest_files", file_sha)
    if existing:
        return {**existing, "skipped_existing": True, "rows_persisted": 0, "graph_rows_written": 0}
    batch_id = uuid.uuid4().hex
    with db.transaction() as conn:
        head = db.insert_batch(
            conn, source_type=source_type, batch_id=batch_id, filename=filename, ingested_at=db.now_iso(),
            ingested_by=user, rows=[(r["record_id"], r, None) for r in parsed],
        )
    bump()
    result = {
        "source_type": source_type, "filename": filename, "batch_id": batch_id, "file_sha256": file_sha,
        "skipped_existing": False, "rows_persisted": len(parsed), "graph_rows_written": len(parsed),
        "extraction_method": "csv", "chain_head": head,
    }
    db.doc_put("ingest_files", file_sha, result)
    return result


def file_sha256(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()


# ---- verification ----------------------------------------------------------------------------
def verify_batch(batch: dict) -> dict:
    """Re-hash every row and re-walk the chain from the batch genesis."""
    breaches = []
    head = batch["genesis"]
    expected_seq = 1
    verified_through = 0
    for r in db.query("SELECT seq, record_id, payload, row_sha256, chain_hash FROM records WHERE batch_id = ? ORDER BY seq", (batch["batch_id"],)):
        if r["seq"] != expected_seq:
            breaches.append({"kind": "link_broken", "seq": expected_seq, "record_id": None,
                             "expected": f"seq {expected_seq}", "actual": f"seq {r['seq']}",
                             "detail": "a record is missing from the sequence recorded at ingest"})
            expected_seq = r["seq"]
        actual_row = hashing.row_sha256(json.loads(r["payload"]))
        if actual_row != r["row_sha256"]:
            breaches.append({"kind": "content_altered", "seq": r["seq"], "record_id": r["record_id"],
                             "expected": r["row_sha256"], "actual": actual_row,
                             "detail": "the stored row no longer hashes to the value recorded at ingest"})
        head = hashing.link(head, r["row_sha256"])
        if head != r["chain_hash"]:
            breaches.append({"kind": "chain_recomputed", "seq": r["seq"], "record_id": r["record_id"],
                             "expected": head, "actual": r["chain_hash"],
                             "detail": "the stored chain value does not follow from the previous link"})
            head = r["chain_hash"]
        if not breaches:
            verified_through = r["seq"]
        expected_seq += 1
    if head != batch["chain_head"] and not breaches:
        breaches.append({"kind": "chain_recomputed", "seq": expected_seq - 1, "record_id": None,
                         "expected": batch["chain_head"], "actual": head, "detail": "the batch head does not match its last link"})
    return {
        "source_type": batch["source_type"], "batch_id": batch["batch_id"], "filename": batch["filename"],
        "intact": not breaches, "records": batch["records"], "verified_through_seq": verified_through,
        "first_breach": breaches[0] if breaches else None, "breaches": breaches[:50], "breach_count": len(breaches),
        "chain_head": batch["chain_head"],
    }
