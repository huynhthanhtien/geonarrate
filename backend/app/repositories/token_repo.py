from datetime import datetime
from typing import Any, Protocol

from bson import ObjectId
from pymongo import ReturnDocument
from pymongo.asynchronous.database import AsyncDatabase

from app.models.user import RefreshToken


class RefreshTokenRepository(Protocol):
    async def insert(
        self, user_id: str, token_hash: str, family_id: str, expires_at: datetime, now: datetime
    ) -> RefreshToken: ...
    async def get_by_hash(self, token_hash: str) -> RefreshToken | None: ...
    async def revoke_if_active(self, token_hash: str, now: datetime) -> RefreshToken | None: ...
    async def revoke_family(self, family_id: str, now: datetime) -> None: ...
    async def revoke_all_for_user(self, user_id: str, now: datetime) -> None: ...


class MongoRefreshTokenRepository:
    def __init__(self, db: AsyncDatabase[dict[str, Any]]) -> None:
        self._col = db.refresh_tokens

    async def insert(
        self, user_id: str, token_hash: str, family_id: str, expires_at: datetime, now: datetime
    ) -> RefreshToken:
        doc: dict[str, Any] = {
            "user_id": ObjectId(user_id),
            "token_hash": token_hash,
            "family_id": family_id,
            "expires_at": expires_at,
            "revoked_at": None,
            "created_at": now,
            "schema_version": 1,
        }
        result = await self._col.insert_one(doc)
        return _to_entity({**doc, "_id": result.inserted_id})

    async def get_by_hash(self, token_hash: str) -> RefreshToken | None:
        doc = await self._col.find_one({"token_hash": token_hash})
        return _to_entity(doc) if doc else None

    async def revoke_if_active(self, token_hash: str, now: datetime) -> RefreshToken | None:
        """Thu hồi nguyên tử: hai request refresh cùng token thì chỉ một request thắng."""
        doc = await self._col.find_one_and_update(
            {"token_hash": token_hash, "revoked_at": None},
            {"$set": {"revoked_at": now}},
            return_document=ReturnDocument.AFTER,
        )
        return _to_entity(doc) if doc else None

    async def revoke_family(self, family_id: str, now: datetime) -> None:
        await self._col.update_many(
            {"family_id": family_id, "revoked_at": None}, {"$set": {"revoked_at": now}}
        )

    async def revoke_all_for_user(self, user_id: str, now: datetime) -> None:
        await self._col.update_many(
            {"user_id": ObjectId(user_id), "revoked_at": None}, {"$set": {"revoked_at": now}}
        )


def _to_entity(doc: dict[str, Any]) -> RefreshToken:
    return RefreshToken(
        id=str(doc["_id"]),
        user_id=str(doc["user_id"]),
        token_hash=doc["token_hash"],
        family_id=doc["family_id"],
        expires_at=doc["expires_at"],
        revoked_at=doc.get("revoked_at"),
    )
