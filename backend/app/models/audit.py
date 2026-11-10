from dataclasses import dataclass
from datetime import datetime


@dataclass(frozen=True)
class AuditResource:
    """Đối tượng bị tác động, vd. `AuditResource("poi", "66f1c0a2...")`."""

    type: str
    id: str


@dataclass(frozen=True)
class AuditLog:
    """Nhật ký gọn: ai làm gì với đối tượng nào; không lưu bản trước/sau (CSDL v1)."""

    id: str
    actor_id: str
    action: str
    resource: AuditResource
    ts: datetime
    note: str | None = None


@dataclass(frozen=True)
class AuditFilters:
    action: str | None = None
    resource_type: str | None = None
    resource_id: str | None = None
    since: datetime | None = None
    until: datetime | None = None
    q: str | None = None
    before_id: str | None = None
