"""Compare local API responses with responses captured from the original deployment.

    python tests/parity.py "/graph/network" "/intel/entity/P0006"      # specific URLs
    python tests/parity.py --all                                        # every captured GET
    python tests/parity.py --all --summary                              # one line per URL

Volatile fields (wall-clock timestamps, run ids, elapsed times) are ignored.
"""
from __future__ import annotations

import json
import os
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SNAP = ROOT / "recovery" / "api-snapshot"
sys.path.insert(0, str(ROOT / "api"))

# Always run against a fresh database seeded from seed_data/.
os.environ.setdefault("TRACEX_DB", str(Path(tempfile.mkdtemp()) / "parity.db"))

from fastapi.testclient import TestClient  # noqa: E402

from tracex_api.main import app  # noqa: E402

VOLATILE = {"_ingested_at", "hours_elapsed", "generated_at", "computed_at", "started_at", "elapsed_ms", "run_id", "read_at", "at", "ts_generated", "updated_at"}
FLOAT_TOL = 1e-4


def diff(expected, actual, path="$", out=None, limit=25):
    out = [] if out is None else out
    if len(out) >= limit:
        return out
    if isinstance(expected, dict) and isinstance(actual, dict):
        for k in expected:
            if k in VOLATILE:
                continue
            if k not in actual:
                out.append(f"{path}.{k}: missing (expected {json.dumps(expected[k])[:120]})")
            else:
                diff(expected[k], actual[k], f"{path}.{k}", out, limit)
        for k in actual:
            if k not in expected and k not in VOLATILE:
                out.append(f"{path}.{k}: unexpected {json.dumps(actual[k])[:120]}")
    elif isinstance(expected, list) and isinstance(actual, list):
        if len(expected) != len(actual):
            out.append(f"{path}: length {len(actual)} != expected {len(expected)}")
        for i, (e, a) in enumerate(zip(expected, actual)):
            diff(e, a, f"{path}[{i}]", out, limit)
            if len(out) >= limit:
                break
    elif isinstance(expected, (int, float)) and isinstance(actual, (int, float)) and not isinstance(expected, bool) and not isinstance(actual, bool):
        if abs(expected - actual) > FLOAT_TOL * max(1, abs(expected)):
            out.append(f"{path}: {actual} != expected {expected}")
    elif expected != actual:
        out.append(f"{path}: {json.dumps(actual)[:160]} != expected {json.dumps(expected)[:160]}")
    return out


def captured() -> dict[str, dict]:
    result = {}
    for f in SNAP.glob("*.json"):
        data = json.loads(f.read_text(encoding="utf-8"))
        result[data["url"]] = data
    return result


def check(client: TestClient, snap: dict, show: int = 25) -> list[str]:
    user = "supervisor" if "as_user=supervisor" in snap["url"] else "investigator"
    res = client.get(snap["url"], headers={"Authorization": f"Bearer {user}"})
    problems = []
    if res.status_code != snap["status"]:
        problems.append(f"status {res.status_code} != expected {snap['status']}: {res.text[:200]}")
        return problems
    if "json" in snap["contentType"]:
        try:
            body = res.json()
        except ValueError:
            return [f"non-JSON response: {res.text[:200]}"]
        problems += diff(snap["body"], body, limit=show)
    else:
        if res.text != snap["body"]:
            exp, act = snap["body"].splitlines(), res.text.splitlines()
            first = next((i for i, (a, b) in enumerate(zip(exp, act)) if a != b), min(len(exp), len(act)))
            problems.append(f"text differs at line {first}: {act[first] if first < len(act) else '<eof>'!r} != expected {exp[first] if first < len(exp) else '<eof>'!r} ({len(act)} vs {len(exp)} lines)")
    return problems


def main(argv: list[str]) -> int:
    snaps = captured()
    summary = "--summary" in argv
    urls = sorted(snaps) if "--all" in argv else [a for a in argv if not a.startswith("--")]
    client = TestClient(app)
    failures = 0
    for url in urls:
        snap = snaps.get(url)
        if snap is None:
            print(f"?? {url}: not captured")
            continue
        try:
            problems = check(client, snap, show=3 if summary else 25)
        except Exception as exc:  # noqa: BLE001
            problems = [f"EXCEPTION {type(exc).__name__}: {exc}"]
        if problems:
            failures += 1
            print(f"FAIL {url}")
            for p in problems[: 3 if summary else 25]:
                print(f"     {p}")
        else:
            print(f"ok   {url}")
    print(f"\n{len(urls) - failures}/{len(urls)} match")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
