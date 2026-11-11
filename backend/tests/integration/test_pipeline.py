"""Chạy nguyên chuỗi UC-02 đến UC-18 qua HTTP, với worker thật và TTS giả."""

import json
from collections.abc import Callable, Iterator
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any
from uuid import UUID

import pytest
from fastapi.testclient import TestClient
from redis import Redis
from sqlalchemy import delete, insert
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncConnection

from app.core import deps, schema
from app.core.config import get_settings
from app.core.device import issue_device_id
from app.core.security import hash_password
from app.integrations.translate.mock import MockTranslate
from app.main import app
from app.repositories import job_repo
from app.services.language_service import DEFAULT_LANGUAGES
from tests.integration.conftest import clear_test_pois, run_sql

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
            schema.tour_pois,
            schema.tours,
            schema.refresh_tokens,
            schema.audit_logs,
        ):
            await conn.execute(delete(t))
        await clear_test_pois(conn)
        for lang in DEFAULT_LANGUAGES:
            values = {
                "code": lang.code,
                "bcp47": lang.bcp47,
                "native_name": lang.native_name,
                "is_source": lang.is_source,
                "is_active": lang.is_active,
            }
            await conn.execute(
                pg_insert(schema.languages)
                .values(**values)
                .on_conflict_do_update(index_elements=[schema.languages.c.code], set_=values)
            )
        await conn.execute(delete(schema.users).where(schema.users.c.email != ADMIN["email"]))
        await conn.execute(
            insert(schema.users).values(
                email=TRANSLATOR["email"], password_hash=pw, roles=["translator"]
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
    a = c.post(f"{API}/pois", json={**body, "script": script}, headers=admin).json()
    assert c.post(f"{API}/pois/{a['id']}/submit", headers=admin).status_code == 200
    assert c.post(f"{API}/pois/{a['id']}/approve", headers=admin).status_code == 200
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
        "name": f"Tour {access}",
        "access": access,
        "status": "published",
        "pois": [{"id": p} for p in points],
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
    body = {"poi_id": point, "lang": "vi"}
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
    bad = {"poi_id": point, "lang": "en"}
    assert client.post(f"{API}/audio/retry", json=bad, headers=admin).status_code == 422


def test_pack_cannot_publish_until_checks_pass(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    admin = _login(client, ADMIN)
    poi = _approved_point(client, admin, "Điểm kiểm tra pack", "Nội dung kiểm tra.")
    tour = _published_tour(client, admin, "free", [poi])
    moved = client.patch(f"{API}/pois/{poi}", json={"radius": 55}, headers=admin)
    assert moved.status_code == 200  # nội dung khác bản đang phát hành thì mới build được
    pack = client.post(f"{API}/packs/build", json={"tour_id": tour, "lang": "en"}, headers=admin)
    assert pack.status_code == 201
    pack_id = pack.json()["id"]
    worker = deps.get_pipeline_service()
    monkeypatch.setattr(worker, "_verify_pack_files", lambda files: False)
    assert client.portal is not None
    assert client.portal.call(worker.run_once)
    rows = client.get(f"{API}/packs", headers=admin).json()
    assert next(row for row in rows if row["id"] == pack_id)["status"] == "building"
    assert client.post(f"{API}/packs/{pack_id}/publish", headers=admin).status_code == 409
    assert client.portal.call(worker.run_once)
    assert client.portal.call(worker.run_once)
    rows = client.get(f"{API}/packs", headers=admin).json()
    assert next(row for row in rows if row["id"] == pack_id)["status"] == "failed"


def test_pack_publish_rollback_and_missing_audio(client: TestClient) -> None:
    admin = _login(client, ADMIN)
    p1 = _approved_point(client, admin, "Điểm A", "Bài A.")
    tour = _published_tour(client, admin, "free", [p1])

    p2 = _approved_point(client, admin, "Điểm B", "Bài B.")
    r = client.patch(f"{API}/tours/{tour}", json={"pois": [{"id": p1}, {"id": p2}]}, headers=admin)
    assert r.json()["poi_count"] == 2
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


def test_pack_build_dedupe_rerun_outdated_publish_and_corrupt_audio(client: TestClient) -> None:
    admin = _login(client, ADMIN)
    p1 = _approved_point(client, admin, "Điểm R", "Bài R.")
    tour = _published_tour(client, admin, "free", [p1])
    body = {"tour_id": tour, "lang": "en"}

    def build() -> Any:
        return client.post(f"{API}/packs/build", json=body, headers=admin)

    def move(radius: int) -> None:
        r = client.patch(f"{API}/pois/{p1}", json={"radius": radius}, headers=admin)
        assert r.status_code == 200, r.text

    # Nội dung giống bản đang phát hành: bấm build không sinh version mới
    same = build()
    assert same.status_code == 409
    assert same.json()["title"] == "pack_unchanged"

    move(60)
    v2 = build().json()
    spam = build()  # v2 còn building
    assert spam.status_code == 409
    assert spam.json()["title"] == "pack_building"
    _drain(client)
    assert build().json()["title"] == "pack_unchanged"  # giống v2 đang qa

    move(70)
    v3 = build().json()
    _drain(client)
    assert client.post(f"{API}/packs/{v3['id']}/publish", headers=admin).status_code == 200
    packs = client.get(f"{API}/packs", params={"tour_id": tour, "lang": "en"}, headers=admin).json()
    assert [p["version"] for p in packs] == [3, 2, 1]

    # Bản QA cũ hơn bản đang phát hành: phải dùng rollback, không phát hành đè
    older = client.post(f"{API}/packs/{v2['id']}/publish", headers=admin)
    assert older.status_code == 409
    assert older.json()["title"] == "pack_outdated"

    # Job build chạy lại (worker kẹt bị đưa về hàng đợi) không được kéo bản published về qa
    assert client.portal is not None
    svc = deps.get_pipeline_service()
    spec = job_repo.job_spec("pack_build", f"pack:{v3['id']}", {"pack_id": v3["id"]})
    client.portal.call(svc._jobs.enqueue, [spec], None, datetime.now(UTC))
    _drain(client)
    packs = client.get(f"{API}/packs", params={"tour_id": tour, "lang": "en"}, headers=admin).json()
    assert {p["version"]: p["status"] for p in packs}[3] == "published"

    # File audio app tải bị hỏng: không phát hành, không rollback
    move(80)
    v4 = build().json()
    _drain(client)
    root = Path(get_settings().storage_dir)
    manifest = json.loads((root / f"packs/{tour}/en/4/manifest.json").read_text())
    audio = root / manifest["files"][0]["storage_key"]
    original = audio.read_bytes()
    audio.write_bytes(b"broken")
    bad = client.post(f"{API}/packs/{v4['id']}/publish", headers=admin)
    assert bad.status_code == 422
    assert bad.json()["title"] == "pack_files_invalid"
    v1 = next(p for p in packs if p["version"] == 1)
    back = client.post(f"{API}/packs/{v1['id']}/rollback", json={"reason": "x"}, headers=admin)
    assert back.status_code == 422
    audio.write_bytes(original)
    assert client.post(f"{API}/packs/{v4['id']}/publish", headers=admin).status_code == 200


def test_pack_status_explains_build_and_diff_shows_changes(client: TestClient) -> None:
    admin = _login(client, ADMIN)
    p1 = _approved_point(client, admin, "Điểm S1", "Bài S1.")
    tour = _published_tour(client, admin, "free", [p1])

    def status() -> dict[str, Any]:
        r = client.get(f"{API}/packs/status", params={"tour_id": tour}, headers=admin)
        assert r.status_code == 200, r.text
        return {row["lang"]: row for row in r.json()}

    en = status()["en"]
    assert (en["can_build"], en["blocker"], en["same_version"]) == (False, "pack_unchanged", 1)
    assert en["published"]["version"] == 1
    assert en["published"]["published_by_email"] == ADMIN["email"]
    assert status()["ja"]["can_build"] is True  # đủ audio, chưa có pack

    # Điểm mới chưa có audio tiếng Anh: thẻ báo thiếu, nêu tên điểm
    p2 = _approved_point(client, admin, "Điểm S2", "Bài S2.")
    pois = [{"id": p1}, {"id": p2}]
    client.patch(f"{API}/tours/{tour}", json={"pois": pois}, headers=admin)
    en = status()["en"]
    assert (en["blocker"], en["ready_pois"], en["total_pois"]) == ("audio_missing", 1, 2)
    assert en["missing"] == ["Điểm S2"]

    _drain(client)
    _approve_all(client, admin)
    _drain(client)
    client.patch(f"{API}/pois/{p1}", json={"radius": 90}, headers=admin)
    assert status()["en"]["can_build"] is True
    v2 = client.post(f"{API}/packs/build", json={"tour_id": tour, "lang": "en"}, headers=admin)
    assert status()["en"]["blocker"] == "pack_building"
    _drain(client)
    en = status()["en"]
    assert en["pending"]["id"] == v2.json()["id"]

    diff = client.get(f"{API}/packs/{v2.json()['id']}/diff", headers=admin).json()
    assert diff["against_version"] == 1
    assert diff["added"] == ["Điểm S2"] and diff["removed"] == []
    assert diff["changed"] == [{"name": "Điểm S1", "what": ["thông tin"]}]
    assert diff["bytes_delta"] > 0
    missing = client.get(f"{API}/packs/status", params={"tour_id": str(UUID(int=0))}, headers=admin)
    assert missing.status_code == 404


def test_translate_job_passes_bcp47_tags_from_languages_table(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    seen: list[tuple[str | None, str | None]] = []
    original = MockTranslate.translate

    async def spy(self: MockTranslate, *args: Any, **kwargs: Any) -> str:
        seen.append((kwargs.get("source_tag"), kwargs.get("target_tag")))
        return await original(self, *args, **kwargs)

    monkeypatch.setattr(MockTranslate, "translate", spy)
    admin = _login(client, ADMIN)
    _approved_point(client, admin, "Điểm BCP", "Bài BCP.")
    _drain(client)
    assert ("vi-VN", "zh-CN") in seen and ("vi-VN", "en-US") in seen


def test_audio_status_explains_why_audio_is_missing(client: TestClient) -> None:
    admin = _login(client, ADMIN)
    body = {"name": "Điểm lý do", "category": "museum", "lat": 10.77, "lng": 106.69, "radius": 40}
    poi = client.post(f"{API}/pois", json={**body, "script": "Bài."}, headers=admin).json()["id"]

    def hints() -> dict[str, Any]:
        rows = client.get(f"{API}/audio/status", headers=admin).json()
        cells = next(r for r in rows if r["id"] == poi)["langs"]
        return {lang: (c["state"], c["hint"]) for lang, c in cells.items() if lang in ("vi", "en")}

    assert hints() == {"vi": ("none", "script_draft"), "en": ("none", "script_draft")}
    client.post(f"{API}/pois/{poi}/submit", headers=admin)
    assert hints()["vi"] == ("none", "script_in_review")
    client.post(f"{API}/pois/{poi}/approve", headers=admin)
    assert hints()["en"] == ("none", "translating")
    _drain(client)
    assert hints() == {"vi": ("ready", None), "en": ("none", "translation_pending")}


def test_stuck_poi_without_jobs_can_be_restarted_from_voice_studio(client: TestClient) -> None:
    """Script duyệt nhưng không có job (dữ liệu nhập tay): báo "chưa chạy", không báo đang dịch."""
    admin = _login(client, ADMIN)
    poi = _approved_point(client, admin, "Điểm kẹt", "Bài kẹt.")

    async def drop_jobs(conn: AsyncConnection) -> None:
        await conn.execute(delete(schema.jobs).where(schema.jobs.c.payload["poi_id"].astext == poi))

    run_sql(drop_jobs)

    def cell(lang: str) -> dict[str, Any]:
        rows = client.get(f"{API}/audio/status", headers=admin).json()
        found: dict[str, Any] = next(r for r in rows if r["id"] == poi)["langs"][lang]
        return found

    assert (cell("vi")["state"], cell("vi")["hint"]) == ("none", "not_started")
    assert cell("en")["hint"] == "not_started"

    retry = f"{API}/audio/retry"
    assert client.post(retry, json={"poi_id": poi, "lang": "en"}, headers=admin).status_code == 204
    assert cell("en")["hint"] == "translating"
    assert client.post(retry, json={"poi_id": poi, "lang": "vi"}, headers=admin).status_code == 204
    _drain(client)
    assert cell("vi")["state"] == "ready"
    assert cell("en")["hint"] == "translation_pending"
    # Đã có bản dịch chờ duyệt: không tạo job dịch nữa, phải duyệt bản dịch
    assert client.post(retry, json={"poi_id": poi, "lang": "en"}, headers=admin).status_code == 422

    async def fail_translation(conn: AsyncConnection) -> None:
        now = datetime.now(UTC)
        await conn.execute(
            insert(schema.jobs).values(
                type="translate",
                dedupe_key=f"translate:{poi}:ja:abc",
                payload={"poi_id": poi, "lang": "ja"},
                status="failed",
                attempts=3,
                error={"message": "Groq 429"},
                created_at=now,
                updated_at=now,
            )
        )

    run_sql(fail_translation)
    ja = cell("ja")
    assert (ja["hint"], ja["error"]) == ("translate_failed", "Groq 429")


def test_tour_validation(client: TestClient) -> None:
    admin = _login(client, ADMIN)
    p1 = _approved_point(client, admin, "Điểm C", "Bài.")
    body: dict[str, Any] = {"name": "T", "pois": [{"id": p1}]}
    created = client.post(f"{API}/tours", json=body, headers=admin).json()
    assert created["bbox"] == [106.69, 10.77, 106.69, 10.77]
    same_name = client.post(f"{API}/tours", json=body, headers=admin)
    assert same_name.status_code == 201
    assert same_name.json()["id"] != created["id"]
    bad = {**body, "pois": [{"id": p1}, {"id": p1}]}
    assert client.post(f"{API}/tours", json=bad, headers=admin).status_code == 422
    empty = {**body, "pois": []}
    assert client.post(f"{API}/tours", json=empty, headers=admin).status_code == 422
    ghost = {**body, "pois": [{"id": "00000000-0000-0000-0000-000000000000"}]}
    assert client.post(f"{API}/tours", json=ghost, headers=admin).status_code == 422
    assert client.get(f"{API}/tours/{created['id']}", headers=admin).status_code == 200
    assert client.get(f"{API}/tours/khong-co", headers=admin).status_code == 404
    assert len(client.get(f"{API}/tours", headers=admin).json()) == 2
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
    # Cờ preview cũ không còn mở khoá điểm miễn phí.
    assert client.get(url, params={"device_id": DEVICE, "preview": True}).status_code == 403
    assert client.get(f"{url}/files/{p1}", params={"device_id": DEVICE}).status_code == 403
    assert client.get(f"{url}/files/{p2}", params={"device_id": DEVICE}).status_code == 403

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
    assert len(full["files"]) == 2
    assert "storage_key" not in full["files"][0]
    pinned = {"device_id": DEVICE, "pack_id": full["pack_id"]}
    got = client.get(f"{url}/files/{p2}", params=pinned)
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
        {"event_id": "e1", "poi_id": p1, "lang": "en", "event": "play", "ts": now},
        {"event_id": "e2", "poi_id": p1, "lang": "en", "event": "complete", "ts": now},
        {"event_id": "e3", "poi_id": p2, "lang": "en", "event": "play", "ts": now},
        {"event_id": "e4", "poi_id": "khong-co", "lang": "en", "event": "play", "ts": now},
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
    assert len(summary["top_pois"]) == 2
    assert summary["by_lang"] == [{"lang": "en", "plays": 2}]
    today = datetime.now(UTC).date().isoformat()
    assert summary["by_day"] == [{"day": today, "plays": 2, "completes": 1}]


def test_analytics_by_day_uses_viewer_timezone(client: TestClient) -> None:
    admin = _login(client, ADMIN)
    point = _approved_point(client, admin, "Điểm theo ngày", "Bài.")
    # 18:30 UTC hôm qua là 01:30 sáng nay ở Việt Nam
    late = datetime.now(UTC).replace(hour=18, minute=30, second=0, microsecond=0) - timedelta(
        days=1
    )
    events = [
        {
            "event_id": f"d{i}",
            "poi_id": point,
            "lang": "vi",
            "event": e,
            "trigger": "manual" if i == 0 else "geofence",
            "ts": late.isoformat(),
        }
        for i, e in enumerate(["play", "play", "complete"])
    ]
    client.post(f"{API}/public/playback-events", json={"device_id": DEVICE, "events": events})
    window = {
        "start": (late - timedelta(hours=1)).isoformat(),
        "end": (late + timedelta(hours=1)).isoformat(),
    }

    def days(tz: str) -> Any:
        r = client.get(f"{API}/analytics/summary", params={**window, "tz": tz}, headers=admin)
        return r.json()["by_day"]

    utc_day, vn_day = late.date(), (late + timedelta(hours=7)).date()
    assert days("UTC") == [{"day": utc_day.isoformat(), "plays": 2, "completes": 1}]
    assert days("Asia/Ho_Chi_Minh") == [{"day": vn_day.isoformat(), "plays": 2, "completes": 1}]
    detail = client.get(
        f"{API}/analytics/summary", params={**window, "tz": "Asia/Ho_Chi_Minh"}, headers=admin
    ).json()
    assert detail["devices"] == 1
    assert {item["trigger"]: item["plays"] for item in detail["by_trigger"]} == {
        "manual": 1,
        "geofence": 1,
    }
    assert detail["by_hour"] == [{"hour": 1, "plays": 2}]
    assert detail["top_pois"][0]["completes"] == 1
    bad = client.get(f"{API}/analytics/summary", params={"tz": "Sao/Hoa"}, headers=admin)
    assert bad.status_code == 422


def test_accounts(client: TestClient) -> None:
    admin = _login(client, ADMIN)
    me = client.post(f"{API}/auth/login", json=ADMIN).json()["user"]["id"]
    body = {"email": " New@Test.vn ", "password": "mat-khau-moi", "roles": ["editor", "translator"]}
    created = client.post(f"{API}/admin/users", json=body, headers=admin)
    assert created.status_code == 201
    uid = created.json()["id"]
    assert created.json()["email"] == "new@test.vn"
    assert client.post(f"{API}/admin/users", json=body, headers=admin).status_code == 409
    creds = {"email": "new@test.vn", "password": "mat-khau-moi"}
    token = client.post(f"{API}/auth/login", json=creds).json()
    h = {"Authorization": f"Bearer {token['access_token']}"}
    assert set(token["user"]["roles"]) == {"editor", "translator"}
    assert {"script:write", "translation:write"} <= set(token["user"]["permissions"])
    assert client.get(f"{API}/pois", headers=h).status_code == 200
    assert client.get(f"{API}/translations", headers=h).status_code == 200

    role = client.patch(f"{API}/admin/users/{uid}", json={"roles": ["translator"]}, headers=admin)
    assert role.json()["roles"] == ["translator"]
    # đổi vai trò thu hồi phiên ngay
    assert client.get(f"{API}/pois", headers=h).status_code == 401
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


def test_admin_sets_password_and_old_sessions_end(client: TestClient) -> None:
    admin = _login(client, ADMIN)
    body = {
        "email": "pw@test.vn",
        "password": "mat-khau-cu",
        "roles": ["editor"],
        "full_name": "Pw",
    }
    uid = client.post(f"{API}/admin/users", json=body, headers=admin).json()["id"]
    old = client.post(f"{API}/auth/login", json={"email": "pw@test.vn", "password": "mat-khau-cu"})
    h = {"Authorization": f"Bearer {old.json()['access_token']}"}
    url = f"{API}/admin/users/{uid}/password"

    assert client.post(url, json={"password": "ngan"}, headers=admin).status_code == 422
    assert client.post(url, json={"password": "mat-khau-moi-1"}, headers=h).status_code == 403
    assert client.post(url, json={"password": "mat-khau-moi-1"}, headers=admin).status_code == 204
    assert client.get(f"{API}/pois", headers=h).status_code == 401  # phiên cũ bị thu hồi
    again = client.post(f"{API}/auth/refresh", json={"refresh_token": old.json()["refresh_token"]})
    assert again.status_code == 401
    wrong = client.post(
        f"{API}/auth/login", json={"email": "pw@test.vn", "password": "mat-khau-cu"}
    )
    assert wrong.status_code == 401
    ok = client.post(
        f"{API}/auth/login", json={"email": "pw@test.vn", "password": "mat-khau-moi-1"}
    )
    assert ok.status_code == 200
    ghost = f"{API}/admin/users/00000000-0000-0000-0000-000000000000/password"
    assert client.post(ghost, json={"password": "mat-khau-moi-1"}, headers=admin).status_code == 404
    actions = [x["action"] for x in client.get(f"{API}/audit", headers=admin).json()]
    assert "user.password" in actions


def test_staff_change_own_password_needs_current_one(client: TestClient) -> None:
    admin = _login(client, ADMIN)
    body = {"email": "self@test.vn", "password": "mat-khau-cu", "roles": ["translator"]}
    client.post(f"{API}/admin/users", json={**body, "full_name": "Tự đổi"}, headers=admin)
    old = client.post(
        f"{API}/auth/login", json={"email": "self@test.vn", "password": "mat-khau-cu"}
    )
    h = {"Authorization": f"Bearer {old.json()['access_token']}"}
    url = f"{API}/auth/change-password"

    wrong = client.post(
        url, json={"current_password": "sai", "new_password": "moi-12345"}, headers=h
    )
    assert (wrong.status_code, wrong.json()["title"]) == (422, "wrong_password")
    same = {"current_password": "mat-khau-cu", "new_password": "mat-khau-cu"}
    assert client.post(url, json=same, headers=h).json()["title"] == "same_password"
    short = {"current_password": "mat-khau-cu", "new_password": "ngan"}
    assert client.post(url, json=short, headers=h).status_code == 422
    assert (
        client.post(url, json={"current_password": "x", "new_password": "y" * 8}).status_code == 401
    )

    ok = {"current_password": "mat-khau-cu", "new_password": "moi-12345"}
    assert client.post(url, json=ok, headers=h).status_code == 204
    assert client.get(f"{API}/translations", headers=h).status_code == 401  # phải đăng nhập lại
    creds = {"email": "self@test.vn", "password": "moi-12345"}
    assert client.post(f"{API}/auth/login", json=creds).status_code == 200


def test_translator_can_rerun_machine_translation(client: TestClient) -> None:
    admin = _login(client, ADMIN)
    tr = _login(client, TRANSLATOR)
    poi = _approved_point(client, admin, "Điểm dịch lại", "Bài dịch lại.")

    async def drop_jobs(conn: AsyncConnection) -> None:
        await conn.execute(delete(schema.jobs).where(schema.jobs.c.payload["poi_id"].astext == poi))

    run_sql(drop_jobs)
    url = f"{API}/translation-jobs/retry"
    assert client.post(url, json={"poi_id": poi, "lang": "en"}, headers=tr).status_code == 204
    _drain(client)
    rows = client.get(f"{API}/translations", params={"lang": "en"}, headers=tr).json()
    assert any(r["poi_id"] == poi for r in rows)
    # Đã có bản dịch: không dịch đè, phải duyệt hoặc sửa
    assert client.post(url, json={"poi_id": poi, "lang": "en"}, headers=tr).status_code == 422
    assert client.post(url, json={"poi_id": poi, "lang": "vi"}, headers=tr).status_code == 422


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


PNG = b"\x89PNG\r\n\x1a\n" + b"fake-image" * 50
CDN = "https://res.cloudinary.com/demo/image/upload/v1/geonarrate/a.png"


def test_upload_image_needs_config_and_valid_file(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    from app.integrations.images.cloudinary import CloudinaryImages

    admin = _login(client, ADMIN)
    url = f"{API}/pois/images"
    monkeypatch.setattr(get_settings(), "cloudinary_url", "")  # .env local có thể đã bật
    off = client.post(url, content=PNG, headers=admin)
    assert (off.status_code, off.json()["title"]) == (503, "image_upload_disabled")

    uploaded: list[tuple[int, str]] = []

    async def fake_upload(self: CloudinaryImages, data: bytes, content_type: str) -> str:
        uploaded.append((len(data), content_type))
        return CDN

    monkeypatch.setattr(get_settings(), "cloudinary_url", "cloudinary://k:s@demo")
    monkeypatch.setattr(CloudinaryImages, "upload", fake_upload)
    ok = client.post(url, content=PNG, headers=admin)
    assert ok.status_code == 201 and ok.json() == {"url": CDN}
    assert uploaded == [(len(PNG), "image/png")]
    bad = client.post(url, content=b"not an image", headers=admin)
    assert (bad.status_code, bad.json()["title"]) == (422, "image_invalid")
    assert client.post(url, content=PNG).status_code == 401

    async def failing_upload(self: CloudinaryImages, data: bytes, content_type: str) -> str:
        raise RuntimeError("Cloudinary từ chối ảnh (400)")

    monkeypatch.setattr(CloudinaryImages, "upload", failing_upload)
    down = client.post(url, content=PNG, headers=admin)
    assert (down.status_code, down.json()["title"]) == (503, "image_upload_failed")


def test_pack_bundles_images_for_offline(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    fetched: list[str] = []

    async def fake_fetch(url: str) -> tuple[bytes, str]:
        fetched.append(url)
        return PNG, "png"

    from app.services.pipeline_service import PipelineService

    real = PipelineService
    monkeypatch.setattr(
        deps, "PipelineService", lambda *a, **kw: real(*a, **kw, fetch_image=fake_fetch)
    )
    admin = _login(client, ADMIN)
    body = {"name": "Có ảnh", "category": "museum", "lat": 10.77, "lng": 106.69, "radius": 40}
    poi = client.post(
        f"{API}/pois",
        json={**body, "script": "Bài.", "images": [CDN, "https://example.com/other.jpg"]},
        headers=admin,
    ).json()["id"]
    client.post(f"{API}/pois/{poi}/submit", headers=admin)
    client.post(f"{API}/pois/{poi}/approve", headers=admin)
    tour = _published_tour(client, admin, "free", [poi])
    assert fetched == [CDN]  # ảnh ngoài Cloudinary không được kéo về

    manifest = client.get(
        f"{API}/public/tours/{tour}/packs/en", params={"device_id": DEVICE}
    ).json()
    images = manifest["files"][0]["images"]
    assert [set(i) for i in images] == [{"sha256", "bytes", "ext"}]
    assert images[0]["ext"] == "png" and images[0]["bytes"] == len(PNG)
    img_url = f"{API}/public/tours/{tour}/packs/en/files/{poi}/images"
    got = client.get(f"{img_url}/0", params={"device_id": DEVICE})
    assert got.status_code == 200 and got.content == PNG
    assert got.headers["content-type"] == "image/png"
    assert client.get(f"{img_url}/1", params={"device_id": DEVICE}).status_code == 404

    # đổi ảnh thì pack coi là nội dung mới; không đổi thì không build lại
    again = client.post(f"{API}/packs/build", json={"tour_id": tour, "lang": "en"}, headers=admin)
    assert again.status_code == 409
    client.patch(f"{API}/pois/{poi}", json={"images": []}, headers=admin)
    v2 = client.post(f"{API}/packs/build", json={"tour_id": tour, "lang": "en"}, headers=admin)
    assert v2.status_code in (200, 201), v2.text


def test_upload_image_rejects_oversize_body(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(get_settings(), "cloudinary_url", "cloudinary://k:s@demo")
    admin = _login(client, ADMIN)
    big = PNG + b"0" * (8 * 1024 * 1024)
    r = client.post(f"{API}/pois/images", content=big, headers=admin)
    assert (r.status_code, r.json()["title"]) == (422, "image_invalid")
