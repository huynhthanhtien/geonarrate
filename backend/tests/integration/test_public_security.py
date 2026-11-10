from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from redis import Redis

from app.core.config import get_settings
from app.core.device import verify_device_id
from app.main import app

pytestmark = pytest.mark.integration


@pytest.fixture
def client(monkeypatch: pytest.MonkeyPatch) -> Iterator[TestClient]:
    settings = get_settings()
    monkeypatch.setattr(settings, "public_rate_limit", 3)
    monkeypatch.setattr(settings, "public_activate_rate_limit", 2)
    with Redis.from_url(settings.redis_url) as redis:
        for key in redis.scan_iter("rl:public:*"):
            redis.delete(key)
    with TestClient(app) as c:
        yield c
    with Redis.from_url(settings.redis_url) as redis:
        for key in redis.scan_iter("rl:public:*"):
            redis.delete(key)


def test_registration_and_device_validation(client: TestClient) -> None:
    response = client.post("/api/v1/public/devices")
    assert response.status_code == 201
    verify_device_id(response.json()["device_id"])
    response = client.post(
        "/api/v1/public/playback-events", json={"device_id": "forged-device", "events": []}
    )
    assert response.status_code == 401
    assert response.json()["title"] == "invalid_device"


def test_public_limit_and_cors(client: TestClient) -> None:
    for _ in range(3):
        assert client.get("/api/v1/public/tours").status_code == 200
    response = client.get("/api/v1/public/tours", headers={"Origin": "http://localhost:5173"})
    assert response.status_code == 429
    assert int(response.headers["retry-after"]) > 0
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"
    assert client.get("/api/v1/languages").status_code == 200
    assert (
        client.options(
            "/api/v1/public/tours",
            headers={"Origin": "http://localhost:5173", "Access-Control-Request-Method": "GET"},
        ).status_code
        == 200
    )


def test_activation_limit_has_separate_bucket(client: TestClient) -> None:
    for _ in range(2):
        assert client.post("/api/v1/public/tickets/activate", json={}).status_code == 422
    assert client.post("/api/v1/public/tickets/activate", json={}).status_code == 429
    assert client.get("/api/v1/public/tours").status_code == 200
