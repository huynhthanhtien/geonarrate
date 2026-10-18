from datetime import datetime
from typing import Any, Protocol

from bson import ObjectId
from bson.errors import InvalidId
from pymongo.asynchronous.database import AsyncDatabase

from app.models.user import Role, User


class UserRepository(Protocol):
    async def get_by_email(self, email: str) -> User | None: ...
    async def get_by_id(self, user_id: str) -> User | None: ...
    async def insert(
        self, email: str, password_hash: str, role: Role, full_name: str, now: datetime
    ) -> User: ...
    async def mark_login(self, user_id: str, now: datetime, password_hash: str | None) -> None: ...


class MongoUserRepository:
    def __init__(self, db: AsyncDatabase[dict[str, Any]]) -> None:
        self._col = db.users

    async def get_by_email(self, email: str) -> User | None:
        doc = await self._col.find_one({"email": email})
        return _to_entity(doc) if doc else None

    async def get_by_id(self, user_id: str) -> User | None:
        oid = _oid(user_id)
        doc = await self._col.find_one({"_id": oid}) if oid else None
        return _to_entity(doc) if doc else None

    async def insert(
        self, email: str, password_hash: str, role: Role, full_name: str, now: datetime
    ) -> User:
        doc: dict[str, Any] = {
            "email": email,
            "password_hash": password_hash,
            "full_name": full_name,
            "role": role.value,
            "is_active": True,
            "last_login_at": None,
            "created_at": now,
            "updated_at": now,
            "schema_version": 1,
        }
        result = await self._col.insert_one(doc)
        return _to_entity({**doc, "_id": result.inserted_id})

    async def mark_login(self, user_id: str, now: datetime, password_hash: str | None) -> None:
        """Ghi `last_login_at`; kèm hash mới nếu tham số argon2 đã đổi."""
        update: dict[str, Any] = {"last_login_at": now}
        if password_hash:
            update |= {"password_hash": password_hash, "updated_at": now}
        await self._col.update_one({"_id": _oid(user_id)}, {"$set": update})


def _oid(value: str) -> ObjectId | None:
    try:
        return ObjectId(value)
    except InvalidId:
        return None


def _to_entity(doc: dict[str, Any]) -> User:
    return User(
        id=str(doc["_id"]),
        email=doc["email"],
        password_hash=doc["password_hash"],
        role=Role(doc["role"]),
        full_name=doc.get("full_name", ""),
        is_active=doc.get("is_active", True),
        last_login_at=doc.get("last_login_at"),
    )
