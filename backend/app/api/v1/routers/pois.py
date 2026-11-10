from typing import Annotated

from fastapi import APIRouter, Depends, status

from app.api.v1.schemas.poi import (
    PoiCreateIn,
    PoiOut,
    PoiUpdateIn,
    RejectIn,
    ScriptIn,
)
from app.core.deps import get_poi_service, require_permission
from app.core.permissions import Permission
from app.core.security import Principal
from app.services.poi_service import PoiService

router = APIRouter(prefix="/pois", tags=["catalog"])

Svc = Annotated[PoiService, Depends(get_poi_service)]
Reader = Annotated[Principal, Depends(require_permission(Permission.POI_READ))]
Writer = Annotated[Principal, Depends(require_permission(Permission.SCRIPT_WRITE))]
# Chưa có quyền riêng cho duyệt script; theo use case người duyệt là admin
Reviewer = Annotated[Principal, Depends(require_permission(Permission.ADMIN_MANAGE))]


@router.get("", response_model=list[PoiOut])
async def list_pois(
    svc: Svc, _: Reader, category: str | None = None, status: str | None = None
) -> list[PoiOut]:
    """Lọc theo danh mục và trạng thái script (`draft`, `in_review`, `approved`)."""
    items = await svc.find_all(category, status)
    return [PoiOut.model_validate(item) for item in items]


@router.post("", response_model=PoiOut, status_code=status.HTTP_201_CREATED)
async def create_poi(body: PoiCreateIn, svc: Svc, user: Writer) -> PoiOut:
    created = await svc.create(**body.model_dump(), actor_id=user.user_id)
    return PoiOut.model_validate(created)


@router.get("/{poi_id}", response_model=PoiOut)
async def get_poi(poi_id: str, svc: Svc, _: Reader) -> PoiOut:
    return PoiOut.model_validate(await svc.get(poi_id))


@router.patch("/{poi_id}", response_model=PoiOut)
async def update_poi(poi_id: str, body: PoiUpdateIn, svc: Svc, user: Writer) -> PoiOut:
    updated = await svc.update(poi_id, body.model_dump(exclude_unset=True), user.user_id)
    return PoiOut.model_validate(updated)


@router.put("/{poi_id}/script", response_model=PoiOut)
async def save_script(poi_id: str, body: ScriptIn, svc: Svc, user: Writer) -> PoiOut:
    return PoiOut.model_validate(await svc.save_script(poi_id, body.script, user.user_id))


@router.post("/{poi_id}/submit", response_model=PoiOut)
async def submit_script(poi_id: str, svc: Svc, user: Writer) -> PoiOut:
    return PoiOut.model_validate(await svc.submit(poi_id, user.user_id))


@router.post("/{poi_id}/approve", response_model=PoiOut)
async def approve_script(poi_id: str, svc: Svc, user: Reviewer) -> PoiOut:
    return PoiOut.model_validate(await svc.approve(poi_id, user.user_id))


@router.post("/{poi_id}/reject", response_model=PoiOut)
async def reject_script(poi_id: str, body: RejectIn, svc: Svc, user: Reviewer) -> PoiOut:
    return PoiOut.model_validate(await svc.reject(poi_id, body.review_note, user.user_id))
