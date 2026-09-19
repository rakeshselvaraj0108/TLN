"""Role separation is enforced by the server, not just hidden in the UI."""

SUP = {"Authorization": "Bearer supervisor"}


def _new_case(client):
    r = client.post("/cases", json={"title": "authorization test case"})
    assert r.status_code == 201
    return r.json()["id"]


def test_an_investigator_cannot_close_a_case_but_can_move_it_along(client):
    case_id = _new_case(client)
    assert client.patch(f"/cases/{case_id}/status", json={"status": "under_review"}).status_code == 200
    denied = client.patch(f"/cases/{case_id}/status", json={"status": "closed"})
    assert denied.status_code == 403
    assert "supervisor" in denied.json()["detail"]
    assert client.get(f"/cases/{case_id}").json()["status"] == "under_review"


def test_a_supervisor_can_close_a_case(client):
    case_id = _new_case(client)
    r = client.patch(f"/cases/{case_id}/status", json={"status": "closed"}, headers=SUP)
    assert r.status_code == 200 and r.json()["status"] == "closed"


def test_supervisor_only_dispositions_are_refused_to_an_investigator(client, ds):
    entity = next(iter(ds.persons))
    body = {"action": "freeze_request", "rationale": "a rationale long enough to satisfy the minimum length"}
    assert client.post(f"/actions/{entity}", json=body).status_code == 403
    assert client.post(f"/actions/{entity}", json=body, headers=SUP).status_code in (200, 201)
