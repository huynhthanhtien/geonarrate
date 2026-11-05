from collections.abc import Iterator
from datetime import UTC, datetime
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from redis import Redis
from sqlalchemy import delete, insert
from sqlalchemy.ext.asyncio import AsyncConnection

from app.core.config import get_settings
from app.core.deps import get_audit_service
from app.core.schema import audit_logs, refresh_tokens, users
from app.core.security import hash_password
from app.main import app
from app.models.audit import AuditResource
from tests.integration.conftest import run_sql

pytestmark = pytest.mark.integration


def get_utc_now() -> datetime:
    return datetime.now(UTC)


ADMIN = {"email": "admin@geonarrate.test", "password": "admin-test-password"}
EDITOR = {"email": "editor@geonarrate.test", "password": "editor-test-password"}


@pytest.fixture
def client() -> Iterator[TestClient]:
    s = get_settings()
    editor_hash = hash_password(EDITOR["password"])

    async def reset(conn: AsyncConnection) -> None:
        await conn.execute(delete(refresh_tokens))
        await conn.execute(delete(audit_logs))
        await conn.execute(delete(users).where(users.c.email == EDITOR["email"]))
        await conn.execute(
            insert(users).values(
                email=EDITOR["email"],
                password_hash=editor_hash,
                full_name="Editor",
                role="editor",
            )
        )

    run_sql(reset)
    with Redis.from_url(s.redis_url) as redis:
        for pattern in ("rl:login:*", "auth:access_cutoff:*"):
            for key in redis.scan_iter(pattern):
                redis.delete(key)
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
    # access token đang lưu hành cũng bị thu hồi ngay, không chờ hết hạn
    revoked = client.get("/api/v1/audit", headers=headers)
    assert revoked.status_code == 401
    assert revoked.json()["title"] == "token_revoked"
    fresh = client.post("/api/v1/auth/login", json=ADMIN).json()["access_token"]
    assert (
        client.get("/api/v1/audit", headers={"Authorization": f"Bearer {fresh}"}).status_code == 200
    )
    assert (
        client.post("/api/v1/auth/refresh", json={"refresh_token": b["refresh_token"]}).status_code
        == 401
    )


def test_login_rate_limit_counts_only_failures(client: TestClient) -> None:
    wrong = {**ADMIN, "password": "nope"}
    for _ in range(4):
        assert client.post("/api/v1/auth/login", json=wrong).status_code == 401
    # đăng nhập đúng không bị tính vào hạn mức
    for _ in range(3):
        assert client.post("/api/v1/auth/login", json=ADMIN).status_code == 200
    assert client.post("/api/v1/auth/login", json=wrong).status_code == 401

    blocked = client.post(
        "/api/v1/auth/login", json=ADMIN, headers={"Origin": "http://localhost:5173"}
    )
    assert blocked.status_code == 429
    # web khác origin vẫn đọc được lỗi 429
    assert blocked.headers["access-control-allow-origin"] == "http://localhost:5173"
    assert blocked.headers["content-type"] == "application/problem+json"
    assert blocked.json()["title"] == "rate_limited"
    assert 1 <= int(blocked.headers["retry-after"]) <= get_settings().login_rate_window_s


def test_permissions_in_token_response(client: TestClient) -> None:
    admin = client.post("/api/v1/auth/login", json=ADMIN).json()["user"]
    editor = client.post("/api/v1/auth/login", json=EDITOR).json()["user"]
    assert "admin:manage" in admin["permissions"]
    assert editor["role"] == "editor"
    assert editor["permissions"] == ["attraction:read", "script:write"]


def test_audit_requires_admin_manage(client: TestClient) -> None:
    admin = client.post("/api/v1/auth/login", json=ADMIN).json()
    editor = client.post("/api/v1/auth/login", json=EDITOR).json()
    # ghi qua service thật, trên event loop của app (nơi connection pool đang sống)
    portal, record = client.portal, get_audit_service().record
    assert portal is not None
    portal.call(record, admin["user"]["id"], "user.lock", AuditResource("user", "u1"))
    portal.call(record, editor["user"]["id"], "script.submit", AuditResource("script", "s1"))

    assert client.get("/api/v1/audit").status_code == 401
    r = client.get("/api/v1/audit", headers={"Authorization": f"Bearer {editor['access_token']}"})
    assert r.status_code == 403
    assert r.json()["title"] == "forbidden"

    headers = {"Authorization": f"Bearer {admin['access_token']}"}
    logs = client.get("/api/v1/audit", headers=headers).json()
    assert [x["action"] for x in logs] == ["script.submit", "user.lock"]
    assert logs[1]["resource"] == {"type": "user", "id": "u1"}

    params = {"actor_id": admin["user"]["id"], "resource_type": "user", "resource_id": "u1"}
    assert len(client.get("/api/v1/audit", headers=headers, params=params).json()) == 1
    before = {"before": logs[0]["ts"]}
    assert [
        x["action"] for x in client.get("/api/v1/audit", headers=headers, params=before).json()
    ] == ["user.lock"]
    assert client.get("/api/v1/audit", headers=headers, params={"actor_id": "x"}).json() == []


def test_foreign_id_formats_do_not_crash(client: TestClient) -> None:
    """JWT phát trước khi đổi CSDL mang ObjectId; id lạ phải được coi là không tồn tại."""
    from app.core.deps import get_auth_service
    from app.core.security import create_access_token

    portal = client.portal
    assert portal is not None
    svc = get_auth_service()
    legacy_id = "66f1c0a2b3c4d5e6f7a8b9c0"
    assert portal.call(svc._users.get_by_id, legacy_id) is None
    portal.call(svc._users.mark_login, legacy_id, get_utc_now(), None)
    portal.call(svc._tokens.revoke_all_for_user, legacy_id, get_utc_now())

    token = create_access_token(legacy_id, "admin", get_utc_now())
    r = client.post("/api/v1/auth/logout-all", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 204
    # không có user nào mang id ngẫu nhiên này
    assert portal.call(svc._users.get_by_id, str(uuid4())) is None
