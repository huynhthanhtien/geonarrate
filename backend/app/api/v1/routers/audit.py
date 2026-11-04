from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.api.v1.schemas.audit import AuditLogOut, AuditResourceOut
from app.core.deps import get_audit_service, require_permission
from app.core.permissions import Permission
from app.models.audit import AuditResource
from app.services.audit_service import AuditService

router = APIRouter(
    prefix="/audit",
    tags=["identity"],
    dependencies=[Depends(require_permission(Permission.ADMIN_MANAGE))],
)


@router.get("", response_model=list[AuditLogOut])
async def list_audit_logs(
    svc: Annotated[AuditService, Depends(get_audit_service)],
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    actor_id: str | None = None,
    resource_type: str | None = None,
    resource_id: str | None = None,
    before: Annotated[datetime | None, Query(description="ts của bản ghi cuối trang trước")] = None,
) -> list[AuditLogOut]:
    """Nhật ký thao tác, mới nhất trước. Lọc tài nguyên cần đủ `resource_type` + `resource_id`."""
    resource = AuditResource(resource_type, resource_id) if resource_type and resource_id else None
    logs = await svc.find(limit, actor_id=actor_id, resource=resource, before=before)
    return [
        AuditLogOut(
            id=log.id,
            actor_id=log.actor_id,
            action=log.action,
            resource=AuditResourceOut(type=log.resource.type, id=log.resource.id),
            note=log.note,
            ts=log.ts,
        )
        for log in logs
    ]
