from collections.abc import Callable
from datetime import UTC, datetime

from app.models.audit import AuditLog, AuditResource
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
    ) -> list[AuditLog]:
        return await self._logs.find(limit, actor_id=actor_id, resource=resource, before=before)
