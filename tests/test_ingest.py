import io, json
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_ingest_csv():
    csv_content = (
        "id,name,type\n"
        "1,Alice,person\n"
        "2,Bob,person\n"
    )
    files = {"file": ("test.csv", csv_content, "text/csv")}
    response = client.post("/api/v1/ingest/batch", files=files)
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "completed"
    assert data["accepted_rows"] == 2

def test_ingest_json():
    json_content = json.dumps([{"id": 1, "name": "Alice"}, {"id": 2, "name": "Bob"}])
    files = {"file": ("test.json", json_content, "application/json")}
    response = client.post("/api/v1/ingest/batch", files=files)
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "completed"
    assert data["accepted_rows"] == 2
