from datetime import datetime
from typing import Any

from sqlalchemy import func, select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncEngine

from app.core.schema import audio_assets, audio_packs
from app.repositories._ids import parse_uuid, record
from app.repositories.job_repo import add_jobs


class SqlAudioRepository:
    def __init__(self, engine: AsyncEngine) -> None:
        self._engine = engine

    async def find_asset(self, attraction_id: str, lang: str, hash_: str) -> dict[str, Any] | None:
        stmt = select(audio_assets).where(
            audio_assets.c.attraction_id == parse_uuid(attraction_id),
            audio_assets.c.lang == lang,
            audio_assets.c.text_hash == hash_,
            audio_assets.c.status == "ready",
        )
        async with self._engine.connect() as conn:
            row = (await conn.execute(stmt)).mappings().one_or_none()
        return record(row) if row else None

    async def all_ready(self) -> list[dict[str, Any]]:
        stmt = select(audio_assets).where(audio_assets.c.status == "ready")
        async with self._engine.connect() as conn:
            return [record(r) for r in (await conn.execute(stmt)).mappings().all()]

    async def upsert_asset(
        self,
        attraction_id: str,
        lang: str,
        hash_: str,
        voice: str,
        key: str,
        size: int,
        duration_ms: int,
        sha256: str,
        now: datetime,
    ) -> None:
        values = {
            "voice": voice,
            "storage_key": key,
            "bytes": size,
            "duration_ms": duration_ms,
            "sha256": sha256,
            "status": "ready",
            "updated_at": now,
        }
        stmt = (
            insert(audio_assets)
            .values(
                attraction_id=parse_uuid(attraction_id),
                lang=lang,
                text_hash=hash_,
                created_at=now,
                **values,
            )
            .on_conflict_do_update(constraint="uq_audio_assets_attraction_lang", set_=values)
        )
        async with self._engine.begin() as conn:
            await conn.execute(stmt)

    # --- pack
    async def find_packs(self, tour_id: str | None, lang: str | None) -> list[dict[str, Any]]:
        stmt = select(audio_packs).order_by(audio_packs.c.created_at.desc()).limit(200)
        if tour_id:
            stmt = stmt.where(audio_packs.c.tour_id == parse_uuid(tour_id))
        if lang:
            stmt = stmt.where(audio_packs.c.lang == lang)
        async with self._engine.connect() as conn:
            return [record(r) for r in (await conn.execute(stmt)).mappings().all()]

    async def get_pack(self, pack_id: str) -> dict[str, Any] | None:
        uid = parse_uuid(pack_id)
        if uid is None:
            return None
        async with self._engine.connect() as conn:
            row = (
                (await conn.execute(select(audio_packs).where(audio_packs.c.id == uid)))
                .mappings()
                .one_or_none()
            )
        return record(row) if row else None

    async def published_pack(self, tour_id: str, lang: str) -> dict[str, Any] | None:
        stmt = select(audio_packs).where(
            audio_packs.c.tour_id == parse_uuid(tour_id),
            audio_packs.c.lang == lang,
            audio_packs.c.status == "published",
        )
        async with self._engine.connect() as conn:
            row = (await conn.execute(stmt)).mappings().one_or_none()
        return record(row) if row else None

    async def create_pack(self, tour_id: str, lang: str, actor_id: str, now: datetime) -> str:
        """Version và job tạo trong một transaction; khoá theo tour × ngôn ngữ để không trùng."""
        uid = parse_uuid(tour_id)
        async with self._engine.begin() as conn:
            await conn.execute(
                select(func.pg_advisory_xact_lock(func.hashtext(f"pack:{tour_id}:{lang}")))
            )
            current = await conn.execute(
                select(func.coalesce(func.max(audio_packs.c.version), 0)).where(
                    audio_packs.c.tour_id == uid, audio_packs.c.lang == lang
                )
            )
            version = int(current.scalar_one()) + 1
            pack_id = (
                await conn.execute(
                    insert(audio_packs)
                    .values(
                        tour_id=uid,
                        lang=lang,
                        version=version,
                        status="building",
                        created_at=now,
                        updated_at=now,
                    )
                    .returning(audio_packs.c.id)
                )
            ).scalar_one()
            await add_jobs(
                conn,
                [
                    {
                        "type": "pack_build",
                        "dedupe_key": f"pack:{pack_id}",
                        "payload": {"pack_id": str(pack_id)},
                    }
                ],
                actor_id,
                now,
            )
        return str(pack_id)

    async def update_pack(self, pack_id: str, values: dict[str, Any], now: datetime) -> None:
        async with self._engine.begin() as conn:
            await conn.execute(
                update(audio_packs)
                .where(audio_packs.c.id == parse_uuid(pack_id))
                .values(**values, updated_at=now)
            )

    async def promote_pack(
        self, pack: dict[str, Any], expected: str, actor_id: str, now: datetime
    ) -> bool:
        """Bản đang phát hành thành superseded, bản này thành published, trong một transaction."""
        uid = parse_uuid(pack["id"])
        async with self._engine.begin() as conn:
            await conn.execute(
                select(
                    func.pg_advisory_xact_lock(
                        func.hashtext(f"pack:{pack['tour_id']}:{pack['lang']}")
                    )
                )
            )
            await conn.execute(
                update(audio_packs)
                .where(
                    audio_packs.c.tour_id == parse_uuid(pack["tour_id"]),
                    audio_packs.c.lang == pack["lang"],
                    audio_packs.c.status == "published",
                )
                .values(status="superseded", updated_at=now)
            )
            result = await conn.execute(
                update(audio_packs)
                .where(audio_packs.c.id == uid, audio_packs.c.status == expected)
                .values(
                    status="published",
                    published_by=parse_uuid(actor_id),
                    published_at=now,
                    updated_at=now,
                )
            )
            if not result.rowcount:
                await conn.rollback()
                return False
        return True
