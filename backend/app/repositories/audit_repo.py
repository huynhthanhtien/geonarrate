from datetime import datetime
from typing import Any, Protocol

from bson import ObjectId
from pymongo.asynchronous.database import AsyncDatabase

from app.models.audit import AuditLog, AuditResource


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
    ) -> list[AuditLog]: ...


class MongoAuditLogRepository:
    def __init__(self, db: AsyncDatabase[dict[str, Any]]) -> None:
        self._col = db.audit_logs

    async def insert(
        self,
        actor_id: str,
        action: str,
        resource: AuditResource,
        note: str | None,
        ts: datetime,
    ) -> AuditLog:
        doc: dict[str, Any] = {
            "actor_id": ObjectId(actor_id),
            "action": action,
            # resource.id giữ dạng chuỗi để mọi loại tài nguyên lọc theo cùng một kiểu
            "resource": {"type": resource.type, "id": resource.id},
            "note": note,
            "ts": ts,
            "schema_version": 1,
        }
        result = await self._col.insert_one(doc)
        return _to_entity({**doc, "_id": result.inserted_id})

    async def find(
        self,
        limit: int,
        actor_id: str | None = None,
        resource: AuditResource | None = None,
        before: datetime | None = None,
    ) -> list[AuditLog]:
        """Mới nhất trước; `before` là `ts` của bản ghi cuối trang trước."""
        query: dict[str, Any] = {}
        if actor_id is not None:
            if not ObjectId.is_valid(actor_id):
                return []
            query["actor_id"] = ObjectId(actor_id)
        if resource is not None:
            query |= {"resource.type": resource.type, "resource.id": resource.id}
        if before is not None:
            query["ts"] = {"$lt": before}
        cursor = self._col.find(query).sort("ts", -1).limit(limit)
        return [_to_entity(doc) async for doc in cursor]


def _to_entity(doc: dict[str, Any]) -> AuditLog:
    return AuditLog(
        id=str(doc["_id"]),
        actor_id=str(doc["actor_id"]),
        action=doc["action"],
        resource=AuditResource(type=doc["resource"]["type"], id=doc["resource"]["id"]),
        ts=doc["ts"],
        note=doc.get("note"),
    )
