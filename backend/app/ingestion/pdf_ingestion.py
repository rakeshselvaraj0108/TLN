import hashlib
import json
import re
from datetime import datetime
from typing import Any
from uuid import UUID

import pdfplumber
import pandas as pd
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import IngestionBatch, RejectedRow, SourceRecord, SourceKind, IngestionStatus
from app.ingestion.csv_ingestion import compute_row_sha256, compute_batch_hash


BANK_PATTERNS = {
    "hdfc": re.compile(r"(\d{2}/\d{2}/\d{4})\s+(\d{2}:\d{2}:\d{2})\s+(.+?)\s+(\d+[\d,]*)\.(\d{2})\s+(\d+[\d,]*)\.(\d{2})"),
    "icici": re.compile(r"(\d{2}-\w{3}-\d{4})\s+(.+?)\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})"),
    "sbi": re.compile(r"(\d{2}/\d{2}/\d{4})\s+(.+?)\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})"),
    "generic": re.compile(r"(\d{2}[/-]\d{2}[/-]\d{4}).+?([\d,]+\.\d{2}).+?([\d,]+\.\d{2})"),
}


def parse_bank_pdf(file_content: bytes) -> list[dict]:
    rows = []
    with pdfplumber.open(pd.io.common.BytesIO(file_content)) as pdf:
        for page in pdf.pages:
            text = page.extract_text()
            if not text:
                continue

            for pattern_name, pattern in BANK_PATTERNS.items():
                for match in pattern.finditer(text):
                    try:
                        row = _parse_bank_match(match, pattern_name)
                        if row:
                            rows.append(row)
                    except Exception:
                        continue
    return rows


def _parse_bank_match(match: re.Match, pattern_name: str) -> dict | None:
    groups = match.groups()
    if not groups:
        return None

    record_id = hashlib.md5(match.group(0).encode()).hexdigest()[:16]

    if pattern_name == "hdfc":
        return {
            "record_id": record_id,
            "txn_time": f"{groups[0]} {groups[1]}",
            "amount": float(groups[3].replace(",", "") + "." + groups[4]),
            "direction": "debit" if "DEBIT" in groups[2].upper() else "credit",
            "channel": "NEFT/IMPS/UPI",
            "src_account": "UNKNOWN",
            "src_ifsc": "UNKNOWN",
            "dst_account": "UNKNOWN",
            "dst_ifsc": "UNKNOWN",
            "narration": groups[2].strip(),
        }
    elif pattern_name == "icici":
        amount = float(groups[2].replace(",", ""))
        balance = float(groups[3].replace(",", ""))
        return {
            "record_id": record_id,
            "txn_time": groups[0],
            "amount": amount,
            "direction": "debit" if amount > 0 else "credit",
            "channel": "NEFT/IMPS/UPI",
            "src_account": "UNKNOWN",
            "src_ifsc": "UNKNOWN",
            "dst_account": "UNKNOWN",
            "dst_ifsc": "UNKNOWN",
            "narration": groups[1].strip(),
        }
    elif pattern_name == "sbi":
        return {
            "record_id": record_id,
            "txn_time": groups[0],
            "amount": float(groups[2].replace(",", "")),
            "direction": "debit" if "DR" in groups[1].upper() else "credit",
            "channel": "NEFT/IMPS/UPI",
            "src_account": "UNKNOWN",
            "src_ifsc": "UNKNOWN",
            "dst_account": "UNKNOWN",
            "dst_ifsc": "UNKNOWN",
            "narration": groups[1].strip(),
        }

    return None


async def ingest_bank_pdf(
    session: AsyncSession,
    file_content: bytes,
    filename: str,
    user_id: UUID
) -> IngestionBatch:
    rows = parse_bank_pdf(file_content)

    if not rows:
        rows = [{
            "record_id": "empty",
            "txn_time": datetime.utcnow().isoformat(),
            "amount": 0.0,
            "direction": "unknown",
            "channel": "unknown",
            "src_account": "unknown",
            "src_ifsc": "unknown",
            "dst_account": "unknown",
            "dst_ifsc": "unknown",
            "narration": "No transactions extracted from PDF",
        }]

    batch_hash = compute_batch_hash(rows)

    from sqlalchemy import select
    existing = await session.execute(
        select(IngestionBatch).where(IngestionBatch.batch_hash == batch_hash)
    )
    if existing.scalar_one_or_none():
        raise ValueError(f"Batch with hash {batch_hash} already exists (idempotent)")

    prev_batch = await session.execute(
        select(IngestionBatch)
        .where(IngestionBatch.source_type == SourceKind.BANK)
        .order_by(IngestionBatch.chain_position.desc())
        .limit(1)
    )
    prev_batch_obj = prev_batch.scalar_one_or_none()

    batch = IngestionBatch(
        batch_hash=batch_hash,
        source_type=SourceKind.BANK,
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
    for idx, row in enumerate(rows):
        row_sha256 = compute_row_sha256(row)

        source_record = SourceRecord(
            batch_id=batch.id,
            row_sha256=row_sha256,
            source_type=SourceKind.BANK,
            row_number=idx + 1,
            payload=row,
        )
        session.add(source_record)
        accepted += 1

    batch.accepted_rows = accepted
    batch.rejected_rows = 0
    batch.status = IngestionStatus.COMPLETED
    batch.completed_at = datetime.utcnow()

    await session.flush()
    return batch