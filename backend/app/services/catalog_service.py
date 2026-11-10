"""Tour (UC-08), tài khoản (UC-11), vé QR (UC-13, 16), số liệu (UC-14, 18), API app (UC-15, 17)."""

import hashlib
import secrets
from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from typing import Any

from app.core.exceptions import (
    ConflictError,
    ForbiddenError,
    InvalidContentError,
    NotFoundError,
)
from app.models.audit import AuditResource
from app.models.user import Role, User
from app.repositories.analytics_repo import SqlAnalyticsRepository
from app.repositories.ticket_repo import SqlTicketRepository
from app.repositories.tour_repo import SqlTourRepository
from app.repositories.user_repo import UserRepository
from app.services.audit_service import AuditService
from app.services.auth_service import AuthService
from app.services.pipeline_service import PipelineService

# Không có ký tự dễ nhầm khi in (0/O, 1/I)
_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
_CODE_LEN = 16


def _utcnow() -> datetime:
    return datetime.now(UTC)


def hash_code(code: str) -> str:
    return hashlib.sha256(code.strip().upper().encode()).hexdigest()


class CatalogService:
    def __init__(
        self,
        tours: SqlTourRepository,
        tickets: SqlTicketRepository,
        analytics: SqlAnalyticsRepository,
        users: UserRepository,
        auth: AuthService,
        pipeline: PipelineService,
        audit: AuditService,
        clock: Callable[[], datetime] = _utcnow,
    ) -> None:
        self._tours = tours
        self._tickets = tickets
        self._analytics = analytics
        self._users = users
        self._auth = auth
        self._pipeline = pipeline
        self._audit = audit
        self._clock = clock

    # --- UC-08
    async def list_tours(self) -> list[dict[str, Any]]:
        return await self._tours.find()

    async def get_tour(self, tour_id: str) -> dict[str, Any]:
        tour = await self._tours.get(tour_id)
        if tour is None:
            raise NotFoundError("tour_not_found", "Không tìm thấy tour")
        return tour

    async def _check_tour_points(self, points: Any) -> None:
        if points is None:
            return
        ids = [p["id"] for p in points]
        if not ids:
            raise InvalidContentError("tour_empty", "Tour phải có ít nhất một điểm")
        if len(set(ids)) != len(ids) or await self._tours.count_existing(ids) != len(ids):
            raise InvalidContentError(
                "tour_points_invalid", "Danh sách điểm trùng hoặc không tồn tại"
            )

    async def create_tour(self, fields: dict[str, Any], actor_id: str) -> dict[str, Any]:
        points = fields.pop("pois")
        await self._check_tour_points(points)
        tour_id = await self._tours.save(None, fields, points, actor_id, self._clock())
        await self._audit.record(actor_id, "tour.create", AuditResource("tour", tour_id))
        return await self.get_tour(tour_id)

    async def update_tour(
        self, tour_id: str, fields: dict[str, Any], actor_id: str
    ) -> dict[str, Any]:
        await self.get_tour(tour_id)
        points = fields.pop("pois", None)
        await self._check_tour_points(points)
        await self._tours.save(tour_id, fields, points, actor_id, self._clock())
        await self._audit.record(actor_id, "tour.update", AuditResource("tour", tour_id))
        return await self.get_tour(tour_id)

    # --- UC-11
    async def list_users(self) -> list[User]:
        return await self._users.find_all()

    async def create_account(
        self, email: str, password: str, role: Role, full_name: str, actor_id: str
    ) -> User:
        user = await self._auth.create_user(email, password, role, full_name)
        await self._audit.record(actor_id, "user.create", AuditResource("user", user.id))
        return user

    async def update_account(self, user_id: str, fields: dict[str, Any], actor_id: str) -> User:
        if user_id == actor_id and ("role" in fields or fields.get("is_active") is False):
            raise ForbiddenError("self_change", "Không thể đổi vai trò hoặc khoá chính mình")
        if "role" in fields:
            fields["role"] = Role(fields["role"]).value
        user = await self._users.update_fields(user_id, fields, self._clock())
        if user is None:
            raise NotFoundError("user_not_found", "Không tìm thấy tài khoản")
        if "role" in fields or fields.get("is_active") is False:
            await self._auth.revoke_sessions(user_id)
        locked = fields.get("is_active") is False
        action = "user.lock" if locked else "user.update"
        await self._audit.record(actor_id, action, AuditResource("user", user_id))
        return user

    # --- UC-13
    async def issue_tickets(
        self,
        batch: str,
        tour_ids: list[str],
        valid_until: datetime,
        transfers_left: int,
        count: int,
        actor_id: str,
    ) -> list[str]:
        if valid_until <= self._clock():
            raise InvalidContentError("valid_until_past", "Hạn dùng đã qua")
        if not tour_ids or len(set(tour_ids)) != len(tour_ids):
            raise InvalidContentError("tours_invalid", "Danh sách tour không hợp lệ")
        for tour_id in tour_ids:
            await self.get_tour(tour_id)
        codes = ["".join(secrets.choice(_ALPHABET) for _ in range(_CODE_LEN)) for _ in range(count)]
        await self._tickets.create_batch(
            [(hash_code(c), c[-4:]) for c in codes],
            batch,
            tour_ids,
            valid_until,
            transfers_left,
            actor_id,
            self._clock(),
        )
        await self._audit.record(
            actor_id, "ticket.issue", AuditResource("ticket_batch", batch), f"{count} vé"
        )
        return codes

    async def search_tickets(self, q: str | None) -> list[dict[str, Any]]:
        return await self._tickets.search(q)

    async def revoke_tickets(self, ticket_id: str | None, batch: str | None, actor_id: str) -> int:
        if bool(ticket_id) == bool(batch):
            raise InvalidContentError("revoke_target", "Chọn một vé hoặc một lô")
        count = await self._tickets.revoke(ticket_id, batch, self._clock())
        target = (
            AuditResource("ticket", ticket_id)
            if ticket_id
            else AuditResource("ticket_batch", batch or "")
        )
        await self._audit.record(actor_id, "ticket.revoke", target, f"{count} vé")
        return count

    # --- UC-16
    async def activate_ticket(self, code: str, device_id: str) -> dict[str, Any]:
        result = await self._tickets.activate(hash_code(code), device_id, self._clock())
        if result["result"] == "invalid":
            raise InvalidContentError("ticket_invalid", "Vé không hợp lệ, đã thu hồi hoặc hết hạn")
        if result["result"] == "no_transfers":
            raise ConflictError(
                "ticket_no_transfers", "Vé đã hết lượt chuyển máy, hãy liên hệ quầy"
            )
        return result

    # --- UC-15, UC-17
    async def public_tours(self) -> list[dict[str, Any]]:
        out = []
        for tour in await self._tours.find("published"):
            langs = await self._tours.published_langs(tour["id"])
            if langs:
                out.append({**tour, "langs": langs})
        return out

    async def public_manifest(
        self, tour_id: str, lang: str, device_id: str, preview: bool
    ) -> dict[str, Any]:
        pack, tour = await self._published(tour_id, lang)
        manifest = self._pipeline.read_manifest(pack)
        allowed = tour["access"] == "free" or await self._tickets.device_has_access(
            device_id, tour_id, self._clock()
        )
        if not allowed and not preview:
            raise ForbiddenError("ticket_required", "Tour này cần vé để tải")
        files = manifest["files"]
        if not allowed:
            files = [f for f in files if f["is_preview"]]
        for f in files:
            f.pop("storage_key", None)
        return {**manifest, "files": files, "access": "full" if allowed else "preview"}

    async def public_file(
        self,
        tour_id: str,
        lang: str,
        poi_id: str,
        device_id: str,
        pack_id: str | None = None,
    ) -> str:
        pack, tour = await self._published(tour_id, lang, pack_id)
        manifest = self._pipeline.read_manifest(pack)
        item = next((f for f in manifest["files"] if f["poi_id"] == poi_id), None)
        if item is None:
            raise NotFoundError("file_not_found", "Không có file này trong pack")
        allowed = (
            tour["access"] == "free"
            or item["is_preview"]
            or await self._tickets.device_has_access(device_id, tour_id, self._clock())
        )
        if not allowed:
            raise ForbiddenError("ticket_required", "Tour này cần vé để tải")
        return self._pipeline.file_path(item["storage_key"])

    async def _published(
        self, tour_id: str, lang: str, pack_id: str | None = None
    ) -> tuple[dict[str, Any], dict[str, Any]]:
        tour = await self.get_tour(tour_id)
        packs = await self._pipeline.list_packs(tour_id, lang)
        pack = next(
            (p for p in packs if p["status"] in {"published", "superseded"} and p["id"] == pack_id)
            if pack_id is not None
            else (p for p in packs if p["status"] == "published"),
            None,
        )
        if pack is None or tour["status"] != "published":
            raise NotFoundError("pack_not_published", "Tour chưa có pack ở ngôn ngữ này")
        return pack, tour

    # --- UC-18, UC-14
    async def record_events(self, device_id: str, events: list[dict[str, Any]]) -> int:
        return await self._analytics.insert_events(device_id, events)

    async def analytics(
        self, start: datetime | None, end: datetime | None, tour_id: str | None, lang: str | None
    ) -> dict[str, Any]:
        finish = end or self._clock()
        begin = start or finish - timedelta(days=30)
        return await self._analytics.summary(begin, finish, tour_id, lang)
