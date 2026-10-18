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
    """Index bootstrap cho CSDL v1 (chương 02 §2.0, docs/erd.dbml) — idempotent."""
    db = get_db()
    await db.languages.create_index("code", unique=True)
    await db.attractions.create_index("slug", unique=True)
    await db.attractions.create_index([("geo", "2dsphere")])
    await db.attractions.create_index([("status", 1), ("updated_at", -1)])
    await db.attractions.create_index("script.status")
    await db.tours.create_index("slug", unique=True)
    await db.glossaries.create_index(
        [("term", 1), ("target_lang", 1), ("attraction_id", 1)], unique=True
    )
    await db.glossaries.create_index("target_lang")
    await db.translations.create_index([("attraction_id", 1), ("target_lang", 1)], unique=True)
    await db.translations.create_index([("target_lang", 1), ("review_status", 1)])
    # build lại không sinh bản ghi trùng
    await db.audio_assets.create_index(
        [("attraction_id", 1), ("lang", 1), ("segment_no", 1), ("text_hash", 1)], unique=True
    )
    await db.audio_assets.create_index("text_hash")
    await db.audio_packs.create_index([("tour_id", 1), ("lang", 1), ("version", -1)], unique=True)
    await db.audio_packs.create_index([("tour_id", 1), ("lang", 1), ("status", 1)])
    await db.jobs.create_index(
        "dedupe_key",
        unique=True,
        partialFilterExpression={"status": {"$in": ["queued", "running"]}},
    )
    await db.jobs.create_index([("status", 1), ("created_at", -1)])
    await db.users.create_index("email", unique=True)
    await db.audit_logs.create_index([("resource.type", 1), ("resource.id", 1), ("ts", -1)])
    await db.audit_logs.create_index([("actor_id", 1), ("ts", -1)])
    await db.refresh_tokens.create_index("token_hash", unique=True)
    await db.refresh_tokens.create_index("family_id")
    await db.refresh_tokens.create_index("expires_at", expireAfterSeconds=0)
    await db.playback_events.create_index([("device_id", 1), ("event_id", 1)], unique=True)
    await db.playback_events.create_index([("attraction_id", 1), ("ts", -1)])
    await db.playback_events.create_index("ts", expireAfterSeconds=180 * 24 * 3600)
