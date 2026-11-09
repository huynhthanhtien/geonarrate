import hashlib
from datetime import datetime, timedelta
from typing import Any

from sqlalchemy import or_, select, text, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncConnection, AsyncEngine

from app.core.schema import jobs
from app.core.transaction import connection
from app.repositories._ids import parse_uuid, record

MAX_ATTEMPTS = 3
BACKOFF_S = (15, 60)  # chờ trước lần thử 2 và 3: lỗi TTS thường chỉ tạm thời


def text_hash(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def job_spec(type_: str, dedupe_key: str, payload: dict[str, Any]) -> dict[str, Any]:
    return {"type": type_, "dedupe_key": dedupe_key, "payload": payload}


async def add_jobs(
    conn: AsyncConnection, specs: list[dict[str, Any]], actor_id: str | None, now: datetime
) -> None:
    """Tạo job trong transaction của thao tác nghiệp vụ; job trùng đang chạy thì bỏ qua."""
    for spec in specs:
        await conn.execute(
            insert(jobs)
            .values(
                **spec,
                status="queued",
                created_by=parse_uuid(actor_id) if actor_id else None,
                created_at=now,
                updated_at=now,
            )
            .on_conflict_do_nothing(
                index_elements=[jobs.c.dedupe_key],
                index_where=text("status IN ('queued', 'running')"),
            )
        )


class SqlJobRepository:
    def __init__(self, engine: AsyncEngine) -> None:
        self._engine = engine

    async def enqueue(
        self, specs: list[dict[str, Any]], actor_id: str | None, now: datetime
    ) -> None:
        async with connection(self._engine, write=True) as conn:
            await add_jobs(conn, specs, actor_id, now)

    async def claim_next(self, now: datetime) -> dict[str, Any] | None:
        """Nhiều worker cùng chạy vẫn an toàn nhờ FOR UPDATE SKIP LOCKED."""
        next_id = (
            select(jobs.c.id)
            .where(
                jobs.c.status == "queued",
                or_(jobs.c.run_after.is_(None), jobs.c.run_after <= now),
            )
            .order_by(jobs.c.created_at)
            .limit(1)
            .with_for_update(skip_locked=True)
            .scalar_subquery()
        )
        stmt = (
            update(jobs)
            .where(jobs.c.id == next_id)
            .values(status="running", attempts=jobs.c.attempts + 1, updated_at=now)
            .returning(jobs)
        )
        async with connection(self._engine, write=True) as conn:
            row = (await conn.execute(stmt)).mappings().one_or_none()
        return record(row) if row else None

    async def finish(self, job_id: str, now: datetime) -> None:
        async with connection(self._engine, write=True) as conn:
            await conn.execute(
                update(jobs)
                .where(jobs.c.id == parse_uuid(job_id))
                .values(status="succeeded", error=None, updated_at=now)
            )

    async def fail(self, job_id: str, attempts: int, message: str, now: datetime) -> None:
        """Còn lượt thì đưa về hàng đợi, hết lượt thì `failed` để người dùng bấm thử lại."""
        status = "queued" if attempts < MAX_ATTEMPTS else "failed"
        async with connection(self._engine, write=True) as conn:
            await conn.execute(
                update(jobs)
                .where(jobs.c.id == parse_uuid(job_id))
                .values(
                    status=status,
                    error={"message": message[:500]},
                    run_after=now + timedelta(seconds=BACKOFF_S[min(attempts, 2) - 1]),
                    updated_at=now,
                )
            )

    async def requeue_stale(self, cutoff: datetime, now: datetime) -> int:
        """Worker chết giữa chừng để job kẹt ở running."""
        async with connection(self._engine, write=True) as conn:
            stale = (
                await conn.execute(
                    update(jobs)
                    .where(jobs.c.status == "running", jobs.c.updated_at < cutoff)
                    .values(
                        status="queued", error={"message": "Worker dừng đột ngột"}, updated_at=now
                    )
                )
            ).rowcount
        return int(stale)

    async def latest_by_prefix(self, prefix: str) -> dict[str, dict[str, Any]]:
        """Job mới nhất của mỗi dedupe_key bắt đầu bằng prefix."""
        stmt = (
            select(jobs.c.dedupe_key, jobs.c.status, jobs.c.error, jobs.c.updated_at)
            .where(jobs.c.dedupe_key.startswith(prefix, autoescape=True))
            .order_by(jobs.c.updated_at)
        )
        async with connection(self._engine) as conn:
            rows = (await conn.execute(stmt)).mappings().all()
        return {r["dedupe_key"]: dict(r) for r in rows}
