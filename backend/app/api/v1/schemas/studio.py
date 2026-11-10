from datetime import datetime
from typing import Annotated, Any, Literal

from pydantic import BaseModel, Field, StringConstraints

Text1 = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=500)]
Device = Annotated[str, StringConstraints(min_length=8, max_length=128)]


class TranslationJobOut(BaseModel):
    poi_id: str
    title: str
    lang: str
    status: Literal["queued", "running", "failed"]
    attempts: int
    error: str | None
    updated_at: datetime


class TranslationOut(BaseModel):
    id: str
    poi_id: str
    title: str
    target_lang: str
    version: int
    source_text: str
    text: str
    provider: str | None
    qa_flags: list[str]
    comet_qe: float | None = None
    review_status: Literal["pending", "approved", "rejected"]
    review_note: str | None
    updated_at: datetime


class TranslationEditIn(BaseModel):
    text: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=5000)]


class NoteIn(BaseModel):
    review_note: Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=1, max_length=1000)
    ]


class GlossaryIn(BaseModel):
    term: Text1
    target_lang: str
    translation: Text1
    is_required: bool = False
    poi_id: str | None = None


class GlossaryOut(BaseModel):
    id: str
    term: str
    target_lang: str
    translation: str
    is_required: bool
    poi_id: str | None


class AudioCell(BaseModel):
    state: Literal["none", "queued", "running", "ready", "failed", "stale"]
    error: str | None
    duration_ms: int | None


class AudioRow(BaseModel):
    id: str
    name: str
    langs: dict[str, AudioCell]


class AudioRetryIn(BaseModel):
    poi_id: str
    lang: str


class TourPoint(BaseModel):
    id: str
    is_preview: bool = False


class TourCreateIn(BaseModel):
    name: Text1
    access: Literal["free", "paid"] = "free"
    status: Literal["draft", "published"] = "draft"
    pois: list[TourPoint] = Field(min_length=1, max_length=500)


class TourUpdateIn(BaseModel):
    name: Text1 | None = None
    access: Literal["free", "paid"] | None = None
    status: Literal["draft", "published"] | None = None
    pois: list[TourPoint] | None = Field(default=None, max_length=500)


class TourOut(BaseModel):
    id: str
    name: str
    access: str
    status: str
    bbox: list[float] | None
    poi_count: int


class TourPointOut(BaseModel):
    id: str
    name: str
    position: int
    is_preview: bool
    lat: float
    lng: float
    radius: int


class TourDetailOut(TourOut):
    pois: list[TourPointOut]


class PackBuildIn(BaseModel):
    tour_id: str
    lang: str


class RollbackIn(BaseModel):
    reason: Text1


class PackOut(BaseModel):
    id: str
    tour_id: str
    lang: str
    version: int
    status: str
    sha256: str | None
    total_bytes: int | None
    file_count: int | None
    published_at: datetime | None
    created_at: datetime


class AccountCreateIn(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=8, max_length=256)
    role: Literal["admin", "editor", "translator"]
    full_name: Annotated[str, StringConstraints(strip_whitespace=True, max_length=200)] = ""


class AccountUpdateIn(BaseModel):
    role: Literal["admin", "editor", "translator"] | None = None
    is_active: bool | None = None
    full_name: Annotated[str, StringConstraints(strip_whitespace=True, max_length=200)] | None = (
        None
    )


class AccountOut(BaseModel):
    id: str
    email: str
    full_name: str
    role: str
    is_active: bool
    last_login_at: datetime | None


class TicketIssueIn(BaseModel):
    batch: Text1
    tour_ids: list[str] = Field(min_length=1, max_length=50)
    valid_until: datetime
    transfers_left: int = Field(default=1, ge=0, le=10)
    count: int = Field(ge=1, le=1000)


class TicketIssueOut(BaseModel):
    batch: str
    codes: list[str]


class TicketOut(BaseModel):
    id: str
    code_hint: str
    batch: str
    valid_until: datetime
    device_id: str | None
    activated_at: datetime | None
    transfers_left: int
    status: str
    tour_ids: list[str]


class RevokeIn(BaseModel):
    ticket_id: str | None = None
    batch: str | None = None


class RevokeOut(BaseModel):
    revoked: int


class AnalyticsTop(BaseModel):
    id: str
    name: str
    plays: int


class AnalyticsLang(BaseModel):
    lang: str
    plays: int


class AnalyticsOut(BaseModel):
    plays: int
    completes: int
    completion_rate: float | None
    top_pois: list[AnalyticsTop]
    by_lang: list[AnalyticsLang]


class PublicTourOut(BaseModel):
    id: str
    name: str
    access: str
    bbox: list[float] | None
    poi_count: int
    langs: list[str]


class ActivateIn(BaseModel):
    code: Annotated[str, StringConstraints(strip_whitespace=True, min_length=4, max_length=64)]
    device_id: Device


class ActivateOut(BaseModel):
    result: str
    tour_ids: list[str]
    valid_until: datetime


class ManifestFile(BaseModel):
    poi_id: str
    name: str
    summary: str | None
    lat: float
    lng: float
    radius: int
    priority: int
    is_preview: bool
    sha256: str
    bytes: int
    duration_ms: int


class ManifestOut(BaseModel):
    pack_id: str
    tour_id: str
    lang: str
    version: int
    access: Literal["full", "preview"]
    files: list[ManifestFile]


class EventIn(BaseModel):
    event_id: Annotated[str, StringConstraints(min_length=1, max_length=64)]
    poi_id: str
    lang: str
    event: Literal["play", "complete", "skip"]
    position_ms: int | None = Field(default=None, ge=0)
    trigger: Literal["geofence", "manual"] | None = None
    ts: datetime


class EventsIn(BaseModel):
    device_id: Device
    events: list[EventIn] = Field(max_length=500)


class EventsOut(BaseModel):
    accepted: int


JsonDict = dict[str, Any]
