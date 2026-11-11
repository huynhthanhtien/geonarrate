from collections.abc import Iterator
from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from redis import Redis
from sqlalchemy import delete
from sqlalchemy.dialects.postgresql import insert as pg_insert
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
        await conn.execute(
            pg_insert(users)
            .values(
                email=EDITOR["email"],
                password_hash=editor_hash,
                full_name="Editor",
                roles=["editor"],
            )
            .on_conflict_do_update(
                index_elements=[users.c.email],
                set_={
                    "password_hash": editor_hash,
                    "full_name": "Editor",
                    "roles": ["editor"],
                    "is_active": True,
                },
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
    assert first["user"]["roles"] == ["admin"]

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
    assert "user:manage" in admin["permissions"]
    assert editor["roles"] == ["editor"]
    assert {"poi:read", "poi:write", "script:write"} <= set(editor["permissions"])


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

    token = create_access_token(legacy_id, ("admin",), get_utc_now())
    r = client.post("/api/v1/auth/logout-all", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 204
    # không có user nào mang id ngẫu nhiên này
    assert portal.call(svc._users.get_by_id, str(uuid4())) is None


def test_audit_independent_filters_search_and_stable_pagination(client: TestClient) -> None:
    admin = client.post("/api/v1/auth/login", json=ADMIN).json()
    editor = client.post("/api/v1/auth/login", json=EDITOR).json()
    headers = {"Authorization": f"Bearer {admin['access_token']}"}
    svc = get_audit_service()
    stamp = datetime(2026, 10, 1, 12, tzinfo=UTC)
    svc._clock = lambda: stamp
    portal = client.portal
    assert portal is not None
    portal.call(svc.record, admin["user"]["id"], "tour.update", AuditResource("tour", "tour-1"))
    portal.call(svc.record, admin["user"]["id"], "tour.create", AuditResource("tour", "tour-2"))
    portal.call(svc.record, editor["user"]["id"], "script.submit", AuditResource("poi", "a-1"))
    portal.call(
        svc.record,
        editor["user"]["id"],
        "script.reject",
        AuditResource("poi", "a-2"),
        "Sai 10%",
    )

    def query(**params: str | int) -> list[dict[str, object]]:
        response = client.get("/api/v1/audit", headers=headers, params=params)
        assert response.status_code == 200, response.text
        result: list[dict[str, object]] = response.json()
        return result

    assert len(query(resource_type="tour")) == 2  # không cần mã đối tượng
    assert len(query(resource_id="a-1")) == 1
    assert len(query(action="tour.update")) == 1
    assert len(query(q="EDITOR@geonarrate.test")) == 2
    assert len(query(q="Editor")) == 2
    assert len(query(q="%")) == 1  # ký tự đặc biệt được tìm như văn bản, không phải wildcard
    assert len(query(q="tour-2", resource_type="tour")) == 1
    assert len(query(since=stamp.isoformat(), until=(stamp + timedelta(hours=1)).isoformat())) == 4
    assert query(until=stamp.isoformat()) == []
    seen: list[object] = []
    params: dict[str, str | int] = {"limit": 1}
    while page := query(**params):
        seen.append(page[0]["id"])
        params.update(before=str(page[0]["ts"]), before_id=str(page[0]["id"]))
    assert len(seen) == len(set(seen)) == 4  # cùng timestamp vẫn không bị mất bản ghi
    invalid = {"since": stamp.isoformat(), "until": (stamp - timedelta(days=1)).isoformat()}
    assert client.get("/api/v1/audit", headers=headers, params=invalid).status_code == 422
    assert (
        client.get(
            "/api/v1/audit", headers=headers, params={"since": "2026-10-01T00:00:00"}
        ).status_code
        == 422
    )
    assert (
        client.get("/api/v1/audit", headers=headers, params={"before_id": str(uuid4())}).status_code
        == 422
    )
