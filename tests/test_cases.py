"""
Integration tests against the real /api/v1 surface.

These exercise the FastAPI app's `lifespan`, which opens a Postgres engine and
a Neo4j driver on startup — they need the docker-compose stack (or equivalent
Postgres/Neo4j instances matching backend/.env) running. There is currently no
dependency-override / test-database fixture in this project, so these are
integration tests, not isolated unit tests.

The previous version of this file targeted /api/v1/cases as an unauthenticated,
schema-less endpoint. That endpoint never existed on the real API (routes.py) —
it belonged to a duplicate stub router (app/api/v1/cases_router.py) that also
imported app.db and app.schemas, neither of which exists in this tree. The stub
router has been removed; these tests now cover the real, authenticated router.
"""
import pytest
from fastapi.testclient import TestClient

from main import app

client = TestClient(app)

ADMIN_CREDENTIALS = {"username": "admin", "password": "admin123"}


@pytest.fixture(scope="module")
def auth_headers():
    response = client.post("/api/v1/auth/login", json=ADMIN_CREDENTIALS)
    assert response.status_code == 200, response.text
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_health_is_public():
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    assert response.json()["status"] == "healthy"


def test_cases_require_auth():
    response = client.get("/api/v1/cases")
    assert response.status_code == 401


def test_list_cases(auth_headers):
    response = client.get("/api/v1/cases", headers=auth_headers)
    assert response.status_code == 200
    assert isinstance(response.json(), list)


def test_create_and_fetch_case(auth_headers):
    payload = {"case_number": "TEST-001", "title": "Test case"}
    response = client.post("/api/v1/cases", json=payload, headers=auth_headers)
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["case_number"] == "TEST-001"
    assert data["title"] == "Test case"

    fetched = client.get(f"/api/v1/cases/{data['id']}", headers=auth_headers)
    assert fetched.status_code == 200
    assert fetched.json()["case_number"] == "TEST-001"


def test_create_case_rejects_duplicate_number(auth_headers):
    payload = {"case_number": "TEST-001", "title": "Duplicate"}
    response = client.post("/api/v1/cases", json=payload, headers=auth_headers)
    assert response.status_code == 409
