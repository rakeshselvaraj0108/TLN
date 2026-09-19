"""SQLite storage for evidence, case work and agent state.

A single file database keeps the service self-contained. Evidence rows live in `records` with the
hash recorded at ingest and their chain link; everything else is either a small relational table
or a JSON document in `docs` (reasoning ledgers, agent traces, conversation turns).

The database is created and seeded on first start from `seed_data/`.
"""
from __future__ import annotations

import csv
import json
import os
import sqlite3
import threading
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path

from tracex_api import hashing

SEED = Path(__file__).parent / "seed_data"
DB_PATH = Path(os.environ.get("TRACEX_DB", Path(__file__).resolve().parents[1] / "data" / "tracex.db"))

SCHEMA = """
CREATE TABLE IF NOT EXISTS batches (
  batch_id TEXT PRIMARY KEY,
  source_type TEXT NOT NULL,
  filename TEXT NOT NULL,
  ingested_at TEXT NOT NULL,
  ingested_by TEXT NOT NULL DEFAULT 'system',
  genesis TEXT NOT NULL,
  chain_head TEXT NOT NULL,
  last_ingested_at TEXT,
  storage_order INTEGER NOT NULL DEFAULT 1000000
);
CREATE TABLE IF NOT EXISTS records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_type TEXT NOT NULL,
  batch_id TEXT NOT NULL REFERENCES batches(batch_id),
  seq INTEGER NOT NULL,
  record_id TEXT NOT NULL,
  payload TEXT NOT NULL,
  row_sha256 TEXT NOT NULL,
  chain_hash TEXT NOT NULL,
  ingested_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS records_source ON records(source_type, record_id);
CREATE UNIQUE INDEX IF NOT EXISTS records_batch_seq ON records(batch_id, seq);
CREATE TABLE IF NOT EXISTS audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  detail TEXT
);
CREATE TABLE IF NOT EXISTS cases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  case_code TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  status TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS case_entities (
  case_id INTEGER NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  entity_id TEXT NOT NULL,
  entity_kind TEXT NOT NULL,
  label TEXT,
  added_by TEXT NOT NULL,
  added_at TEXT NOT NULL,
  PRIMARY KEY (case_id, entity_id)
);
CREATE TABLE IF NOT EXISTS case_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  case_id INTEGER NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  author TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subject TEXT NOT NULL,
  subject_b TEXT,
  subject_kind TEXT NOT NULL,
  body TEXT NOT NULL,
  author TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS actions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_id TEXT NOT NULL,
  action TEXT NOT NULL,
  rationale TEXT NOT NULL,
  case_id INTEGER,
  risk_score REAL,
  band TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS targets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  value TEXT NOT NULL,
  label TEXT,
  notes TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (kind, value)
);
CREATE TABLE IF NOT EXISTS docs (
  collection TEXT NOT NULL,
  id TEXT NOT NULL,
  data TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (collection, id)
);
CREATE TABLE IF NOT EXISTS counters (
  name TEXT PRIMARY KEY,
  value INTEGER NOT NULL
);
"""

_lock = threading.RLock()
_conn: sqlite3.Connection | None = None


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def connection() -> sqlite3.Connection:
    global _conn
    with _lock:
        if _conn is None:
            DB_PATH.parent.mkdir(parents=True, exist_ok=True)
            fresh = not DB_PATH.exists()
            conn = sqlite3.connect(DB_PATH, check_same_thread=False, isolation_level=None)
            conn.row_factory = sqlite3.Row
            conn.execute("PRAGMA foreign_keys = ON")
            conn.execute("PRAGMA journal_mode = WAL")
            conn.executescript(SCHEMA)
            _conn = conn
            if fresh:
                seed(conn)
        return _conn


@contextmanager
def transaction():
    conn = connection()
    with _lock:
        conn.execute("BEGIN IMMEDIATE")
        try:
            yield conn
            conn.execute("COMMIT")
        except BaseException:
            conn.execute("ROLLBACK")
            raise


def query(sql: str, params: tuple | list = ()) -> list[sqlite3.Row]:
    with _lock:
        return connection().execute(sql, params).fetchall()


def query_one(sql: str, params: tuple | list = ()) -> sqlite3.Row | None:
    with _lock:
        return connection().execute(sql, params).fetchone()


def execute(sql: str, params: tuple | list = ()) -> sqlite3.Cursor:
    with _lock:
        return connection().execute(sql, params)


# ---- document collections -----------------------------------------------------------------
def doc_put(collection: str, doc_id: str | int, data: dict) -> None:
    execute(
        "INSERT INTO docs(collection, id, data, updated_at) VALUES (?, ?, ?, ?) "
        "ON CONFLICT(collection, id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at",
        (collection, str(doc_id), json.dumps(data, ensure_ascii=False), now_iso()),
    )


def doc_get(collection: str, doc_id: str | int) -> dict | None:
    row = query_one("SELECT data FROM docs WHERE collection = ? AND id = ?", (collection, str(doc_id)))
    return json.loads(row["data"]) if row else None


def doc_list(collection: str) -> list[dict]:
    return [json.loads(r["data"]) for r in query("SELECT data FROM docs WHERE collection = ? ORDER BY updated_at", (collection,))]


def doc_delete(collection: str, doc_id: str | int) -> bool:
    return execute("DELETE FROM docs WHERE collection = ? AND id = ?", (collection, str(doc_id))).rowcount > 0


def next_id(name: str) -> int:
    with transaction() as conn:
        row = conn.execute("SELECT value FROM counters WHERE name = ?", (name,)).fetchone()
        value = (row["value"] if row else 0) + 1
        conn.execute(
            "INSERT INTO counters(name, value) VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET value = excluded.value",
            (name, value),
        )
        return value


def set_counter(conn: sqlite3.Connection, name: str, value: int) -> None:
    conn.execute(
        "INSERT INTO counters(name, value) VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET value = MAX(value, excluded.value)",
        (name, value),
    )


# ---- seeding --------------------------------------------------------------------------------
def _load(rel: str):
    return json.loads((SEED / rel).read_text(encoding="utf-8"))


def insert_batch(conn: sqlite3.Connection, *, source_type: str, batch_id: str, filename: str, ingested_at: str,
                 ingested_by: str, rows: list[tuple[str, dict, str | None]], last_ingested_at: str | None = None,
                 storage_order: int | None = None) -> str:
    """Insert one ingest batch. rows = (record_id, payload, recorded_sha or None to compute)."""
    genesis = hashing.genesis(batch_id)
    head = genesis
    if storage_order is None:
        storage_order = -(conn.execute("SELECT COUNT(*) AS n FROM batches").fetchone()["n"] + 1)  # newest first
    conn.execute(
        "INSERT INTO batches(batch_id, source_type, filename, ingested_at, ingested_by, genesis, chain_head, last_ingested_at, storage_order) VALUES (?,?,?,?,?,?,?,?,?)",
        (batch_id, source_type, filename, ingested_at, ingested_by, genesis, genesis, last_ingested_at or ingested_at, storage_order),
    )
    for seq, (record_id, payload, recorded_sha) in enumerate(rows, start=1):
        sha = recorded_sha or hashing.row_sha256(payload)
        head = hashing.link(head, sha)
        conn.execute(
            "INSERT INTO records(source_type, batch_id, seq, record_id, payload, row_sha256, chain_hash, ingested_at) VALUES (?,?,?,?,?,?,?,?)",
            (source_type, batch_id, seq, record_id, json.dumps(payload, ensure_ascii=False), sha, head, ingested_at),
        )
    conn.execute("UPDATE batches SET chain_head = ? WHERE batch_id = ?", (head, batch_id))
    return head


def seed(conn: sqlite3.Connection) -> None:
    conn.execute("BEGIN IMMEDIATE")
    try:
        for batch in _load("batches.json"):
            source = batch["source_type"]
            if source == "alpr":
                # The original ALPR CSV had columns the deployment never exposed, so these rows are re-hashed from
                # the fields that were recoverable; their row hashes (and this batch's chain head) differ from the old ones.
                reads = _load("records/alpr.json")
                rows = [(r["record_id"], {k: v for k, v in r.items() if k != "row_sha256"}, None) for r in reads]
            else:
                with (SEED / "records" / f"{source}.csv").open(encoding="utf-8", newline="") as fh:
                    rows = []
                    for raw in csv.DictReader(fh):
                        payload = {k: v for k, v in raw.items() if k not in {"row_sha256", "batch_id", "source_filename"}}
                        rows.append((raw["record_id"], payload, raw["row_sha256"]))
            insert_batch(conn, source_type=source, batch_id=batch["batch_id"], filename=batch["filename"],
                         ingested_at=batch["ingested_at"], ingested_by="system", rows=rows,
                         last_ingested_at=batch.get("last_ingested_at"), storage_order=batch.get("storage_order"))

        for c in _load("state/cases.json"):
            conn.execute(
                "INSERT INTO cases(id, case_code, title, status, created_by, created_at) VALUES (?,?,?,?,?,?)",
                (c["id"], c["case_code"], c["title"], c["status"], c["created_by"], c["created_at"]),
            )
            for e in c["entities"]:
                conn.execute(
                    "INSERT INTO case_entities(case_id, entity_id, entity_kind, label, added_by, added_at) VALUES (?,?,?,?,?,?)",
                    (c["id"], e["entity_id"], e["entity_kind"], e["label"], e["added_by"], e["added_at"]),
                )
            for n in c["notes"]:
                conn.execute(
                    "INSERT INTO case_notes(id, case_id, body, author, created_at) VALUES (?,?,?,?,?)",
                    (n["id"], c["id"], n["body"], n["author"], n["created_at"]),
                )

        for a in sorted(_load("state/audit.json"), key=lambda a: a["id"]):
            conn.execute(
                "INSERT INTO audit(id, ts, actor, action, target_type, target_id, detail) VALUES (?,?,?,?,?,?,?)",
                (a["id"], a["ts"], a["actor"], a["action"], a["target_type"], a["target_id"], a["detail"]),
            )

        for d in _load("state/documents.json"):
            conn.execute("INSERT INTO docs(collection, id, data, updated_at) VALUES ('documents', ?, ?, ?)",
                         (str(d["id"]), json.dumps(d, ensure_ascii=False), d["uploaded_at"]))
            set_counter(conn, "documents", d["id"])

        history = _load("state/ask_history.json")
        for turn in history["turns"]:
            data = {**turn, "session_key": history["session_key"], "user": "investigator"}
            conn.execute("INSERT INTO docs(collection, id, data, updated_at) VALUES ('ask_turns', ?, ?, ?)",
                         (str(turn["id"]), json.dumps(data, ensure_ascii=False), turn["at"]))
            set_counter(conn, "ask_turns", turn["id"])

        for s in _load("state/reasoning_sessions.json"):
            key = s["summary"]["session_key"]
            conn.execute("INSERT INTO docs(collection, id, data, updated_at) VALUES ('reasoning', ?, ?, ?)",
                         (key, json.dumps(s, ensure_ascii=False), s["summary"]["updated_at"]))

        for inv in _load("state/response_investigations.json"):
            conn.execute("INSERT INTO docs(collection, id, data, updated_at) VALUES ('investigations', ?, ?, ?)",
                         (str(inv["id"]), json.dumps(inv, ensure_ascii=False), inv["created_at"]))
            set_counter(conn, "investigations", inv["id"])
        for camp in _load("catalog/response_campaigns.json")["items"]:
            conn.execute("INSERT INTO docs(collection, id, data, updated_at) VALUES ('campaigns', ?, ?, ?)",
                         (camp["campaign_id"], json.dumps(camp, ensure_ascii=False), camp["last_seen"]))
        conn.execute("COMMIT")
    except BaseException:
        conn.execute("ROLLBACK")
        raise
