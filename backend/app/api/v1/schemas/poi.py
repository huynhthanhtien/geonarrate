from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

SCRIPT_MAX_CHARS = 1000

Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
ScriptBody = Annotated[str, StringConstraints(max_length=SCRIPT_MAX_CHARS)]
ReviewNote = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=1000)]


Summary = Annotated[str, StringConstraints(strip_whitespace=True, max_length=2000)]
ImageUrl = Annotated[str, StringConstraints(pattern=r"^https?://\S+$", max_length=2000)]
Images = Annotated[list[ImageUrl], Field(max_length=20)]
Category = Literal["temple", "church", "museum", "park", "other"]


class PoiCreateIn(BaseModel):
    name: Name
    category: Category
    priority: int = Field(default=1, ge=0, le=1000)
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)
    radius: int = Field(ge=10, le=200, description="Bán kính kích hoạt (mét)")
    script: ScriptBody = ""
    summary: Summary | None = None
    images: Images = []


class PoiUpdateIn(BaseModel):
    """Chỉ gửi trường cần đổi. `lat` và `lng` phải đi cùng nhau."""

    name: Name | None = None
    category: Category | None = None
    priority: int | None = Field(default=None, ge=0, le=1000)
    lat: float | None = Field(default=None, ge=-90, le=90)
    lng: float | None = Field(default=None, ge=-180, le=180)
    radius: int | None = Field(default=None, ge=10, le=200)
    summary: Summary | None = None
    images: Images | None = None

    @model_validator(mode="after")
    def _check(self) -> "PoiUpdateIn":
        if (self.lat is None) != (self.lng is None):
            raise ValueError("lat và lng phải đi cùng nhau")
        required = {"name", "category", "priority", "lat", "lng", "radius", "images"}
        nulled = required & {k for k in self.model_fields_set if getattr(self, k) is None}
        if nulled:
            raise ValueError(f"Không được để trống: {', '.join(sorted(nulled))}")
        return self


class ScriptIn(BaseModel):
    script: ScriptBody


class ImageOut(BaseModel):
    url: str


class RejectIn(BaseModel):
    review_note: ReviewNote


class AffectedTour(BaseModel):
    id: str
    name: str


class PoiOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    summary: str | None
    images: list[str]
    lat: float
    lng: float
    radius: int
    category: str
    priority: int
    script: str
    script_status: Literal["draft", "in_review", "approved"]
    script_version: int
    review_note: str | None
    status: Literal["active", "locked"]
    created_by: str | None
    updated_by: str | None
    created_at: datetime
    updated_at: datetime


class PoiLockOut(PoiOut):
    affected_tours: list[AffectedTour]
