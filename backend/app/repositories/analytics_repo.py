from datetime import datetime
from typing import Any

from sqlalchemy import case, func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncEngine

from app.core.schema import attractions, languages, playback_events, tour_attractions
from app.core.transaction import connection
from app.repositories._ids import parse_uuid


class SqlAnalyticsRepository:
    def __init__(self, engine: AsyncEngine) -> None:
        self._engine = engine

    async def insert_events(self, device_id: str, events: list[dict[str, Any]]) -> int:
        """event_id trùng thì bỏ qua; sự kiện trỏ tới điểm hoặc ngôn ngữ không có cũng bỏ qua."""
        if not events:
            return 0
        ids = {parse_uuid(e["attraction_id"]) for e in events} - {None}
        rows = []
        async with connection(self._engine, write=True) as conn:
            known = set(
                (
                    await conn.execute(select(attractions.c.id).where(attractions.c.id.in_(ids)))
                ).scalars()
            )
            langs = set((await conn.execute(select(languages.c.code))).scalars())
            for e in events:
                uid = parse_uuid(e["attraction_id"])
                if uid in known and e["lang"] in langs:
                    rows.append({**e, "attraction_id": uid, "device_id": device_id})
            if not rows:
                return 0
            result = await conn.execute(
                insert(playback_events)
                .values(rows)
                .on_conflict_do_nothing(constraint="uq_playback_events_device_event")
            )
        return int(result.rowcount)

    async def summary(
        self, start: datetime, end: datetime, tour_id: str | None, lang: str | None
    ) -> dict[str, Any]:
        p = playback_events
        conds = [p.c.ts >= start, p.c.ts < end]
        if lang:
            conds.append(p.c.lang == lang)
        if tour_id:
            conds.append(
                p.c.attraction_id.in_(
                    select(tour_attractions.c.attraction_id).where(
                        tour_attractions.c.tour_id == parse_uuid(tour_id)
                    )
                )
            )
        plays = func.sum(case((p.c.event == "play", 1), else_=0))
        completes = func.sum(case((p.c.event == "complete", 1), else_=0))
        async with connection(self._engine) as conn:
            total = (await conn.execute(select(plays, completes).where(*conds))).one()
            top = (
                await conn.execute(
                    select(attractions.c.id, attractions.c.title, plays.label("plays"))
                    .select_from(p.join(attractions, p.c.attraction_id == attractions.c.id))
                    .where(*conds)
                    .group_by(attractions.c.id, attractions.c.title)
                    .order_by(plays.desc())
                    .limit(10)
                )
            ).all()
            by_lang = (
                await conn.execute(
                    select(p.c.lang, plays.label("plays")).where(*conds).group_by(p.c.lang)
                )
            ).all()
        play_count = int(total[0] or 0)
        done = int(total[1] or 0)
        return {
            "plays": play_count,
            "completes": done,
            "completion_rate": round(done / play_count, 4) if play_count else None,
            "top_attractions": [
                {"id": str(r[0]), "name": r[1], "plays": int(r[2])} for r in top if r[2]
            ],
            "by_lang": [{"lang": r[0], "plays": int(r[1])} for r in by_lang],
        }
