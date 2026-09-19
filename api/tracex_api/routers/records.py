"""Routes tagged "records"."""
from __future__ import annotations

import csv
import io
import math

from fastapi import APIRouter, Depends, Path, Query
from fastapi.responses import Response

from tracex_api import audit, evidence
from tracex_api.auth import User, current_user, export_user

router = APIRouter(tags=["records"])


@router.get("/records/{source_type}", summary="List Records")
def list_records(
    source_type: str = Path(...),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=500),
    search: str | None = Query(None),
    date_from: str | None = Query(None),
    date_to: str | None = Query(None),
    user: User = Depends(current_user),
):
    """One page of parsed source rows, each carrying its chain hash."""
    source = evidence.require_tabular(source_type)
    matched = evidence.filter_rows(source, evidence.rows(source_type), search, date_from, date_to)
    total = len(matched)
    start = (page - 1) * page_size
    return {
        "source_type": source_type,
        "columns": list(source.columns),
        "rows": matched[start:start + page_size],
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": max(1, math.ceil(total / page_size)),
    }


@router.get("/records/{source_type}/export", summary="Export Records")
def export_records(
    source_type: str = Path(...),
    search: str | None = Query(None),
    date_from: str | None = Query(None),
    date_to: str | None = Query(None),
    user: User = Depends(export_user),
):
    """CSV of every row matching the current filters, hashes included. Audited."""
    source = evidence.require_tabular(source_type)
    matched = evidence.filter_rows(source, evidence.rows(source_type), search, date_from, date_to)
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow([*source.columns, "row_sha256", "batch_id", "source_filename"])
    for row in matched:
        writer.writerow([*(row.get(c, "") for c in source.columns), row["_row_sha256"], row["_batch_id"], row["_source_filename"]])
    audit.record(user.username, "records.export", "records", source_type, f"search={search} from={date_from} to={date_to}")
    return Response(
        content=buffer.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{source_type}_records.csv"'},
    )


@router.get("/records", summary="Records Summary")
def records_summary(user: User = Depends(current_user)):
    """Per-source counts — the header strip above the record tables."""
    counts = evidence.counts()
    ordered = {k: counts.get(k, 0) for k in ["ipdr", "alpr", "bank", "cdr", "social"]}
    return {"counts": ordered, "total": sum(ordered.values())}


# ---- anomalies and watchlist ------------------------------------------------------------------
from collections import Counter  # noqa: E402

from fastapi import HTTPException  # noqa: E402
from pydantic import BaseModel  # noqa: E402

from tracex_api import db  # noqa: E402
from tracex_api.engine import anomalies as anomaly_rules  # noqa: E402
from tracex_api.engine import scoring  # noqa: E402
from tracex_api.engine.dataset import current  # noqa: E402

TARGET_KINDS = {"phone", "imei", "imsi", "account", "upi", "ip", "handle"}


class TargetIn(BaseModel):
    kind: str
    value: str
    label: str | None = None
    notes: str | None = None


@router.get("/anomalies", summary="Anomalies")
def anomalies(source: str = Query("all", pattern="^(all|cdr|ipdr|bank)$"), user: User = Depends(current_user)):
    """Threshold rules over raw rows. Observations, not findings."""
    findings = anomaly_rules.scan(current(), source)
    by_severity = {k: 0 for k in ("critical", "high", "medium")}
    for f in findings:
        by_severity[f["severity"]] = by_severity.get(f["severity"], 0) + 1
    return {
        "findings": findings,
        "total": len(findings),
        "by_severity": by_severity,
        "by_rule": dict(sorted(Counter(f["rule"] for f in findings).items())),
        "thresholds": anomaly_rules.THRESHOLDS,
    }


def _target_row(r) -> dict:
    ds = current()
    kind, value = r["kind"], r["value"]
    lookup = {"phone": ds.by_phone, "imei": ds.by_device, "account": ds.by_account, "handle": ds.by_handle}.get(kind, {})
    return {"id": r["id"], "kind": kind, "value": value, "label": r["label"], "notes": r["notes"], "entity_id": lookup.get(value),
            "created_by": r["created_by"], "created_at": r["created_at"]}


@router.get("/targets", summary="List Targets")
def list_targets(user: User = Depends(current_user)):
    rows = [_target_row(r) for r in db.query("SELECT * FROM targets ORDER BY id DESC")]
    return {"targets": rows, "total": len(rows)}


@router.post("/targets", status_code=201, summary="Add Target")
def add_target(body: TargetIn, user: User = Depends(current_user)):
    if body.kind not in TARGET_KINDS:
        raise HTTPException(status_code=422, detail=f"kind must be one of {sorted(TARGET_KINDS)}")
    value = body.value.strip()
    if not value:
        raise HTTPException(status_code=422, detail="value is required")
    if db.query_one("SELECT 1 FROM targets WHERE kind = ? AND value = ?", (body.kind, value)):
        raise HTTPException(status_code=409, detail=f"{body.kind} {value} is already on the watchlist")
    cur = db.execute("INSERT INTO targets(kind, value, label, notes, created_by, created_at) VALUES (?,?,?,?,?,?)",
                     (body.kind, value, body.label, body.notes, user.username, db.now_iso()))
    audit.record(user.username, "target.add", body.kind, value, body.label)
    return _target_row(db.query_one("SELECT * FROM targets WHERE id = ?", (cur.lastrowid,)))


@router.get("/targets/suggested", summary="Suggested Targets")
def suggested_targets(limit: int = Query(12, ge=1, le=100), user: User = Depends(current_user)):
    """Identifiers worth watching, drawn from the entities already scored highest."""
    ds = current()
    watched = {(r["kind"], r["value"]) for r in db.query("SELECT kind, value FROM targets")}
    out = []
    for s in scoring.ranked(ds):
        if s["band"] == "low":
            continue
        p = ds.persons[s["entity_id"]]
        idents = [("account", a) for a in p.accounts] + [("imei", d) for d in p.devices] + [("phone", ph) for ph in p.phones] + [("handle", h["handle"]) for h in p.handles]
        for kind, value in idents:
            if (kind, value) in watched:
                continue
            pct = round(s["risk_score"] * 100, 1)
            out.append({"kind": kind, "value": value, "entity_id": p.entity_id, "risk_score": pct, "band": s["band"],
                        "reason": f"Controlled by {p.entity_id}, which the {s['model']} model assessed at {round(pct)} ({s['band']} band)."})
            if len(out) >= limit:
                return {"suggestions": out, "total": len(out)}
    return {"suggestions": out, "total": len(out)}


@router.delete("/targets/{target_id}", summary="Remove Target")
def remove_target(target_id: int, user: User = Depends(current_user)):
    row = db.query_one("SELECT * FROM targets WHERE id = ?", (target_id,))
    if not row:
        raise HTTPException(status_code=404, detail="no such target")
    db.execute("DELETE FROM targets WHERE id = ?", (target_id,))
    audit.record(user.username, "target.remove", row["kind"], row["value"])
    return {"removed": target_id}
