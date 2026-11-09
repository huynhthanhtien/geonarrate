from datetime import datetime
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncEngine

from app.core.schema import glossaries
from app.core.transaction import connection
from app.repositories._ids import parse_uuid, record


class SqlGlossaryRepository:
    def __init__(self, engine: AsyncEngine) -> None:
        self._engine = engine

    async def find(self, lang: str | None = None) -> list[dict[str, Any]]:
        stmt = select(glossaries).order_by(glossaries.c.term, glossaries.c.target_lang)
        if lang:
            stmt = stmt.where(glossaries.c.target_lang == lang)
        async with connection(self._engine) as conn:
            return [record(r) for r in (await conn.execute(stmt)).mappings().all()]

    async def for_translation(self, attraction_id: str, lang: str) -> list[dict[str, Any]]:
        uid = parse_uuid(attraction_id)
        stmt = select(glossaries).where(
            glossaries.c.target_lang == lang,
            glossaries.c.attraction_id.is_(None) | (glossaries.c.attraction_id == uid),
        )
        async with connection(self._engine) as conn:
            return [record(r) for r in (await conn.execute(stmt)).mappings().all()]

    async def insert(
        self,
        term: str,
        lang: str,
        translation: str,
        is_required: bool,
        attraction_id: str | None,
        actor_id: str,
        now: datetime,
    ) -> dict[str, Any] | None:
        stmt = (
            insert(glossaries)
            .values(
                term=term,
                target_lang=lang,
                translation=translation,
                is_required=is_required,
                attraction_id=parse_uuid(attraction_id) if attraction_id else None,
                created_by=parse_uuid(actor_id),
                created_at=now,
                updated_at=now,
            )
            .on_conflict_do_nothing(constraint="uq_glossaries_term_lang_attraction")
            .returning(glossaries)
        )
        async with connection(self._engine, write=True) as conn:
            row = (await conn.execute(stmt)).mappings().one_or_none()
        return record(row) if row else None

    async def delete(self, glossary_id: str) -> bool:
        uid = parse_uuid(glossary_id)
        if uid is None:
            return False
        async with connection(self._engine, write=True) as conn:
            result = await conn.execute(delete(glossaries).where(glossaries.c.id == uid))
        return bool(result.rowcount)
