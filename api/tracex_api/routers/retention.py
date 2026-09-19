"""Routes tagged "retention"."""
from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query

from tracex_api import audit, db
from tracex_api.auth import User, current_user, require_supervisor

router = APIRouter(tags=["retention"])

NOTE = (
    "Zero means retained indefinitely. A window of 0 is a deliberate default — the agency sets its own "
    "schedule against its evidential requirements; the system does not invent one."
)


def _windows() -> dict[str, int]:
    return {
        "records_days": int(os.environ.get("TRACEX_RETAIN_RECORDS_DAYS", 0)),
        "audit_days": int(os.environ.get("TRACEX_RETAIN_AUDIT_DAYS", 0)),
        "sessions_days": int(os.environ.get("TRACEX_RETAIN_SESSIONS_DAYS", 0)),
    }


@router.get("/retention/policy", summary="Policy")
def policy(user: User = Depends(current_user)):
    windows = _windows()
    return {
        "windows": windows,
        "dry_run_default": True,
        "configured_classes": [k for k, v in windows.items() if v],
        "enforcing": any(windows.values()),
        "note": NOTE,
    }


@router.post("/retention/sweep", summary="Sweep")
def sweep(dry_run: bool = Query(True), user: User = Depends(current_user)):
    """Apply the retention windows. Evidence and audit deletions are supervisor-only."""
    if not dry_run:
        require_supervisor(user, "a retention sweep that deletes data requires the supervisor role")
    windows = _windows()
    now = datetime.now(timezone.utc)
    result = {}
    if windows["audit_days"]:
        cutoff = (now - timedelta(days=windows["audit_days"])).isoformat()
        result["audit"] = db.query_one("SELECT COUNT(*) AS n FROM audit WHERE ts < ?", (cutoff,))["n"]
        if not dry_run:
            db.execute("DELETE FROM audit WHERE ts < ?", (cutoff,))
    if windows["sessions_days"]:
        cutoff = (now - timedelta(days=windows["sessions_days"])).isoformat()
        result["sessions"] = db.query_one("SELECT COUNT(*) AS n FROM docs WHERE collection IN ('ask_turns','reasoning') AND updated_at < ?", (cutoff,))["n"]
        if not dry_run:
            db.execute("DELETE FROM docs WHERE collection IN ('ask_turns','reasoning') AND updated_at < ?", (cutoff,))
    if windows["records_days"]:
        cutoff = (now - timedelta(days=windows["records_days"])).isoformat()
        result["records"] = db.query_one("SELECT COUNT(*) AS n FROM records WHERE ingested_at < ?", (cutoff,))["n"]
    audit.record(user.username, "retention.sweep", "retention", None, f"dry_run={dry_run} {result}")
    return {"dry_run": dry_run, "windows": windows, "affected": result, "enforcing": any(windows.values())}
