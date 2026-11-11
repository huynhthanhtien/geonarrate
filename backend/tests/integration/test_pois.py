import asyncio
from collections.abc import Iterator
from uuid import UUID

import httpx
import pytest
from fastapi.testclient import TestClient
from redis import Redis
from sqlalchemy import delete, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncConnection

from app.core.config import get_settings
from app.core.schema import audit_logs, pois, tour_pois, users
from app.core.security import hash_password
from app.main import app
from app.models.audit import AuditLog, AuditResource
from app.services.audit_service import AuditService
from tests.integration.conftest import clear_test_pois, run_sql

pytestmark = pytest.mark.integration

BASE = "/api/v1/pois"
ADMIN = {"email": "admin@geonarrate.test", "password": "admin-test-password"}
EDITOR = {"email": "editor@geonarrate.test", "password": "editor-test-password"}
TRANSLATOR = {"email": "translator@geonarrate.test", "password": "translator-test-password"}
REVIEWER = {"email": "reviewer@geonarrate.test", "password": "reviewer-test-password"}
OPERATOR = {"email": "operator@geonarrate.test", "password": "operator-test-password"}
NEW = {
    "name": "Chùa Ngọc Hoàng",
    "category": "temple",
    "lat": 10.7881,
    "lng": 106.6978,
    "radius": 40,
}


@pytest.fixture
def client() -> Iterator[TestClient]:
    hashes = {
        u["email"]: hash_password(u["password"]) for u in (EDITOR, TRANSLATOR, REVIEWER, OPERATOR)
    }
    roles = {
        EDITOR["email"]: "editor",
        TRANSLATOR["email"]: "translator",
        REVIEWER["email"]: "reviewer",
        OPERATOR["email"]: "operator",
    }

    async def reset(conn: AsyncConnection) -> None:
        await conn.execute(delete(audit_logs))
        await conn.execute(delete(tour_pois))
        await clear_test_pois(conn)
        for email, password_hash in hashes.items():
            await conn.execute(
                pg_insert(users)
                .values(email=email, password_hash=password_hash, roles=[roles[email]])
                .on_conflict_do_update(
                    index_elements=[users.c.email],
                    set_={
                        "password_hash": password_hash,
                        "roles": [roles[email]],
                        "is_active": True,
                    },
                )
            )

    run_sql(reset)
    with Redis.from_url(get_settings().redis_url) as redis:
        for key in redis.scan_iter("rl:login:*"):
            redis.delete(key)
    with TestClient(app) as c:
        yield c


def _headers(client: TestClient, creds: dict[str, str]) -> dict[str, str]:
    token = client.post("/api/v1/auth/login", json=creds).json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_audit_failure_rolls_back_business_change(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    headers = _headers(client, EDITOR)
    created = client.post(BASE, json=NEW, headers=headers).json()

    async def fail(
        self: AuditService,
        actor_id: str,
        action: str,
        resource: AuditResource,
        note: str | None = None,
    ) -> AuditLog:
        raise RuntimeError("audit unavailable")

    monkeypatch.setattr(AuditService, "record", fail)
    with pytest.raises(RuntimeError, match="audit unavailable"):
        client.patch(f"{BASE}/{created['id']}", json={"name": "Changed"}, headers=headers)
    current = client.get(f"{BASE}/{created['id']}", headers=headers).json()
    assert current["name"] == NEW["name"]


def test_requires_login_and_permissions(client: TestClient) -> None:
    assert client.get(BASE).status_code == 401
    translator = _headers(client, TRANSLATOR)
    editor = _headers(client, EDITOR)
    assert client.get(BASE, headers=translator).json() == []
    assert client.post(BASE, json=NEW, headers=translator).status_code == 403

    created = client.post(BASE, json={**NEW, "script": "Nội dung"}, headers=editor).json()
    assert client.post(f"{BASE}/{created['id']}/submit", headers=translator).status_code == 403
    client.post(f"{BASE}/{created['id']}/submit", headers=editor)
    assert client.post(f"{BASE}/{created['id']}/approve", headers=editor).status_code == 403
    reject = client.post(
        f"{BASE}/{created['id']}/reject", json={"review_note": "x"}, headers=editor
    )
    assert reject.status_code == 403


def test_create_read_and_filter(client: TestClient) -> None:
    h = _headers(client, EDITOR)
    r = client.post(BASE, json=NEW, headers=h)
    assert r.status_code == 201
    a = r.json()
    assert "slug" not in a
    assert (a["lat"], a["lng"], a["radius"]) == (10.7881, 106.6978, 40)
    assert (a["script"], a["script_status"], a["script_version"]) == ("", "draft", 1)
    assert a["review_note"] is None
    assert a["created_by"] == a["updated_by"]

    assert client.get(f"{BASE}/{a['id']}", headers=h).json() == a
    client.post(BASE, json={**NEW, "name": "Nhà thờ", "category": "church"}, headers=h)
    list_ = client.get(BASE, headers=h).json()
    assert [x["name"] for x in list_] == ["Nhà thờ", "Chùa Ngọc Hoàng"]  # mới sửa nhất trước
    assert [
        x["name"] for x in client.get(BASE, params={"category": "church"}, headers=h).json()
    ] == ["Nhà thờ"]
    assert client.get(BASE, params={"status": "in_review"}, headers=h).json() == []


def test_poi_with_null_script_can_be_listed_and_edited(client: TestClient) -> None:
    h = _headers(client, EDITOR)
    created = client.post(BASE, json=NEW, headers=h).json()

    async def clear_script(conn: AsyncConnection) -> None:
        await conn.execute(update(pois).where(pois.c.id == UUID(created["id"])).values(script=None))

    run_sql(clear_script)
    item = client.get(BASE, params={"status": "draft"}, headers=h).json()[0]
    assert (item["script"], item["script_status"], item["script_version"]) == ("", "draft", 1)
    saved = client.put(f"{BASE}/{item['id']}/script", json={"script": "Kịch bản mới"}, headers=h)
    assert saved.status_code == 200
    assert saved.json()["script"] == "Kịch bản mới"


def test_create_validation_and_same_name_at_another_location(client: TestClient) -> None:
    h = _headers(client, EDITOR)
    assert client.post(BASE, json=NEW, headers=h).status_code == 201
    same_name = client.post(BASE, json={**NEW, "lat": 10.75}, headers=h)
    assert same_name.status_code == 201
    assert same_name.json()["name"] == NEW["name"]
    for bad in (
        {"name": "   "},
        {"radius": 5},
        {"radius": 201},
        {"lat": 91},
        {"lng": -181},
        {"category": "bar"},
        {"script": "x" * 1001},
    ):
        assert client.post(BASE, json={**NEW, **bad}, headers=h).status_code == 422, bad


def test_full_review_flow_with_audit(client: TestClient) -> None:
    editor = _headers(client, EDITOR)
    admin = _headers(client, ADMIN)
    a = client.post(BASE, json=NEW, headers=editor).json()
    url = f"{BASE}/{a['id']}"

    saved = client.put(f"{url}/script", json={"script": "Đoạn một.\nĐoạn hai."}, headers=editor)
    assert saved.json()["script"] == "Đoạn một.\nĐoạn hai."
    assert (
        client.put(f"{url}/script", json={"script": "x" * 1001}, headers=editor).status_code == 422
    )
    assert client.post(f"{url}/approve", headers=admin).status_code == 409

    assert client.post(f"{url}/submit", headers=editor).json()["script_status"] == "in_review"
    assert client.put(f"{url}/script", json={"script": "y"}, headers=editor).status_code == 409
    assert client.post(f"{url}/submit", headers=editor).status_code == 409
    in_review = client.get(BASE, params={"status": "in_review"}, headers=admin).json()
    assert [x["id"] for x in in_review] == [a["id"]]

    assert client.post(f"{url}/reject", json={"review_note": " "}, headers=admin).status_code == 422
    rejected = client.post(f"{url}/reject", json={"review_note": "Thiếu năm"}, headers=admin).json()
    assert (rejected["script_status"], rejected["review_note"]) == ("draft", "Thiếu năm")

    assert client.post(f"{url}/submit", headers=editor).json()["review_note"] is None
    approved = client.post(f"{url}/approve", headers=admin).json()
    assert (approved["script_status"], approved["script_version"]) == ("approved", 1)
    assert approved["script"] == "Đoạn một.\nĐoạn hai."

    edited = client.put(f"{url}/script", json={"script": "Bản mới"}, headers=editor).json()
    assert (edited["script_status"], edited["script_version"]) == ("draft", 2)

    logs = client.get("/api/v1/audit", headers=admin).json()
    assert [x["action"] for x in logs] == [
        "script.approve",
        "script.submit",
        "script.reject",
        "script.submit",
        "poi.create",
    ]
    assert logs[0]["resource"] == {"type": "poi", "id": a["id"]}
    assert logs[2]["note"] == "Thiếu năm"


def test_unknown_ids_return_404(client: TestClient) -> None:
    h = _headers(client, ADMIN)
    for bad in ("khong-phai-uuid", "00000000-0000-0000-0000-000000000000"):
        assert client.get(f"{BASE}/{bad}", headers=h).status_code == 404
        assert client.post(f"{BASE}/{bad}/approve", headers=h).status_code == 404
        r = client.put(f"{BASE}/{bad}/script", json={"script": "x"}, headers=h)
        assert r.status_code == 404
        assert r.json()["title"] == "poi_not_found"


def test_concurrent_approve_has_one_winner(client: TestClient) -> None:
    editor = _headers(client, EDITOR)
    admin = _headers(client, ADMIN)
    a = client.post(BASE, json={**NEW, "script": "Nội dung"}, headers=editor).json()
    client.post(f"{BASE}/{a['id']}/submit", headers=editor)

    async def approve_many() -> list[int]:
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://t") as c:
            responses = await asyncio.gather(
                *[c.post(f"{BASE}/{a['id']}/approve", headers=admin) for _ in range(8)]
            )
        return sorted(r.status_code for r in responses)

    portal = client.portal
    assert portal is not None
    codes = portal.call(approve_many)
    assert codes == [200] + [409] * 7
    assert client.get(f"{BASE}/{a['id']}", headers=admin).json()["script_status"] == "approved"


def test_empty_script_cannot_be_submitted(client: TestClient) -> None:
    h = _headers(client, EDITOR)
    a = client.post(BASE, json=NEW, headers=h).json()
    r = client.post(f"{BASE}/{a['id']}/submit", headers=h)
    assert r.status_code == 422
    assert r.json()["title"] == "script_empty"


def test_update_poi_keeps_id_and_moves_point(client: TestClient) -> None:
    editor = _headers(client, EDITOR)
    a = client.post(BASE, json={**NEW, "summary": "Cũ"}, headers=editor).json()
    assert a["summary"] == "Cũ"
    assert a["images"] == []
    url = f"{BASE}/{a['id']}"
    body = {
        "name": "Tên mới",
        "lat": 10.5,
        "lng": 106.5,
        "radius": 60,
        "summary": "Mới",
        "images": ["https://example.com/a.jpg"],
    }
    updated = client.patch(url, json=body, headers=editor).json()
    assert updated["id"] == a["id"]
    assert (updated["name"], updated["lat"], updated["lng"], updated["radius"]) == (
        "Tên mới",
        10.5,
        106.5,
        60,
    )
    assert (updated["summary"], updated["images"]) == ("Mới", ["https://example.com/a.jpg"])
    assert updated["category"] == "temple"  # trường không gửi giữ nguyên

    cleared = client.patch(url, json={"summary": None}, headers=editor).json()
    assert cleared["summary"] is None
    for bad in (
        {"lat": 1},
        {"lng": 1},
        {"name": None},
        {"radius": 5},
        {"images": ["ftp://x/y"]},
    ):
        assert client.patch(url, json=bad, headers=editor).status_code == 422, bad
    assert client.patch(url, json={"summary": "x"}).status_code == 401
    translator = _headers(client, TRANSLATOR)
    assert client.patch(url, json={"summary": "x"}, headers=translator).status_code == 403
    missing = f"{BASE}/00000000-0000-0000-0000-000000000000"
    assert client.patch(missing, json={"summary": "x"}, headers=editor).status_code == 404


# (method, path, quyền cần) — mọi API của CMS. Thêm API mới thì thêm vào đây.
GHOST = "00000000-0000-0000-0000-000000000000"
CMS_ENDPOINTS: list[tuple[str, str, set[str]]] = [
    ("GET", "/api/v1/pois", {"poi:read"}),
    ("POST", "/api/v1/pois", {"poi:write"}),
    ("PATCH", f"/api/v1/pois/{GHOST}", {"poi:write"}),
    ("PUT", f"/api/v1/pois/{GHOST}/script", {"script:write"}),
    ("POST", f"/api/v1/pois/{GHOST}/submit", {"script:write"}),
    ("POST", f"/api/v1/pois/{GHOST}/approve", {"script:approve"}),
    ("POST", f"/api/v1/pois/{GHOST}/reject", {"script:approve"}),
    ("GET", "/api/v1/translations", {"translation:read"}),
    ("PUT", f"/api/v1/translations/{GHOST}", {"translation:write"}),
    ("POST", f"/api/v1/translations/{GHOST}/approve", {"translation:approve"}),
    ("GET", "/api/v1/translation-jobs", {"translation:read"}),
    ("POST", "/api/v1/translation-jobs/retry", {"translation:write"}),
    ("GET", "/api/v1/glossaries", {"glossary:read"}),
    ("POST", "/api/v1/glossaries", {"glossary:write"}),
    ("GET", "/api/v1/audio/status", {"audio:read"}),
    ("POST", "/api/v1/audio/retry", {"audio:build"}),
    ("GET", f"/api/v1/audio/{GHOST}/vi/preview", {"audio:read"}),
    ("GET", "/api/v1/tours", {"tour:read"}),
    ("POST", "/api/v1/tours", {"tour:write"}),
    ("GET", "/api/v1/packs", {"pack:read"}),
    ("GET", f"/api/v1/packs/status?tour_id={GHOST}", {"pack:read"}),
    ("POST", "/api/v1/packs/build", {"pack:build"}),
    ("POST", f"/api/v1/packs/{GHOST}/publish", {"pack:publish"}),
    ("POST", f"/api/v1/packs/{GHOST}/rollback", {"pack:publish"}),
    ("GET", "/api/v1/tickets", {"ticket:read"}),
    ("POST", "/api/v1/tickets/revoke", {"ticket:manage"}),
    ("GET", "/api/v1/admin/users", {"user:manage"}),
    ("POST", f"/api/v1/admin/users/{GHOST}/password", {"user:manage"}),
    ("GET", "/api/v1/audit", {"audit:read"}),
    ("GET", "/api/v1/analytics/summary", {"analytics:read"}),
]


@pytest.mark.parametrize(
    "creds",
    [EDITOR, TRANSLATOR, REVIEWER, OPERATOR],
    ids=["editor", "translator", "reviewer", "operator"],
)
def test_every_cms_endpoint_enforces_its_permission(
    client: TestClient, creds: dict[str, str]
) -> None:
    login = client.post("/api/v1/auth/login", json=creds).json()
    held = set(login["user"]["permissions"])
    h = {"Authorization": f"Bearer {login['access_token']}"}
    wrong = []
    for method, path, needs in CMS_ENDPOINTS:
        code = client.request(method, path, headers=h, json={}).status_code
        allowed = bool(needs & held)
        if (code == 403) == allowed or code == 401:
            wrong.append(f"{method} {path}: {code} (được phép={allowed})")
    assert wrong == []
