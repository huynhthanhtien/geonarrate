from datetime import datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from pydantic import AwareDatetime

from app.api.v1.schemas.audit import AuditLogOut, AuditResourceOut
from app.core.deps import get_audit_service, require_permission
from app.core.permissions import Permission
from app.models.audit import AuditFilters
from app.services.audit_service import AuditService

router = APIRouter(
    prefix="/audit",
    tags=["identity"],
    dependencies=[Depends(require_permission(Permission.AUDIT_READ))],
)


@router.get("", response_model=list[AuditLogOut])
async def list_audit_logs(
    svc: Annotated[AuditService, Depends(get_audit_service)],
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    actor_id: str | None = None,
    resource_type: str | None = None,
    resource_id: str | None = None,
    before: Annotated[datetime | None, Query(description="ts của bản ghi cuối trang trước")] = None,
    before_id: UUID | None = None,
    action: Annotated[str | None, Query(max_length=100)] = None,
    since: AwareDatetime | None = None,
    until: AwareDatetime | None = None,
    q: Annotated[str | None, Query(max_length=200)] = None,
) -> list[AuditLogOut]:
    """Lọc theo người, hành động, loại đối tượng, từ khoá và thời gian [since, until)."""
    filters = AuditFilters(
        action=action,
        resource_type=resource_type,
        resource_id=resource_id,
        since=since,
        until=until,
        q=q.strip() if q else None,
        before_id=str(before_id) if before_id else None,
    )
    logs = await svc.find(limit, actor_id=actor_id, before=before, filters=filters)
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
