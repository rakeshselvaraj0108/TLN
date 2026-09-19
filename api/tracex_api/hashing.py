"""Row hashes and per-batch hash chains — the original deployment's exact scheme.

row_sha256 = SHA-256 over the row's fields as compact, key-sorted JSON.
chain[0]   = SHA-256("")
chain[i]   = SHA-256(chain[i-1] || row_hash[i])   (hex strings concatenated)

Any insertion, deletion or alteration of a record changes the chain head.
"""
from __future__ import annotations

import hashlib
import json


def row_sha256(payload: dict) -> str:
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def genesis(batch_id: str) -> str:  # noqa: ARG001 - the chain seed is the same for every batch
    return hashlib.sha256(b"").hexdigest()


def link(prev: str, row_hash: str) -> str:
    return hashlib.sha256((prev + row_hash).encode("ascii")).hexdigest()
