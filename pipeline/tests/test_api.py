import pytest

fastapi = pytest.importorskip("fastapi")
from fastapi.testclient import TestClient  # noqa: E402

from tubescope import api  # noqa: E402


@pytest.fixture(scope="module")
def client():
    try:
        api._load()
    except RuntimeError:
        pytest.skip("no committed prepublish model")
    return TestClient(api.app)


def test_predict_returns_probability_and_curves(client):
    response = client.post(
        "/predict",
        json={"category_id": 10, "duration_minutes": 3.5, "channel_subscribers": 2_000_000},
    )
    assert response.status_code == 200
    body = response.json()
    assert 0 <= body["probability"] <= 1
    assert len(body["by_duration"]) == len(api.DURATION_GRID)
    assert [p["x"] for p in body["by_hour"]] == list(range(24))
    assert body["category_rate"] is not None


def test_predict_validates_input(client):
    assert (
        client.post("/predict", json={"category_id": 10, "duration_minutes": -1}).status_code == 422
    )


def test_health(client):
    assert client.get("/health").json()["status"] == "ok"
