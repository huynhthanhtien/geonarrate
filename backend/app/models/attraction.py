from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum


class ScriptStatus(StrEnum):
    """draft → in_review → approved.

    Trả lại: in_review → draft kèm ghi chú. Sửa script đã duyệt: approved → draft, tăng version.
    """

    DRAFT = "draft"
    IN_REVIEW = "in_review"
    APPROVED = "approved"


@dataclass(frozen=True)
class Attraction:
    """Domain entity — không phụ thuộc CSDL hay HTTP."""

    id: str
    name: str
    slug: str
    summary: str | None
    images: list[str]
    lat: float
    lng: float
    radius: int
    category: str
    priority: int
    script: str
    script_status: ScriptStatus
    script_version: int
    review_note: str | None
    created_by: str | None
    updated_by: str | None
    created_at: datetime
    updated_at: datetime
