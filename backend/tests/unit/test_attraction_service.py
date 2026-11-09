from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

import pytest

from app.core.exceptions import ConflictError, InvalidContentError, NotFoundError
from app.models.attraction import Attraction, ScriptStatus
from app.models.audit import AuditFilters, AuditLog, AuditResource
from app.models.language import Language
from app.services.attraction_service import AttractionService, slugify
from app.services.audit_service import AuditService

NOW = datetime(2026, 11, 5, tzinfo=UTC)
ACTOR = str(uuid4())


class FakeAudit:
    def __init__(self) -> None:
        self.actions: list[str] = []

    async def insert(
        self, actor_id: str, action: str, resource: AuditResource, note: str | None, ts: datetime
    ) -> AuditLog:
        self.actions.append(action)
        return AuditLog("1", actor_id, action, resource, ts, note)

    async def find(
        self,
        limit: int,
        actor_id: str | None = None,
        resource: AuditResource | None = None,
        before: datetime | None = None,
        filters: AuditFilters | None = None,
    ) -> list[AuditLog]:
        return []


class FakeRepo:
    def __init__(self) -> None:
        self.items: dict[str, Attraction] = {}
        self.jobs: list[dict[str, Any]] = []

    async def find_all(self, category: str | None, script_status: str | None) -> list[Attraction]:
        return list(self.items.values())

    async def get(self, attraction_id: str) -> Attraction | None:
        return self.items.get(attraction_id)

    async def insert(
        self,
        name: str,
        slug: str,
        category: str,
        priority: int,
        lat: float,
        lng: float,
        radius: int,
        script: str,
        summary: str | None,
        images: list[str],
        actor_id: str,
        now: datetime,
    ) -> Attraction | None:
        if any(a.slug == slug for a in self.items.values()):
            return None
        item = Attraction(
            str(uuid4()),
            name,
            slug,
            summary,
            images,
            lat,
            lng,
            radius,
            category,
            priority,
            script,
            ScriptStatus.DRAFT,
            1,
            None,
            actor_id,
            actor_id,
            now,
            now,
        )
        self.items[item.id] = item
        return item

    async def update_info(
        self, attraction_id: str, fields: dict[str, Any], actor_id: str, now: datetime
    ) -> Attraction | None:
        cur = self.items.get(attraction_id)
        if cur is None:
            return None
        self.items[attraction_id] = Attraction(**{**cur.__dict__, **fields})
        return self.items[attraction_id]

    async def update_script(
        self,
        attraction_id: str,
        expected_status: ScriptStatus,
        patch: dict[str, Any],
        actor_id: str,
        now: datetime,
        jobs: list[dict[str, Any]] | None = None,
    ) -> Attraction | None:
        self.jobs.extend(jobs or [])
        cur = self.items.get(attraction_id)
        if cur is None or cur.script_status != expected_status:
            return None
        data = dict(cur.__dict__)
        if "body" in patch:
            data["script"] = patch["body"]
        if "status" in patch:
            data["script_status"] = ScriptStatus(patch["status"])
        if "version" in patch:
            data["script_version"] = patch["version"]
        if "review_note" in patch:
            data["review_note"] = patch["review_note"]
        self.items[attraction_id] = Attraction(**data)
        return self.items[attraction_id]


class FakeLanguages:
    async def list_active(self) -> list[Language]:
        return [
            Language("vi", "vi-VN", "Tiếng Việt", is_source=True),
            Language("en", "en-US", "EN"),
        ]

    async def upsert(self, lang: Language) -> None: ...


def _svc() -> tuple[AttractionService, FakeAudit]:
    audit = FakeAudit()
    return AttractionService(
        FakeRepo(), AuditService(audit), FakeLanguages(), clock=lambda: NOW
    ), audit


async def _create(svc: AttractionService, name: str = "Chùa Đức Bà") -> Attraction:
    return await svc.create(name, "temple", 1, 10.7, 106.6, 40, "nội dung", ACTOR)


@pytest.mark.parametrize(
    ("name", "slug"),
    [
        ("Chùa Ngọc Hoàng", "chua-ngoc-hoang"),
        ("  Đường Đồng Khởi!! ", "duong-dong-khoi"),
        ("Bảo tàng 3/2", "bao-tang-3-2"),
    ],
)
def test_slugify_vietnamese(name: str, slug: str) -> None:
    assert slugify(name) == slug


def test_slugify_non_latin_name_gets_random_slug() -> None:
    assert len(slugify("中文")) == 8


async def test_full_review_flow_and_audit() -> None:
    svc, audit = _svc()
    a = await _create(svc)
    assert (await svc.save_script(a.id, "bản mới", ACTOR)).script == "bản mới"
    assert (await svc.submit(a.id, ACTOR)).script_status is ScriptStatus.IN_REVIEW

    rejected = await svc.reject(a.id, "thiếu năm", ACTOR)
    assert (rejected.script_status, rejected.review_note) == (ScriptStatus.DRAFT, "thiếu năm")

    assert (await svc.submit(a.id, ACTOR)).review_note is None
    approved = await svc.approve(a.id, ACTOR)
    assert (approved.script_status, approved.script_version) == (ScriptStatus.APPROVED, 1)

    edited = await svc.save_script(a.id, "bản sửa sau duyệt", ACTOR)
    assert (edited.script_status, edited.script_version) == (ScriptStatus.DRAFT, 2)
    assert audit.actions == [
        "attraction.create",
        "script.submit",
        "script.reject",
        "script.submit",
        "script.approve",
    ]


async def test_wrong_status_is_conflict_and_records_no_audit() -> None:
    svc, audit = _svc()
    a = await _create(svc)
    for call in (svc.approve(a.id, ACTOR), svc.reject(a.id, "x", ACTOR)):
        with pytest.raises(ConflictError):
            await call
    await svc.submit(a.id, ACTOR)
    with pytest.raises(ConflictError):
        await svc.save_script(a.id, "x", ACTOR)
    with pytest.raises(ConflictError):
        await svc.submit(a.id, ACTOR)
    assert audit.actions == ["attraction.create", "script.submit"]


async def test_missing_attraction_is_not_found() -> None:
    svc, _ = _svc()
    for call in (svc.get("x"), svc.submit("x", ACTOR), svc.approve("x", ACTOR)):
        with pytest.raises(NotFoundError):
            await call


async def test_duplicate_name_is_conflict() -> None:
    svc, _ = _svc()
    await _create(svc, "Chùa A")
    with pytest.raises(ConflictError):
        await _create(svc, "chùa   a!")


async def test_empty_script_cannot_be_submitted() -> None:
    svc, audit = _svc()
    a = await svc.create("Trống", "park", 1, 10.7, 106.6, 40, "  \n ", ACTOR)
    with pytest.raises(InvalidContentError):
        await svc.submit(a.id, ACTOR)
    assert audit.actions == ["attraction.create"]


async def test_update_records_audit_and_empty_patch_changes_nothing() -> None:
    svc, audit = _svc()
    a = await _create(svc)
    assert await svc.update(a.id, {}, ACTOR) == a
    assert audit.actions == ["attraction.create"]
    assert (await svc.update(a.id, {"summary": "tóm tắt"}, ACTOR)).summary == "tóm tắt"
    assert audit.actions == ["attraction.create", "attraction.update"]
    with pytest.raises(NotFoundError):
        await svc.update("x", {"summary": "y"}, ACTOR)
