"""Test harness: an isolated throwaway database, set BEFORE the application modules are imported (db.DB_PATH is read
at import time), and the api/ directory on sys.path so `tracex_api` imports without installation."""
import os
import sys
import tempfile
from pathlib import Path

_TMP = tempfile.mkdtemp(prefix="tracex-tests-")
os.environ["TRACEX_DB"] = str(Path(_TMP) / "tests.db")
os.environ.setdefault("TRACEX_SECRET", "test-secret")
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest  # noqa: E402


@pytest.fixture(scope="session")
def client():
    from fastapi.testclient import TestClient

    from tracex_api.main import app

    with TestClient(app) as c:
        c.headers.update({"Authorization": "Bearer investigator"})
        yield c


@pytest.fixture(scope="session")
def ds(client):
    from tracex_api.engine.dataset import current

    return current()
