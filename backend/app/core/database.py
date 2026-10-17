from typing import Any

from pymongo import AsyncMongoClient
from pymongo.asynchronous.database import AsyncDatabase

from app.core.config import get_settings

_client: AsyncMongoClient[dict[str, Any]] | None = None


async def connect() -> None:
    global _client
    _client = AsyncMongoClient(get_settings().mongo_uri, tz_aware=True)


async def disconnect() -> None:
    if _client is not None:
        await _client.close()


def get_db() -> AsyncDatabase[dict[str, Any]]:
    if _client is None:
        raise RuntimeError("Mongo chưa kết nối")
    return _client[get_settings().mongo_db]


async def ensure_indexes() -> None:
    """Index bootstrap theo access pattern (chương 02 §2.3) — idempotent."""
    db = get_db()
    await db.languages.create_index("code", unique=True)
    await db.attractions.create_index("slug", unique=True)
    await db.attractions.create_index([("geo", "2dsphere")])
    await db.attractions.create_index([("status", 1), ("updated_at", -1)])
    await db.translations.create_index([("script_id", 1), ("target_lang", 1)], unique=True)
    await db.audio_assets.create_index("text_hash")
    await db.jobs.create_index(
        "dedupe_key",
        unique=True,
        partialFilterExpression={"status": {"$in": ["queued", "running"]}},
    )
