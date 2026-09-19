"""Typed, cached view of all stored evidence plus the resolved-entity layer.

Everything analytic in the service reads from `current()`. The snapshot is rebuilt whenever the
evidence version changes (ingest, drill, restore), so derived views never lag the records.
"""
from __future__ import annotations

import json
import threading
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from functools import cached_property
from pathlib import Path

from tracex_api import evidence

SEED = Path(__file__).resolve().parents[1] / "seed_data"


def ts(value: str) -> datetime:
    """Parse the naive ISO timestamps used throughout the records (tolerates a trailing offset)."""
    value = value.strip()
    if value.endswith("+00:00"):
        value = value[:-6]
    if value.endswith("Z"):
        value = value[:-1]
    return datetime.fromisoformat(value)


def iso(dt: datetime) -> str:
    return dt.isoformat()


def num(value) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def clean_num(value: float):
    """Render whole numbers as ints the way the original JSON did."""
    return int(value) if float(value).is_integer() else value


@dataclass
class Call:
    rec_id: str
    a_party: str
    b_party: str
    start: datetime
    duration: int
    direction: str
    call_type: str
    imei: str
    imsi: str
    lac: str
    cell_id: str
    lat: float | None
    lon: float | None
    sha: str

    @property
    def end(self) -> datetime:
        return self.start + timedelta(seconds=self.duration)

    @property
    def cell_key(self) -> str:
        return f"{self.lac}-{self.cell_id}"


@dataclass
class Session:
    rec_id: str
    msisdn: str
    imei: str
    imsi: str
    start: datetime
    end: datetime
    private_ip: str
    public_ip: str
    nat_port: str
    bytes_up: int
    bytes_down: int
    dest_ip: str
    dest_port: str
    protocol: str
    dest_domain: str
    app_hint: str
    sha: str


@dataclass
class Txn:
    rec_id: str
    time: datetime
    amount: float
    direction: str
    channel: str
    src_account: str
    src_ifsc: str
    src_name: str
    dst_account: str
    dst_ifsc: str
    dst_name: str
    narration: str
    balance_after: float
    sha: str


@dataclass
class Post:
    rec_id: str
    platform: str
    handle: str
    msisdn: str
    time: datetime
    post_type: str
    text: str
    mentions: str
    url: str
    sha: str


@dataclass
class Read:
    rec_id: str
    time: datetime
    plate: str
    camera_id: str
    confidence: float
    sha: str


@dataclass
class Person:
    entity_id: str
    name: str
    role: str
    phones: list[str] = field(default_factory=list)
    devices: list[str] = field(default_factory=list)
    accounts: list[str] = field(default_factory=list)
    handles: list[dict] = field(default_factory=list)
    plates: list[str] = field(default_factory=list)
    rules: dict[str, str] = field(default_factory=dict)  # identifier value -> rule
    member_count: int = 0


class Dataset:
    def __init__(self) -> None:
        self.calls = [self._call(r) for r in evidence.rows("cdr")]
        self.sessions = [self._session(r) for r in evidence.rows("ipdr")]
        self.txns = [self._txn(r) for r in evidence.rows("bank")]
        self.posts = [self._post(r) for r in evidence.rows("social")]
        self.reads = [self._read(r) for r in evidence.rows("alpr")]
        self.cameras = {c["camera_id"]: c for c in json.loads((SEED / "cameras.json").read_text(encoding="utf-8"))}
        self.registry = json.loads((SEED / "subjects.json").read_text(encoding="utf-8"))
        self.vehicle_registry = {v["plate"]: v["entity_id"] for v in json.loads((SEED / "vehicles.json").read_text(encoding="utf-8"))}
        from tracex_api.engine.resolution import resolve
        self.persons: dict[str, Person] = resolve(self)
        self.by_phone = {p: e.entity_id for e in self.persons.values() for p in e.phones}
        self.by_device = {d: e.entity_id for e in self.persons.values() for d in e.devices}
        self.by_account = {a: e.entity_id for e in self.persons.values() for a in e.accounts}
        self.by_handle = {h["handle"]: e.entity_id for e in self.persons.values() for h in e.handles}
        self.by_plate = {p: e.entity_id for e in self.persons.values() for p in e.plates}
        self.account_ifsc = {}
        for t in self.txns:
            if t.src_account:
                self.account_ifsc.setdefault(t.src_account, t.src_ifsc)
            if t.dst_account:
                self.account_ifsc.setdefault(t.dst_account, t.dst_ifsc)
        self._cache: dict = {}

    # ---- row parsing ----
    @staticmethod
    def _call(r: dict) -> Call:
        return Call(r["record_id"], r["a_party"], r["b_party"], ts(r["start_time"]), int(num(r["duration_sec"])), r["direction"],
                    r["call_type"], r["imei"], r["imsi"], r["lac"], r["cell_id"],
                    num(r["tower_lat"]) if r.get("tower_lat") else None, num(r["tower_lon"]) if r.get("tower_lon") else None, r["_row_sha256"])

    @staticmethod
    def _session(r: dict) -> Session:
        return Session(r["record_id"], r["msisdn"], r["imei"], r["imsi"], ts(r["session_start"]), ts(r["session_end"]), r["private_ip"],
                       r["public_ip"], r["nat_port_start"], int(num(r["bytes_up"])), int(num(r["bytes_down"])), r["dest_ip"], r["dest_port"],
                       r["protocol"], r["dest_domain"], r["app_hint"], r["_row_sha256"])

    @staticmethod
    def _txn(r: dict) -> Txn:
        return Txn(r["record_id"], ts(r["txn_time"]), num(r["amount"]), r["direction"], r["channel"], r["src_account"], r["src_ifsc"],
                   r["src_name"], r["dst_account"], r["dst_ifsc"], r["dst_name"], r["narration"], num(r["balance_after"]), r["_row_sha256"])

    @staticmethod
    def _post(r: dict) -> Post:
        return Post(r["record_id"], r["platform"], r["handle"], r["linked_msisdn"], ts(r["post_time"]), r["post_type"], r["text"],
                    r["mentions"], r["url"], r["_row_sha256"])

    @staticmethod
    def _read(r: dict) -> Read:
        return Read(r["record_id"], ts(str(r["read_time"])), r["plate"], r["camera_id"], num(r["confidence"]), r["_row_sha256"])

    # ---- memoised derived views ----
    def memo(self, key, fn):
        if key not in self._cache:
            self._cache[key] = fn()
        return self._cache[key]

    @cached_property
    def calls_by_id(self) -> dict[str, Call]:
        return {c.rec_id: c for c in self.calls}

    @cached_property
    def txns_by_id(self) -> dict[str, Txn]:
        return {t.rec_id: t for t in self.txns}

    @cached_property
    def sessions_by_id(self) -> dict[str, Session]:
        return {s.rec_id: s for s in self.sessions}

    @cached_property
    def reads_by_id(self) -> dict[str, Read]:
        return {r.rec_id: r for r in self.reads}

    @cached_property
    def posts_by_id(self) -> dict[str, Post]:
        return {p.rec_id: p for p in self.posts}

    def person_of_phone(self, msisdn: str) -> str | None:
        return self.by_phone.get(msisdn)

    def entity_ids(self) -> list[str]:
        return sorted(self.persons)


_lock = threading.Lock()
_current: tuple[int, Dataset] | None = None


def current() -> Dataset:
    global _current
    version = evidence.version()
    with _lock:
        if _current is None or _current[0] != version:
            _current = (version, Dataset())
        return _current[1]
