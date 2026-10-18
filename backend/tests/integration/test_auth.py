from collections.abc import Iterator
from typing import Any

import pytest
from fastapi.testclient import TestClient
from pymongo import MongoClient

from app.core.config import get_settings
from app.main import app

pytestmark = pytest.mark.integration

ADMIN = {"email": "admin@geonarrate.test", "password": "admin-test-password"}


@pytest.fixture
def client() -> Iterator[TestClient]:
    s = get_settings()
    mongo: MongoClient[dict[str, Any]]
    with MongoClient(s.mongo_uri) as mongo:
        mongo[s.mongo_db].refresh_tokens.delete_many({})
    with TestClient(app) as c:  # lifespan seed admin dev
        yield c


def test_login_rejects_wrong_password(client: TestClient) -> None:
    r = client.post("/api/v1/auth/login", json={**ADMIN, "password": "nope"})
    assert r.status_code == 401
    assert r.headers["content-type"] == "application/problem+json"
    assert r.json()["title"] == "invalid_credentials"


def test_refresh_rotation_and_reuse_detection(client: TestClient) -> None:
    first = client.post("/api/v1/auth/login", json=ADMIN).json()
    assert first["user"]["role"] == "admin"

    second = client.post("/api/v1/auth/refresh", json={"refresh_token": first["refresh_token"]})
    assert second.status_code == 200
    new_token = second.json()["refresh_token"]

    reused = client.post("/api/v1/auth/refresh", json={"refresh_token": first["refresh_token"]})
    assert reused.json()["title"] == "refresh_token_reused"
    # cả chuỗi bị thu hồi, kể cả token mới nhất
    assert client.post("/api/v1/auth/refresh", json={"refresh_token": new_token}).status_code == 401


def test_logout_and_logout_all(client: TestClient) -> None:
    a = client.post("/api/v1/auth/login", json=ADMIN).json()
    b = client.post("/api/v1/auth/login", json=ADMIN).json()

    assert (
        client.post("/api/v1/auth/logout", json={"refresh_token": a["refresh_token"]}).status_code
        == 204
    )
    assert (
        client.post("/api/v1/auth/refresh", json={"refresh_token": a["refresh_token"]}).status_code
        == 401
    )

    assert client.post("/api/v1/auth/logout-all").status_code == 401
    headers = {"Authorization": f"Bearer {b['access_token']}"}
    assert client.post("/api/v1/auth/logout-all", headers=headers).status_code == 204
    assert (
        client.post("/api/v1/auth/refresh", json={"refresh_token": b["refresh_token"]}).status_code
        == 401
    )
