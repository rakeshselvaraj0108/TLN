import hashlib
import json
from datetime import datetime
from typing import Any
from uuid import UUID

import pandas as pd
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    IngestionBatch, RejectedRow, SourceRecord, SourceKind, IngestionStatus,
    Entity, Claim, EpistemicClass
)
from app.graph.connection import Neo4jConnection
from app.graph.queries import CYPHER_QUERIES


SOURCE_SCHEMAS = {
    SourceKind.CDR: {
        "required": ["record_id", "a_party", "b_party", "start_time", "duration_sec", "direction", "call_type", "imei", "imsi", "lac", "cell_id", "tower_lat", "tower_lon"],
        "types": {
            "record_id": str, "a_party": str, "b_party": str, "start_time": str,
            "duration_sec": int, "direction": str, "call_type": str,
            "imei": str, "imsi": str, "lac": str, "cell_id": str,
            "tower_lat": float, "tower_lon": float
        }
    },
    SourceKind.IPDR: {
        "required": ["record_id", "msisdn", "imei", "session_start", "session_end", "public_ip", "dest_ip", "dest_port", "dest_domain"],
        "types": {
            "record_id": str, "msisdn": str, "imei": str,
            "session_start": str, "session_end": str,
            "public_ip": str, "dest_ip": str, "dest_port": int, "dest_domain": str
        }
    },
    SourceKind.BANK: {
        "required": ["record_id", "txn_time", "amount", "direction", "channel", "src_account", "src_ifsc", "dst_account", "dst_ifsc", "narration"],
        "types": {
            "record_id": str, "txn_time": str, "amount": float, "direction": str,
            "channel": str, "src_account": str, "src_ifsc": str,
            "dst_account": str, "dst_ifsc": str, "narration": str
        }
    },
    SourceKind.SOCIAL: {
        "required": ["record_id", "handle", "platform", "post_type", "text", "mentions", "linked_phone"],
        "types": {
            "record_id": str, "handle": str, "platform": str,
            "post_type": str, "text": str, "mentions": str, "linked_phone": str
        }
    },
    SourceKind.ALPR: {
        "required": ["record_id", "plate", "camera_id", "cam_lat", "cam_lon", "confidence"],
        "types": {
            "record_id": str, "plate": str, "camera_id": str,
            "cam_lat": float, "cam_lon": float, "confidence": float
        }
    },
}


def compute_row_sha256(row: dict) -> str:
    canonical = json.dumps(row, sort_keys=True, separators=(",", ":"), default=str)
    return hashlib.sha256(canonical.encode()).hexdigest()


def compute_batch_hash(rows: list[dict]) -> str:
    combined = "".join(compute_row_sha256(row) for row in rows)
    return hashlib.sha256(combined.encode()).hexdigest()


def validate_row(row: dict, source_type: SourceKind) -> tuple[bool, str]:
    schema = SOURCE_SCHEMAS.get(source_type)
    if not schema:
        return False, f"Unknown source type: {source_type}"

    for field in schema["required"]:
        if field not in row or row[field] is None or row[field] == "":
            return False, f"Missing required field: {field}"

    return True, ""


async def ingest_csv_file(
    session: AsyncSession,
    file_content: bytes,
    source_type: SourceKind,
    filename: str,
    user_id: UUID
) -> IngestionBatch:
    df = pd.read_csv(pd.io.common.BytesIO(file_content))
    rows = df.to_dict(orient="records")

    batch_hash = compute_batch_hash(rows)

    existing = await session.execute(
        select(IngestionBatch).where(IngestionBatch.batch_hash == batch_hash)
    )
    if existing.scalar_one_or_none():
        raise ValueError(f"Batch with hash {batch_hash} already exists (idempotent)")

    prev_batch = await session.execute(
        select(IngestionBatch)
        .where(IngestionBatch.source_type == source_type)
        .order_by(IngestionBatch.chain_position.desc())
        .limit(1)
    )
    prev_batch_obj = prev_batch.scalar_one_or_none()

    batch = IngestionBatch(
        batch_hash=batch_hash,
        source_type=source_type,
        source_filename=filename,
        source_size_bytes=len(file_content),
        row_count=len(rows),
        prev_batch_hash=prev_batch_obj.batch_hash if prev_batch_obj else None,
        chain_position=(prev_batch_obj.chain_position + 1) if prev_batch_obj else 0,
        ingested_by=user_id,
        status=IngestionStatus.PROCESSING,
    )
    session.add(batch)
    await session.flush()

    accepted = 0
    rejected_rows = []

    for idx, row in enumerate(rows):
        row_sha256 = compute_row_sha256(row)
        is_valid, reason = validate_row(row, source_type)

        if not is_valid:
            rejected = RejectedRow(
                batch_id=batch.id,
                row_number=idx + 1,
                raw_data=row,
                rejection_reason=reason,
                row_sha256=row_sha256,
            )
            session.add(rejected)
            rejected_rows.append(rejected)
            continue

        source_record = SourceRecord(
            batch_id=batch.id,
            row_sha256=row_sha256,
            source_type=source_type,
            row_number=idx + 1,
            payload=row,
        )
        session.add(source_record)
        accepted += 1

    batch.accepted_rows = accepted
    batch.rejected_rows = len(rejected_rows)
    batch.status = IngestionStatus.COMPLETED
    batch.completed_at = datetime.utcnow()

    await session.flush()
    return batch


async def load_batch_to_graph(session: AsyncSession, batch_id: UUID) -> dict:
    result = await session.execute(
        select(SourceRecord).where(SourceRecord.batch_id == batch_id)
    )
    records = result.scalars().all()

    stats = {"nodes_created": 0, "relationships_created": 0, "errors": 0}

    for record in records:
        try:
            await _ingest_record_to_graph(record)
            stats["nodes_created"] += 1
        except Exception as e:
            stats["errors"] += 1

    return stats


async def _ingest_record_to_graph(record: SourceRecord) -> None:
    payload = record.payload
    source_type = record.source_type

    driver = await Neo4jConnection.get_driver()
    async with driver.session() as neo4j_session:
        if source_type == SourceKind.CDR:
            await _ingest_cdr(neo4j_session, payload, record.row_sha256)
        elif source_type == SourceKind.IPDR:
            await _ingest_ipdr(neo4j_session, payload, record.row_sha256)
        elif source_type == SourceKind.BANK:
            await _ingest_bank(neo4j_session, payload, record.row_sha256)
        elif source_type == SourceKind.SOCIAL:
            await _ingest_social(neo4j_session, payload, record.row_sha256)
        elif source_type == SourceKind.ALPR:
            await _ingest_alpr(neo4j_session, payload, record.row_sha256)


async def _ingest_cdr(session, payload: dict, row_sha256: str) -> None:
    await session.run(CYPHER_QUERIES["create_call"], {
        "record_id": payload["record_id"],
        "a_party": payload["a_party"],
        "b_party": payload["b_party"],
        "start_time": payload["start_time"],
        "duration_sec": payload["duration_sec"],
        "direction": payload["direction"],
        "call_type": payload["call_type"],
        "imei": payload["imei"],
        "imsi": payload["imsi"],
        "lac": payload["lac"],
        "cell_id": payload["cell_id"],
        "tower_lat": payload["tower_lat"],
        "tower_lon": payload["tower_lon"],
        "row_sha256": row_sha256,
    })


async def _ingest_ipdr(session, payload: dict, row_sha256: str) -> None:
    await session.run(CYPHER_QUERIES["create_data_session"], {
        "record_id": payload["record_id"],
        "msisdn": payload["msisdn"],
        "imei": payload["imei"],
        "session_start": payload["session_start"],
        "session_end": payload["session_end"],
        "public_ip": payload["public_ip"],
        "dest_ip": payload["dest_ip"],
        "dest_port": payload["dest_port"],
        "dest_domain": payload["dest_domain"],
        "row_sha256": row_sha256,
    })


async def _ingest_bank(session, payload: dict, row_sha256: str) -> None:
    await session.run(CYPHER_QUERIES["create_txn"], {
        "record_id": payload["record_id"],
        "txn_time": payload["txn_time"],
        "amount": payload["amount"],
        "direction": payload["direction"],
        "channel": payload["channel"],
        "src_account": payload["src_account"],
        "src_ifsc": payload["src_ifsc"],
        "dst_account": payload["dst_account"],
        "dst_ifsc": payload["dst_ifsc"],
        "narration": payload["narration"],
        "row_sha256": row_sha256,
    })


async def _ingest_social(session, payload: dict, row_sha256: str) -> None:
    await session.run(CYPHER_QUERIES["create_post"], {
        "record_id": payload["record_id"],
        "handle": payload["handle"],
        "platform": payload["platform"],
        "post_type": payload["post_type"],
        "text": payload["text"],
        "mentions": payload["mentions"],
        "linked_phone": payload["linked_phone"],
        "row_sha256": row_sha256,
    })


async def _ingest_alpr(session, payload: dict, row_sha256: str) -> None:
    pass