import re
import unicodedata
import uuid
from collections.abc import Callable
from datetime import UTC, datetime
from typing import Any

from app.core.exceptions import ConflictError, InvalidContentError, NotFoundError
from app.models.attraction import Attraction, ScriptStatus
from app.models.audit import AuditResource
from app.repositories.attraction_repo import AttractionRepository
from app.repositories.job_repo import job_spec, text_hash
from app.repositories.language_repo import LanguageRepository
from app.services.audit_service import AuditService


def _utcnow() -> datetime:
    return datetime.now(UTC)


def slugify(name: str) -> str:
    """`Chùa Đức Bà` → `chua-duc-ba`; tên không có chữ Latin thì dùng mã ngẫu nhiên."""
    ascii_name = (
        unicodedata.normalize("NFD", name.replace("đ", "d").replace("Đ", "D"))
        .encode("ascii", "ignore")
        .decode()
    )
    return re.sub(r"[^a-z0-9]+", "-", ascii_name.lower()).strip("-") or uuid.uuid4().hex[:8]


class AttractionService:
    def __init__(
        self,
        repo: AttractionRepository,
        audit: AuditService,
        languages: LanguageRepository,
        clock: Callable[[], datetime] = _utcnow,
    ) -> None:
        self._repo = repo
        self._audit = audit
        self._languages = languages
        self._clock = clock

    async def find_all(
        self, category: str | None = None, script_status: str | None = None
    ) -> list[Attraction]:
        return await self._repo.find_all(category, script_status)

    async def get(self, attraction_id: str) -> Attraction:
        attraction = await self._repo.get(attraction_id)
        if attraction is None:
            raise NotFoundError("attraction_not_found", "Không tìm thấy điểm tham quan")
        return attraction

    async def create(
        self,
        name: str,
        category: str,
        priority: int,
        lat: float,
        lng: float,
        radius: int,
        script: str,
        actor_id: str,
        summary: str | None = None,
        images: list[str] | None = None,
    ) -> Attraction:
        created = await self._repo.insert(
            name,
            slugify(name),
            category,
            priority,
            lat,
            lng,
            radius,
            script,
            summary,
            images or [],
            actor_id,
            self._clock(),
        )
        if created is None:
            raise ConflictError("attraction_exists", f"Đã có điểm tham quan tên gần giống '{name}'")
        await self._audit.record(actor_id, "attraction.create", _resource(created.id))
        return created

    async def update(self, attraction_id: str, fields: dict[str, Any], actor_id: str) -> Attraction:
        if not fields:
            return await self.get(attraction_id)
        updated = await self._repo.update_info(attraction_id, fields, actor_id, self._clock())
        if updated is None:
            raise NotFoundError("attraction_not_found", "Không tìm thấy điểm tham quan")
        await self._audit.record(actor_id, "attraction.update", _resource(attraction_id))
        return updated

    async def save_script(self, attraction_id: str, body: str, actor_id: str) -> Attraction:
        """Sửa script đã duyệt: về nháp, tăng version. Đang chờ duyệt: không sửa được."""
        current = await self.get(attraction_id)
        if current.script_status is ScriptStatus.APPROVED:
            return await self._transition(
                attraction_id,
                ScriptStatus.APPROVED,
                {
                    "body": body,
                    "status": ScriptStatus.DRAFT.value,
                    "version": current.script_version + 1,
                    "review_note": None,
                },
                actor_id,
                "Script vừa thay đổi trạng thái, hãy tải lại trang",
            )
        return await self._transition(
            attraction_id,
            ScriptStatus.DRAFT,
            {"body": body},
            actor_id,
            "Không sửa được script đang chờ duyệt",
        )

    async def submit(self, attraction_id: str, actor_id: str) -> Attraction:
        current = await self.get(attraction_id)
        if current.script_status is ScriptStatus.DRAFT and not current.script.strip():
            raise InvalidContentError("script_empty", "Kịch bản đang rỗng, chưa thể gửi duyệt")
        updated = await self._transition(
            attraction_id,
            ScriptStatus.DRAFT,
            {"status": ScriptStatus.IN_REVIEW.value, "review_note": None},
            actor_id,
            "Chỉ gửi duyệt được script ở trạng thái nháp",
        )
        await self._audit.record(actor_id, "script.submit", _resource(attraction_id))
        return updated

    async def approve(self, attraction_id: str, actor_id: str) -> Attraction:
        current = await self.get(attraction_id)
        h = text_hash(current.script)
        jobs = []
        for lang in await self._languages.list_active():
            if lang.is_source:  # bản gốc đã duyệt thì sinh audio luôn, không cần dịch
                key = f"audio:{attraction_id}:{lang.code}:{h}"
                spec = {"attraction_id": attraction_id, "lang": lang.code}
                jobs.append(job_spec("audio", key, spec))
            else:
                key = f"translate:{attraction_id}:{lang.code}:{h}"
                spec = {"attraction_id": attraction_id, "lang": lang.code}
                jobs.append(job_spec("translate", key, spec))
        updated = await self._transition(
            attraction_id,
            ScriptStatus.IN_REVIEW,
            {"status": ScriptStatus.APPROVED.value, **self._review_fields(actor_id)},
            actor_id,
            "Chỉ duyệt được script đang chờ duyệt",
            jobs,
        )
        await self._audit.record(actor_id, "script.approve", _resource(attraction_id))
        return updated

    async def reject(self, attraction_id: str, note: str, actor_id: str) -> Attraction:
        updated = await self._transition(
            attraction_id,
            ScriptStatus.IN_REVIEW,
            {
                "status": ScriptStatus.DRAFT.value,
                "review_note": note,
                **self._review_fields(actor_id),
            },
            actor_id,
            "Chỉ trả lại được script đang chờ duyệt",
        )
        await self._audit.record(actor_id, "script.reject", _resource(attraction_id), note)
        return updated

    def _review_fields(self, actor_id: str) -> dict[str, Any]:
        return {"reviewed_by": actor_id, "reviewed_at": self._clock().isoformat()}

    async def _transition(
        self,
        attraction_id: str,
        expected: ScriptStatus,
        patch: dict[str, Any],
        actor_id: str,
        conflict_detail: str,
        jobs: list[dict[str, Any]] | None = None,
    ) -> Attraction:
        updated = await self._repo.update_script(
            attraction_id, expected, patch, actor_id, self._clock(), jobs
        )
        if updated is None:
            await self.get(
                attraction_id
            )  # không có điểm này thì báo 404, còn lại là sai trạng thái
            raise ConflictError("invalid_script_status", conflict_detail)
        return updated


def _resource(attraction_id: str) -> AuditResource:
    return AuditResource("attraction", attraction_id)
