"""Chạy nguyên chuỗi UC-02 đến UC-18 qua HTTP, với worker thật và TTS giả."""

from collections.abc import Callable, Iterator
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient
from redis import Redis
from sqlalchemy import delete, insert
from sqlalchemy.ext.asyncio import AsyncConnection

from app.core import deps, schema
from app.core.config import get_settings
from app.core.device import issue_device_id
from app.core.security import hash_password
from app.integrations.quality import LocalQuality
from app.main import app
from app.repositories import job_repo
from tests.integration.conftest import run_sql

pytestmark = pytest.mark.integration

API = "/api/v1"
ADMIN = {"email": "admin@geonarrate.test", "password": "admin-test-password"}
TRANSLATOR = {"email": "translator@geonarrate.test", "password": "translator-test-password"}
DEVICE = issue_device_id()
OTHER = issue_device_id()


class FakeTTS:
    fail = False

    async def synthesize(
        self, text: str, voice_id: str, rate: str = "+0%", *, lang: str = "en"
    ) -> bytes:
        if FakeTTS.fail:
            raise RuntimeError("TTS sập")
        return f"{voice_id}:{text}".encode() * 100


Run = Callable[[], int]


@pytest.fixture
def client(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> Iterator[TestClient]:
    FakeTTS.fail = False
    monkeypatch.setattr(deps, "_tts", lambda: FakeTTS())
    monkeypatch.setattr(job_repo, "BACKOFF_S", (0, 0))
    monkeypatch.setattr(get_settings(), "storage_dir", str(tmp_path))
    pw = hash_password(TRANSLATOR["password"])

    async def reset(conn: AsyncConnection) -> None:
        for t in (
            schema.playback_events,
            schema.ticket_tours,
            schema.tickets,
            schema.jobs,
            schema.audio_packs,
            schema.audio_assets,
            schema.translations,
            schema.glossaries,
            schema.tour_attractions,
            schema.tours,
            schema.attractions,
            schema.refresh_tokens,
            schema.audit_logs,
        ):
            await conn.execute(delete(t))
        await conn.execute(delete(schema.users).where(schema.users.c.email != ADMIN["email"]))
        await conn.execute(
            insert(schema.users).values(
                email=TRANSLATOR["email"], password_hash=pw, role="translator"
            )
        )

    run_sql(reset)
    with Redis.from_url(get_settings().redis_url) as redis:
        for key in redis.scan_iter("rl:*"):
            redis.delete(key)
    with TestClient(app) as c:
        yield c


def _login(c: TestClient, creds: dict[str, str]) -> dict[str, str]:
    token = c.post(f"{API}/auth/login", json=creds).json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def _drain(c: TestClient) -> int:
    assert c.portal is not None
    svc = deps.get_pipeline_service()
    count = 0
    while c.portal.call(svc.run_once):
        count += 1
    return count


def _approved_point(c: TestClient, admin: dict[str, str], name: str, script: str) -> str:
    body = {"name": name, "category": "museum", "lat": 10.77, "lng": 106.69, "radius": 40}
    a = c.post(f"{API}/attractions", json={**body, "script": script}, headers=admin).json()
    assert c.post(f"{API}/attractions/{a['id']}/submit", headers=admin).status_code == 200
    assert c.post(f"{API}/attractions/{a['id']}/approve", headers=admin).status_code == 200
    return str(a["id"])


def _approve_all(c: TestClient, h: dict[str, str]) -> None:
    for t in c.get(f"{API}/translations", params={"status": "pending"}, headers=h).json():
        r = c.post(f"{API}/translations/{t['id']}/approve", headers=h)
        assert r.status_code == 200, r.text


def _published_tour(c: TestClient, admin: dict[str, str], access: str, points: list[str]) -> str:
    _drain(c)
    _approve_all(c, admin)
    _drain(c)
    body = {
        "slug": f"tour-{access}",
        "name": f"Tour {access}",
        "access": access,
        "status": "published",
        "attractions": [{"id": p, "is_preview": i == 0} for i, p in enumerate(points)],
    }
    r = c.post(f"{API}/tours", json=body, headers=admin)
    assert r.status_code == 201, r.text
    tour = r.json()
    pack = c.post(
        f"{API}/packs/build", json={"tour_id": tour["id"], "lang": "en"}, headers=admin
    ).json()
    _drain(c)
    assert c.post(f"{API}/packs/{pack['id']}/publish", headers=admin).status_code == 200
    return str(tour["id"])


def test_translation_glossary_and_required_terms(client: TestClient) -> None:
    admin = _login(client, ADMIN)
    tr = _login(client, TRANSLATOR)
    r = client.post(
        f"{API}/glossaries",
        json={"term": "Ngọ Môn", "target_lang": "ja", "translation": "午門", "is_required": True},
        headers=tr,
    )
    assert r.status_code == 201
    dup = {"term": "Ngọ Môn", "target_lang": "ja", "translation": "X"}
    assert client.post(f"{API}/glossaries", json=dup, headers=tr).status_code == 409

    point = _approved_point(client, admin, "Điểm một", "Ngọ Môn rất đẹp.")
    # job vi + 4 job dịch
    assert _drain(client) == 5
    rows = client.get(f"{API}/translations", headers=tr).json()
    assert sorted(x["target_lang"] for x in rows) == ["en", "ja", "ko", "zh"]
    assert all("mock_translation" in x["qa_flags"] for x in rows)
    ja = next(x for x in rows if x["target_lang"] == "ja")
    assert "午門" in ja["text"]

    edited = client.put(
        f"{API}/translations/{ja['id']}", json={"text": "thiếu thuật ngữ"}, headers=tr
    ).json()
    assert edited["qa_flags"] == ["missing_term:Ngọ Môn"]
    blocked = client.post(f"{API}/translations/{ja['id']}/approve", headers=tr)
    assert blocked.status_code == 422
    assert blocked.json()["title"] == "missing_required_terms"

    rejected = client.post(
        f"{API}/translations/{ja['id']}/reject", json={"review_note": "Sai"}, headers=tr
    ).json()
    assert rejected["review_status"] == "rejected"
    client.put(f"{API}/translations/{ja['id']}", json={"text": "午門 đẹp"}, headers=tr)
    ok = client.post(f"{API}/translations/{ja['id']}/approve", headers=tr)
    assert ok.status_code == 200
    again = client.post(f"{API}/translations/{ja['id']}/approve", headers=tr)
    assert again.status_code == 409

    cells = {x["id"]: x for x in client.get(f"{API}/audio/status", headers=admin).json()}[point]
    assert cells["langs"]["ja"]["state"] == "queued"  # tự tạo job khi duyệt
    assert cells["langs"]["vi"]["state"] == "ready"
    assert cells["langs"]["en"]["state"] == "none"
    _drain(client)
    cells = {x["id"]: x for x in client.get(f"{API}/audio/status", headers=admin).json()}[point]
    assert cells["langs"]["ja"]["state"] == "ready"

    assert client.get(f"{API}/translations", headers=admin).status_code == 200
    term = client.get(f"{API}/glossaries", params={"lang": "ja"}, headers=tr).json()[0]
    assert client.delete(f"{API}/glossaries/{term['id']}", headers=tr).status_code == 204
    assert client.delete(f"{API}/glossaries/{term['id']}", headers=tr).status_code == 404


def test_audio_failure_retries_then_can_be_retried_by_admin(client: TestClient) -> None:
    admin = _login(client, ADMIN)
    FakeTTS.fail = True
    point = _approved_point(client, admin, "Điểm lỗi", "Nội dung.")
    preview = f"{API}/audio/{point}/vi/preview"
    assert client.get(preview, headers=admin).status_code == 404
    _drain(client)
    cell = {x["id"]: x for x in client.get(f"{API}/audio/status", headers=admin).json()}[point]
    assert cell["langs"]["vi"]["state"] == "failed"
    assert "TTS sập" in cell["langs"]["vi"]["error"]

    FakeTTS.fail = False
    body = {"attraction_id": point, "lang": "vi"}
    assert client.post(f"{API}/audio/retry", json=body, headers=admin).status_code == 204
    _drain(client)
    cell = {x["id"]: x for x in client.get(f"{API}/audio/status", headers=admin).json()}[point]
    assert cell["langs"]["vi"]["state"] == "ready"
    assert client.get(preview).status_code == 401
    translator = _login(client, TRANSLATOR)
    assert client.get(preview, headers=translator).status_code == 403
    audio = client.get(preview, headers=admin)
    assert audio.status_code == 200
    assert audio.headers["content-type"] == "audio/mpeg"
    assert audio.headers["cache-control"] == "no-store"
    assert "Nội dung".encode() in audio.content
    bad = {"attraction_id": point, "lang": "en"}
    assert client.post(f"{API}/audio/retry", json=bad, headers=admin).status_code == 422


def test_quality_scores_flag_translation_and_block_bad_audio(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    async def score(self: LocalQuality, source: str, text: str) -> float:
        return 0.4

    async def wer(self: LocalQuality, text: str, audio: bytes, lang: str) -> float:
        return 0.5

    monkeypatch.setattr(LocalQuality, "translation_score", score)
    monkeypatch.setattr(LocalQuality, "audio_wer", wer)
    admin = _login(client, ADMIN)
    point = _approved_point(client, admin, "Điểm QA", "Nội dung cần kiểm tra.")
    _drain(client)
    rows = client.get(f"{API}/translations", headers=admin).json()
    assert all(row["comet_qe"] == 0.4 and "low_comet_qe" in row["qa_flags"] for row in rows)
    cells = client.get(f"{API}/audio/status", headers=admin).json()
    cell = next(row for row in cells if row["id"] == point)["langs"]["vi"]
    assert cell["state"] == "failed" and "ASR WER" in cell["error"]


def test_pack_publish_rollback_and_missing_audio(client: TestClient) -> None:
    admin = _login(client, ADMIN)
    p1 = _approved_point(client, admin, "Điểm A", "Bài A.")
    tour = _published_tour(client, admin, "free", [p1])

    p2 = _approved_point(client, admin, "Điểm B", "Bài B.")
    r = client.patch(
        f"{API}/tours/{tour}", json={"attractions": [{"id": p1}, {"id": p2}]}, headers=admin
    )
    assert r.json()["attraction_count"] == 2
    missing = client.post(f"{API}/packs/build", json={"tour_id": tour, "lang": "en"}, headers=admin)
    assert missing.status_code == 422
    assert "Điểm B" in missing.json()["detail"]

    _drain(client)
    _approve_all(client, admin)
    _drain(client)
    v2 = client.post(f"{API}/packs/build", json={"tour_id": tour, "lang": "en"}, headers=admin)
    assert v2.json()["version"] == 2
    early = client.post(f"{API}/packs/{v2.json()['id']}/publish", headers=admin)
    assert early.status_code == 409
    _drain(client)
    assert client.post(f"{API}/packs/{v2.json()['id']}/publish", headers=admin).status_code == 200

    packs = client.get(f"{API}/packs", params={"tour_id": tour, "lang": "en"}, headers=admin).json()
    by_version = {p["version"]: p for p in packs}
    assert by_version[1]["status"] == "superseded"
    assert by_version[2]["status"] == "published"
    assert by_version[2]["file_count"] == 2

    back = client.post(
        f"{API}/packs/{by_version[1]['id']}/rollback", json={"reason": "Lỗi"}, headers=admin
    )
    assert back.json()["status"] == "published"
    packs = client.get(f"{API}/packs", params={"tour_id": tour}, headers=admin).json()
    assert {p["version"]: p["status"] for p in packs} == {1: "published", 2: "superseded"}
    file_url = f"{API}/public/tours/{tour}/packs/en/files/{p2}"
    params = {"device_id": DEVICE}
    assert client.get(file_url, params=params).status_code == 404
    previous = client.get(file_url, params={**params, "pack_id": by_version[2]["id"]})
    assert previous.status_code == 200
    assert previous.headers["content-type"] == "audio/mpeg"
    wrong = client.post(
        f"{API}/packs/{by_version[1]['id']}/rollback", json={"reason": "x"}, headers=admin
    )
    assert wrong.status_code == 409
    actions = [x["action"] for x in client.get(f"{API}/audit", headers=admin).json()]
    assert "pack.rollback" in actions
    assert "pack.publish" in actions


def test_tour_validation(client: TestClient) -> None:
    admin = _login(client, ADMIN)
    p1 = _approved_point(client, admin, "Điểm C", "Bài.")
    body: dict[str, Any] = {"slug": "t1", "name": "T", "attractions": [{"id": p1}]}
    created = client.post(f"{API}/tours", json=body, headers=admin).json()
    assert created["bbox"] == [106.69, 10.77, 106.69, 10.77]
    assert client.post(f"{API}/tours", json=body, headers=admin).status_code == 409
    bad = {**body, "slug": "t2", "attractions": [{"id": p1}, {"id": p1}]}
    assert client.post(f"{API}/tours", json=bad, headers=admin).status_code == 422
    empty = {**body, "slug": "t3", "attractions": []}
    assert client.post(f"{API}/tours", json=empty, headers=admin).status_code == 422
    ghost = {**body, "slug": "t4", "attractions": [{"id": "00000000-0000-0000-0000-000000000000"}]}
    assert client.post(f"{API}/tours", json=ghost, headers=admin).status_code == 422
    assert client.get(f"{API}/tours/{created['id']}", headers=admin).status_code == 200
    assert client.get(f"{API}/tours/khong-co", headers=admin).status_code == 404
    assert len(client.get(f"{API}/tours", headers=admin).json()) == 1
    tr = _login(client, TRANSLATOR)
    assert client.get(f"{API}/tours", headers=tr).status_code == 403


def test_ticket_mobile_flow_and_analytics(client: TestClient) -> None:
    admin = _login(client, ADMIN)
    p1 = _approved_point(client, admin, "Điểm P", "Bài P.")
    p2 = _approved_point(client, admin, "Điểm Q", "Bài Q.")
    tour = _published_tour(client, admin, "paid", [p1, p2])

    listed = client.get(f"{API}/public/tours").json()
    assert [(t["id"], t["access"], t["langs"]) for t in listed] == [(tour, "paid", ["en"])]

    url = f"{API}/public/tours/{tour}/packs/en"
    blocked = client.get(url, params={"device_id": DEVICE})
    assert blocked.status_code == 403
    assert blocked.json()["title"] == "ticket_required"
    preview = client.get(url, params={"device_id": DEVICE, "preview": True}).json()
    assert preview["access"] == "preview"
    assert [f["attraction_id"] for f in preview["files"]] == [p1]
    assert "storage_key" not in preview["files"][0]
    assert client.get(f"{url}/files/{p1}", params={"device_id": DEVICE}).status_code == 200
    assert client.get(f"{url}/files/{p2}", params={"device_id": DEVICE}).status_code == 403
    pinned = {"device_id": DEVICE, "pack_id": preview["pack_id"]}
    assert client.get(f"{url}/files/{p1}", params=pinned).status_code == 200
    assert client.get(f"{url}/files/{p2}", params=pinned).status_code == 403

    until = (datetime.now(UTC) + timedelta(days=30)).isoformat()
    body = {"batch": "QUAY-1", "tour_ids": [tour], "valid_until": until, "count": 2}
    issued = client.post(f"{API}/tickets", json={**body, "transfers_left": 1}, headers=admin).json()
    code, code2 = issued["codes"]
    past = {**body, "valid_until": "2020-01-01T00:00:00Z"}
    assert client.post(f"{API}/tickets", json=past, headers=admin).status_code == 422

    activate = f"{API}/public/tickets/activate"
    bad = client.post(activate, json={"code": "SAIMAVE", "device_id": DEVICE})
    assert bad.status_code == 422
    first = client.post(activate, json={"code": code.lower(), "device_id": DEVICE}).json()
    assert (first["result"], first["tour_ids"]) == ("activated", [tour])
    again = client.post(activate, json={"code": code, "device_id": DEVICE}).json()
    assert again["result"] == "already_active"

    full = client.get(url, params={"device_id": DEVICE}).json()
    assert full["access"] == "full"
    assert len(full["files"]) == 2
    got = client.get(f"{url}/files/{p2}", params={"device_id": DEVICE})
    assert got.headers["content-type"] == "audio/mpeg"
    assert b"Neural" in got.content

    moved = client.post(activate, json={"code": code, "device_id": OTHER}).json()
    assert moved["result"] == "transferred"
    assert client.get(url, params={"device_id": DEVICE}).status_code == 403
    out = client.post(activate, json={"code": code, "device_id": DEVICE})
    assert out.status_code == 409
    assert out.json()["title"] == "ticket_no_transfers"

    found = client.get(f"{API}/tickets", params={"q": "QUAY-1"}, headers=admin).json()
    assert len(found) == 2
    assert found[0]["tour_ids"] == [tour]
    hint = client.get(f"{API}/tickets", params={"q": code2[-4:]}, headers=admin).json()
    assert [t["code_hint"] for t in hint] == [code2[-4:]]
    one = next(t for t in found if t["code_hint"] == code[-4:])
    revoked = client.post(f"{API}/tickets/revoke", json={"ticket_id": one["id"]}, headers=admin)
    assert revoked.json()["revoked"] == 1
    assert client.get(url, params={"device_id": OTHER}).status_code == 403
    assert client.post(f"{API}/tickets/revoke", json={}, headers=admin).status_code == 422
    batch = client.post(f"{API}/tickets/revoke", json={"batch": "QUAY-1"}, headers=admin)
    assert batch.json()["revoked"] == 1
    gone = client.post(activate, json={"code": code2, "device_id": OTHER})
    assert gone.status_code == 422

    now = datetime.now(UTC).isoformat()
    events = [
        {"event_id": "e1", "attraction_id": p1, "lang": "en", "event": "play", "ts": now},
        {"event_id": "e2", "attraction_id": p1, "lang": "en", "event": "complete", "ts": now},
        {"event_id": "e3", "attraction_id": p2, "lang": "en", "event": "play", "ts": now},
        {"event_id": "e4", "attraction_id": "khong-co", "lang": "en", "event": "play", "ts": now},
    ]
    sent = client.post(
        f"{API}/public/playback-events", json={"device_id": DEVICE, "events": events}
    )
    assert sent.json()["accepted"] == 3
    dup = client.post(f"{API}/public/playback-events", json={"device_id": DEVICE, "events": events})
    assert dup.json()["accepted"] == 0
    summary = client.get(
        f"{API}/analytics/summary", params={"tour_id": tour, "lang": "en"}, headers=admin
    ).json()
    assert (summary["plays"], summary["completes"], summary["completion_rate"]) == (2, 1, 0.5)
    assert len(summary["top_attractions"]) == 2
    assert summary["by_lang"] == [{"lang": "en", "plays": 2}]


def test_accounts(client: TestClient) -> None:
    admin = _login(client, ADMIN)
    me = client.post(f"{API}/auth/login", json=ADMIN).json()["user"]["id"]
    body = {"email": " New@Test.vn ", "password": "mat-khau-moi", "role": "editor"}
    created = client.post(f"{API}/admin/users", json=body, headers=admin)
    assert created.status_code == 201
    uid = created.json()["id"]
    assert created.json()["email"] == "new@test.vn"
    assert client.post(f"{API}/admin/users", json=body, headers=admin).status_code == 409
    creds = {"email": "new@test.vn", "password": "mat-khau-moi"}
    token = client.post(f"{API}/auth/login", json=creds).json()
    h = {"Authorization": f"Bearer {token['access_token']}"}
    assert client.get(f"{API}/attractions", headers=h).status_code == 200

    role = client.patch(f"{API}/admin/users/{uid}", json={"role": "translator"}, headers=admin)
    assert role.json()["role"] == "translator"
    # đổi vai trò thu hồi phiên ngay
    assert client.get(f"{API}/attractions", headers=h).status_code == 401
    refreshed = client.post(f"{API}/auth/refresh", json={"refresh_token": token["refresh_token"]})
    assert refreshed.status_code == 401

    lock = client.patch(f"{API}/admin/users/{uid}", json={"is_active": False}, headers=admin)
    assert lock.json()["is_active"] is False
    locked = client.post(f"{API}/auth/login", json=creds)
    assert locked.json()["title"] == "user_inactive"
    self_lock = client.patch(f"{API}/admin/users/{me}", json={"is_active": False}, headers=admin)
    assert self_lock.status_code == 403
    ghost = "00000000-0000-0000-0000-000000000000"
    missing = client.patch(f"{API}/admin/users/{ghost}", json={"full_name": "x"}, headers=admin)
    assert missing.status_code == 404
    assert {u["email"] for u in client.get(f"{API}/admin/users", headers=admin).json()} >= {
        "new@test.vn"
    }
    actions = [x["action"] for x in client.get(f"{API}/audit", headers=admin).json()]
    assert "user.lock" in actions


def test_failed_job_waits_before_next_attempt(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(job_repo, "BACKOFF_S", (60, 60))
    admin = _login(client, ADMIN)
    FakeTTS.fail = True
    point = _approved_point(client, admin, "Điểm chờ", "Nội dung.")
    _drain(client)  # lần 1 lỗi, job còn hàng đợi nhưng chưa tới giờ nên không chạy lại ngay
    cell = {x["id"]: x for x in client.get(f"{API}/audio/status", headers=admin).json()}[point]
    assert cell["langs"]["vi"]["state"] == "queued"
