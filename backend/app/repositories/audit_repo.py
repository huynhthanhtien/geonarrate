from datetime import datetime
from typing import Protocol

from sqlalchemy import and_, insert, or_, select
from sqlalchemy.engine import RowMapping
from sqlalchemy.ext.asyncio import AsyncEngine

from app.core.schema import audit_logs, users
from app.core.transaction import connection
from app.models.audit import AuditFilters, AuditLog, AuditResource
from app.repositories._ids import parse_uuid


class AuditLogRepository(Protocol):
    async def insert(
        self,
        actor_id: str,
        action: str,
        resource: AuditResource,
        note: str | None,
        ts: datetime,
    ) -> AuditLog: ...
    async def find(
        self,
        limit: int,
        actor_id: str | None = None,
        resource: AuditResource | None = None,
        before: datetime | None = None,
        filters: AuditFilters | None = None,
    ) -> list[AuditLog]: ...


class SqlAuditLogRepository:
    def __init__(self, engine: AsyncEngine) -> None:
        self._engine = engine

    async def insert(
        self,
        actor_id: str,
        action: str,
        resource: AuditResource,
        note: str | None,
        ts: datetime,
    ) -> AuditLog:
        stmt = (
            insert(audit_logs)
            .values(
                actor_id=parse_uuid(actor_id),
                action=action,
                # resource_id giữ dạng chuỗi để mọi loại tài nguyên lọc theo cùng một kiểu
                resource_type=resource.type,
                resource_id=resource.id,
                note=note,
                ts=ts,
            )
            .returning(audit_logs)
        )
        async with connection(self._engine, write=True) as conn:
            row = (await conn.execute(stmt)).mappings().one()
        return _to_entity(row)

    async def find(
        self,
        limit: int,
        actor_id: str | None = None,
        resource: AuditResource | None = None,
        before: datetime | None = None,
        filters: AuditFilters | None = None,
    ) -> list[AuditLog]:
        """Mới nhất trước; `before` là `ts` của bản ghi cuối trang trước."""
        stmt = (
            select(audit_logs).order_by(audit_logs.c.ts.desc(), audit_logs.c.id.desc()).limit(limit)
        )
        if actor_id is not None:
            uid = parse_uuid(actor_id)
            if uid is None:
                return []
            stmt = stmt.where(audit_logs.c.actor_id == uid)
        if resource is not None:
            stmt = stmt.where(
                audit_logs.c.resource_type == resource.type,
                audit_logs.c.resource_id == resource.id,
            )
        f = filters or AuditFilters()
        if f.action:
            stmt = stmt.where(audit_logs.c.action == f.action)
        if f.resource_type:
            stmt = stmt.where(audit_logs.c.resource_type == f.resource_type)
        if f.resource_id:
            stmt = stmt.where(audit_logs.c.resource_id == f.resource_id)
        if f.since is not None:
            stmt = stmt.where(audit_logs.c.ts >= f.since)
        if f.until is not None:
            stmt = stmt.where(audit_logs.c.ts < f.until)
        if f.q:
            stmt = stmt.outerjoin(users, users.c.id == audit_logs.c.actor_id).where(
                or_(
                    users.c.full_name.icontains(f.q, autoescape=True),
                    users.c.email.icontains(f.q, autoescape=True),
                    audit_logs.c.note.icontains(f.q, autoescape=True),
                    audit_logs.c.resource_id.icontains(f.q, autoescape=True),
                    audit_logs.c.action.icontains(f.q, autoescape=True),
                )
            )
        if before is not None:
            condition = audit_logs.c.ts < before
            if f.before_id:
                condition = or_(
                    condition,
                    and_(audit_logs.c.ts == before, audit_logs.c.id < parse_uuid(f.before_id)),
                )
            stmt = stmt.where(condition)
        async with connection(self._engine) as conn:
            rows = (await conn.execute(stmt)).mappings().all()
        return [_to_entity(row) for row in rows]


def _to_entity(row: RowMapping) -> AuditLog:
    return AuditLog(
        id=str(row["id"]),
        actor_id=str(row["actor_id"]),
        action=row["action"],
        resource=AuditResource(type=row["resource_type"], id=row["resource_id"]),
        ts=row["ts"],
        note=row["note"],
    )
