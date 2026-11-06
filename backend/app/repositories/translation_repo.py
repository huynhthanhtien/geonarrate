from datetime import datetime
from typing import Any

from sqlalchemy import select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncEngine

from app.core.schema import attractions, translations
from app.repositories._ids import parse_uuid, record
from app.repositories.job_repo import add_jobs

_t = translations
_COLS = (*_t.c, attractions.c.title, attractions.c.script["body"].astext.label("source_text"))
_JOIN = _t.join(attractions, _t.c.attraction_id == attractions.c.id)


class SqlTranslationRepository:
    def __init__(self, engine: AsyncEngine) -> None:
        self._engine = engine

    async def find(self, lang: str | None, status: str | None) -> list[dict[str, Any]]:
        stmt = select(*_COLS).select_from(_JOIN).order_by(_t.c.updated_at.desc()).limit(500)
        if lang:
            stmt = stmt.where(_t.c.target_lang == lang)
        if status:
            stmt = stmt.where(_t.c.review_status == status)
        async with self._engine.connect() as conn:
            return [record(r) for r in (await conn.execute(stmt)).mappings().all()]

    async def get(self, translation_id: str) -> dict[str, Any] | None:
        uid = parse_uuid(translation_id)
        if uid is None:
            return None
        stmt = select(*_COLS).select_from(_JOIN).where(_t.c.id == uid)
        async with self._engine.connect() as conn:
            row = (await conn.execute(stmt)).mappings().one_or_none()
        return record(row) if row else None

    async def approved_for(self, attraction_id: str, lang: str) -> dict[str, Any] | None:
        stmt = select(_t).where(
            _t.c.attraction_id == parse_uuid(attraction_id),
            _t.c.target_lang == lang,
            _t.c.review_status == "approved",
        )
        async with self._engine.connect() as conn:
            row = (await conn.execute(stmt)).mappings().one_or_none()
        return record(row) if row else None

    async def all_approved(self) -> list[dict[str, Any]]:
        stmt = select(_t.c.attraction_id, _t.c.target_lang, _t.c.text).where(
            _t.c.review_status == "approved"
        )
        async with self._engine.connect() as conn:
            return [record(r) for r in (await conn.execute(stmt)).mappings().all()]

    async def upsert_machine(
        self,
        attraction_id: str,
        lang: str,
        text: str,
        provider: str,
        qa_flags: list[str],
        hash_: str,
        now: datetime,
    ) -> None:
        """Kịch bản đổi thì bản dịch cũ về pending và tăng version."""
        stmt = insert(_t).values(
            attraction_id=parse_uuid(attraction_id),
            target_lang=lang,
            version=1,
            text=text,
            provider=provider,
            qa_flags=qa_flags,
            review_status="pending",
            text_hash=hash_,
            created_at=now,
            updated_at=now,
        )
        stmt = stmt.on_conflict_do_update(
            constraint="uq_translations_attraction_lang",
            set_={
                "version": _t.c.version + 1,
                "text": text,
                "provider": provider,
                "qa_flags": qa_flags,
                "review_status": "pending",
                "review_note": None,
                "reviewed_by": None,
                "reviewed_at": None,
                "text_hash": hash_,
                "updated_at": now,
            },
        )
        async with self._engine.begin() as conn:
            await conn.execute(stmt)

    async def edit(
        self, translation_id: str, text: str, flags: list[str], hash_: str, now: datetime
    ) -> None:
        async with self._engine.begin() as conn:
            await conn.execute(
                update(_t)
                .where(_t.c.id == parse_uuid(translation_id))
                .values(
                    text=text,
                    qa_flags=flags,
                    text_hash=hash_,
                    review_status="pending",
                    updated_at=now,
                )
            )

    async def set_flags(self, translation_id: str, flags: list[str], now: datetime) -> None:
        async with self._engine.begin() as conn:
            await conn.execute(
                update(_t)
                .where(_t.c.id == parse_uuid(translation_id))
                .values(qa_flags=flags, updated_at=now)
            )

    async def review(
        self,
        translation_id: str,
        status: str,
        note: str | None,
        actor_id: str,
        now: datetime,
        jobs_: list[dict[str, Any]] | None = None,
    ) -> bool:
        """Chỉ duyệt được bản chưa duyệt; job audio tạo cùng transaction nên không thể bị mất."""
        stmt = (
            update(_t)
            .where(_t.c.id == parse_uuid(translation_id), _t.c.review_status != "approved")
            .values(
                review_status=status,
                review_note=note,
                reviewed_by=parse_uuid(actor_id),
                reviewed_at=now,
                updated_at=now,
            )
        )
        async with self._engine.begin() as conn:
            changed = bool((await conn.execute(stmt)).rowcount)
            if changed and jobs_:
                await add_jobs(conn, jobs_, actor_id, now)
        return changed
