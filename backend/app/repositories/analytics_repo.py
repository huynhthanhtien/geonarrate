from datetime import datetime
from typing import Any

from sqlalchemy import case, func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncEngine

from app.core.schema import languages, playback_events, pois, tour_pois
from app.core.transaction import connection
from app.repositories._ids import parse_uuid


class SqlAnalyticsRepository:
    def __init__(self, engine: AsyncEngine) -> None:
        self._engine = engine

    async def insert_events(self, device_id: str, events: list[dict[str, Any]]) -> int:
        """event_id trùng thì bỏ qua; sự kiện trỏ tới điểm hoặc ngôn ngữ không có cũng bỏ qua."""
        if not events:
            return 0
        ids = {parse_uuid(e["poi_id"]) for e in events} - {None}
        rows = []
        async with connection(self._engine, write=True) as conn:
            known = set((await conn.execute(select(pois.c.id).where(pois.c.id.in_(ids)))).scalars())
            langs = set((await conn.execute(select(languages.c.code))).scalars())
            for e in events:
                uid = parse_uuid(e["poi_id"])
                if uid in known and e["lang"] in langs:
                    row = {k: v for k, v in e.items() if k != "poi_id"}
                    rows.append({**row, "poi_id": uid, "device_id": device_id})
            if not rows:
                return 0
            result = await conn.execute(
                insert(playback_events)
                .values(rows)
                .on_conflict_do_nothing(constraint="uq_playback_events_device_event")
            )
        return int(result.rowcount)

    async def summary(
        self, start: datetime, end: datetime, tour_id: str | None, lang: str | None, tz: str
    ) -> dict[str, Any]:
        p = playback_events
        conds = [p.c.ts >= start, p.c.ts < end]
        if lang:
            conds.append(p.c.lang == lang)
        if tour_id:
            conds.append(
                p.c.poi_id.in_(
                    select(tour_pois.c.poi_id).where(tour_pois.c.tour_id == parse_uuid(tour_id))
                )
            )
        plays = func.sum(case((p.c.event == "play", 1), else_=0))
        completes = func.sum(case((p.c.event == "complete", 1), else_=0))
        async with connection(self._engine) as conn:
            total = (
                await conn.execute(
                    select(
                        plays,
                        completes,
                        func.count(func.distinct(case((p.c.event == "play", p.c.device_id)))),
                    ).where(*conds)
                )
            ).one()
            top = (
                await conn.execute(
                    select(
                        pois.c.id, pois.c.title, plays.label("plays"), completes.label("completes")
                    )
                    .select_from(p.join(pois, p.c.poi_id == pois.c.id))
                    .where(*conds)
                    .group_by(pois.c.id, pois.c.title)
                    .order_by(plays.desc())
                    .limit(10)
                )
            ).all()
            by_lang = (
                await conn.execute(
                    select(p.c.lang, plays.label("plays")).where(*conds).group_by(p.c.lang)
                )
            ).all()
            # Chia ngày theo múi giờ người xem: ts lưu UTC, ngày ở Việt Nam bắt đầu lúc 17h UTC
            day = func.date(func.timezone(tz, p.c.ts)).label("day")
            by_day = (
                await conn.execute(
                    select(day, plays, completes).where(*conds).group_by(day).order_by(day)
                )
            ).all()
            trigger_rows = (
                await conn.execute(
                    select(p.c.trigger, plays.label("plays"))
                    .where(*conds, p.c.event == "play")
                    .group_by(p.c.trigger)
                )
            ).all()
            hour = func.extract("hour", func.timezone(tz, p.c.ts)).label("hour")
            hour_rows = (
                await conn.execute(
                    select(hour, plays.label("plays"))
                    .where(*conds, p.c.event == "play")
                    .group_by(hour)
                    .order_by(hour)
                )
            ).all()
        play_count = int(total[0] or 0)
        done = int(total[1] or 0)
        return {
            "plays": play_count,
            "completes": done,
            "devices": int(total[2] or 0),
            "completion_rate": round(done / play_count, 4) if play_count else None,
            "top_pois": [
                {"id": str(r[0]), "name": r[1], "plays": int(r[2]), "completes": int(r[3] or 0)}
                for r in top
                if r[2]
            ],
            "by_trigger": [
                {"trigger": r[0] or "unknown", "plays": int(r[1])} for r in trigger_rows
            ],
            "by_hour": [{"hour": int(r[0]), "plays": int(r[1])} for r in hour_rows],
            "by_lang": [{"lang": r[0], "plays": int(r[1])} for r in by_lang],
            "by_day": [
                {"day": r[0], "plays": int(r[1] or 0), "completes": int(r[2] or 0)} for r in by_day
            ],
        }
