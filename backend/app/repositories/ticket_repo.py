from datetime import datetime
from typing import Any

from sqlalchemy import exists, func, insert, or_, select, update
from sqlalchemy.ext.asyncio import AsyncEngine

from app.core.schema import ticket_tours, tickets
from app.repositories._ids import parse_uuid, record

_TOURS = (
    select(func.array_agg(ticket_tours.c.tour_id))
    .where(ticket_tours.c.ticket_id == tickets.c.id)
    .scalar_subquery()
    .label("tour_ids")
)
_COLS = (
    tickets.c.id,
    tickets.c.code_hint,
    tickets.c.batch,
    tickets.c.valid_until,
    tickets.c.device_id,
    tickets.c.activated_at,
    tickets.c.transfers_left,
    tickets.c.status,
    tickets.c.created_at,
    _TOURS,
)


def _out(row: Any) -> dict[str, Any]:
    out = record(row)
    out["tour_ids"] = [str(t) for t in (out["tour_ids"] or [])]
    return out


class SqlTicketRepository:
    def __init__(self, engine: AsyncEngine) -> None:
        self._engine = engine

    async def create_batch(
        self,
        items: list[tuple[str, str]],
        batch: str,
        tour_ids: list[str],
        valid_until: datetime,
        transfers_left: int,
        actor_id: str,
        now: datetime,
    ) -> None:
        tours = [parse_uuid(t) for t in tour_ids]
        async with self._engine.begin() as conn:
            for code_hash, hint in items:
                tid = (
                    await conn.execute(
                        insert(tickets)
                        .values(
                            code_hash=code_hash,
                            code_hint=hint,
                            batch=batch,
                            valid_until=valid_until,
                            transfers_left=transfers_left,
                            status="active",
                            created_by=parse_uuid(actor_id),
                            created_at=now,
                            updated_at=now,
                        )
                        .returning(tickets.c.id)
                    )
                ).scalar_one()
                await conn.execute(
                    insert(ticket_tours), [{"ticket_id": tid, "tour_id": t} for t in tours]
                )

    async def search(self, q: str | None) -> list[dict[str, Any]]:
        stmt = select(*_COLS).order_by(tickets.c.created_at.desc()).limit(200)
        if q:
            stmt = stmt.where(or_(tickets.c.code_hint == q.upper(), tickets.c.batch == q))
        async with self._engine.connect() as conn:
            return [_out(r) for r in (await conn.execute(stmt)).mappings().all()]

    async def revoke(self, ticket_id: str | None, batch: str | None, now: datetime) -> int:
        stmt = update(tickets).where(tickets.c.status == "active")
        stmt = (
            stmt.where(tickets.c.id == parse_uuid(ticket_id))
            if ticket_id
            else stmt.where(tickets.c.batch == batch)
        )
        async with self._engine.begin() as conn:
            return int((await conn.execute(stmt.values(status="revoked", updated_at=now))).rowcount)

    async def activate(self, code_hash: str, device_id: str, now: datetime) -> dict[str, Any]:
        """Khoá dòng vé để hai máy quét cùng lúc không cùng chiếm vé hoặc trừ lượt sai."""
        async with self._engine.begin() as conn:
            row = (
                (
                    await conn.execute(
                        select(tickets).where(tickets.c.code_hash == code_hash).with_for_update()
                    )
                )
                .mappings()
                .one_or_none()
            )
            if row is None or row["status"] != "active" or row["valid_until"] <= now:
                return {"result": "invalid"}
            if row["device_id"] == device_id:
                result = "already_active"
            elif row["device_id"] is None:
                result = "activated"
            elif row["transfers_left"] > 0:
                result = "transferred"
            else:
                return {"result": "no_transfers"}
            if result != "already_active":
                await conn.execute(
                    update(tickets)
                    .where(tickets.c.id == row["id"])
                    .values(
                        device_id=device_id,
                        activated_at=now,
                        transfers_left=row["transfers_left"] - (result == "transferred"),
                        updated_at=now,
                    )
                )
            tours = await conn.execute(
                select(ticket_tours.c.tour_id).where(ticket_tours.c.ticket_id == row["id"])
            )
            return {
                "result": result,
                "tour_ids": [str(t) for t in tours.scalars()],
                "valid_until": row["valid_until"],
            }

    async def device_has_access(self, device_id: str, tour_id: str, now: datetime) -> bool:
        stmt = select(
            exists().where(
                tickets.c.device_id == device_id,
                tickets.c.status == "active",
                tickets.c.valid_until > now,
                ticket_tours.c.ticket_id == tickets.c.id,
                ticket_tours.c.tour_id == parse_uuid(tour_id),
            )
        )
        async with self._engine.connect() as conn:
            return bool((await conn.execute(stmt)).scalar_one())
