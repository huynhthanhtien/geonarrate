from typing import Annotated

from fastapi import APIRouter, Depends, status

from app.api.v1.schemas.attraction import (
    AttractionCreateIn,
    AttractionOut,
    AttractionUpdateIn,
    RejectIn,
    ScriptIn,
)
from app.core.deps import get_attraction_service, require_permission
from app.core.permissions import Permission
from app.core.security import Principal
from app.services.attraction_service import AttractionService

router = APIRouter(prefix="/attractions", tags=["catalog"])

Svc = Annotated[AttractionService, Depends(get_attraction_service)]
Reader = Annotated[Principal, Depends(require_permission(Permission.ATTRACTION_READ))]
Writer = Annotated[Principal, Depends(require_permission(Permission.SCRIPT_WRITE))]
# Chưa có quyền riêng cho duyệt script; theo use case người duyệt là admin
Reviewer = Annotated[Principal, Depends(require_permission(Permission.ADMIN_MANAGE))]


@router.get("", response_model=list[AttractionOut])
async def list_attractions(
    svc: Svc, _: Reader, category: str | None = None, status: str | None = None
) -> list[AttractionOut]:
    """Lọc theo danh mục và trạng thái script (`draft`, `in_review`, `approved`)."""
    items = await svc.find_all(category, status)
    return [AttractionOut.model_validate(item) for item in items]


@router.post("", response_model=AttractionOut, status_code=status.HTTP_201_CREATED)
async def create_attraction(body: AttractionCreateIn, svc: Svc, user: Writer) -> AttractionOut:
    created = await svc.create(**body.model_dump(), actor_id=user.user_id)
    return AttractionOut.model_validate(created)


@router.get("/{attraction_id}", response_model=AttractionOut)
async def get_attraction(attraction_id: str, svc: Svc, _: Reader) -> AttractionOut:
    return AttractionOut.model_validate(await svc.get(attraction_id))


@router.patch("/{attraction_id}", response_model=AttractionOut)
async def update_attraction(
    attraction_id: str, body: AttractionUpdateIn, svc: Svc, user: Writer
) -> AttractionOut:
    updated = await svc.update(attraction_id, body.model_dump(exclude_unset=True), user.user_id)
    return AttractionOut.model_validate(updated)


@router.put("/{attraction_id}/script", response_model=AttractionOut)
async def save_script(attraction_id: str, body: ScriptIn, svc: Svc, user: Writer) -> AttractionOut:
    return AttractionOut.model_validate(
        await svc.save_script(attraction_id, body.script, user.user_id)
    )


@router.post("/{attraction_id}/submit", response_model=AttractionOut)
async def submit_script(attraction_id: str, svc: Svc, user: Writer) -> AttractionOut:
    return AttractionOut.model_validate(await svc.submit(attraction_id, user.user_id))


@router.post("/{attraction_id}/approve", response_model=AttractionOut)
async def approve_script(attraction_id: str, svc: Svc, user: Reviewer) -> AttractionOut:
    return AttractionOut.model_validate(await svc.approve(attraction_id, user.user_id))


@router.post("/{attraction_id}/reject", response_model=AttractionOut)
async def reject_script(
    attraction_id: str, body: RejectIn, svc: Svc, user: Reviewer
) -> AttractionOut:
    return AttractionOut.model_validate(
        await svc.reject(attraction_id, body.review_note, user.user_id)
    )
