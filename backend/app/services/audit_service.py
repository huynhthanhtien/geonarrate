from collections.abc import Callable
from datetime import UTC, datetime

from app.core.exceptions import InvalidContentError
from app.models.audit import AuditFilters, AuditLog, AuditResource
from app.repositories.audit_repo import AuditLogRepository


def _utcnow() -> datetime:
    return datetime.now(UTC)


class AuditService:
    """Ghi nhật ký thao tác dùng chung — service khác nhận qua constructor và gọi `record`."""

    def __init__(self, logs: AuditLogRepository, clock: Callable[[], datetime] = _utcnow) -> None:
        self._logs = logs
        self._clock = clock

    async def record(
        self, actor_id: str, action: str, resource: AuditResource, note: str | None = None
    ) -> AuditLog:
        """`action` dạng `<tài nguyên>.<động từ>`, vd. `script.approve`, `pack.publish`."""
        return await self._logs.insert(actor_id, action, resource, note, self._clock())

    async def find(
        self,
        limit: int = 50,
        actor_id: str | None = None,
        resource: AuditResource | None = None,
        before: datetime | None = None,
        filters: AuditFilters | None = None,
    ) -> list[AuditLog]:
        if filters:
            if filters.since and filters.until and filters.since >= filters.until:
                raise InvalidContentError(
                    "invalid_date_range", "Ngày bắt đầu phải trước ngày kết thúc"
                )
            if filters.before_id and before is None:
                raise InvalidContentError("invalid_cursor", "Thiếu thời điểm của trang trước")
        return await self._logs.find(
            limit, actor_id=actor_id, resource=resource, before=before, filters=filters
        )
