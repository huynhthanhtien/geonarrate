from typing import Any, Protocol

from pymongo.asynchronous.database import AsyncDatabase

from app.models.language import Language


class LanguageRepository(Protocol):
    async def list_active(self) -> list[Language]: ...
    async def upsert(self, lang: Language) -> None: ...


class MongoLanguageRepository:
    def __init__(self, db: AsyncDatabase[dict[str, Any]]) -> None:
        self._col = db.languages

    async def list_active(self) -> list[Language]:
        cursor = self._col.find({"is_active": True}, {"_id": 0}).sort("code", 1)
        return [_to_entity(doc) async for doc in cursor]

    async def upsert(self, lang: Language) -> None:
        await self._col.update_one(
            {"code": lang.code},
            {"$set": {**lang.__dict__, "schema_version": 1}},
            upsert=True,
        )


def _to_entity(doc: dict[str, Any]) -> Language:
    return Language(
        code=doc["code"],
        bcp47=doc["bcp47"],
        native_name=doc["native_name"],
        is_source=doc.get("is_source", False),
        is_active=doc.get("is_active", True),
    )
