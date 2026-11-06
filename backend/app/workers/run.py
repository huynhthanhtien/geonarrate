"""Worker nền: `python -m app.workers.run`. Có thể chạy nhiều tiến trình song song."""

import asyncio
import logging

from app.core import database
from app.core.deps import get_pipeline_service

logger = logging.getLogger("geonarrate.worker")
IDLE_SLEEP_S = 2.0


async def main() -> None:
    logging.basicConfig(level=logging.INFO)
    await database.connect()
    try:
        svc = get_pipeline_service()
        logger.info("Worker sẵn sàng")
        while True:
            try:
                worked = await svc.run_once()
            except Exception:
                logger.exception("Vòng xử lý job lỗi")
                worked = False
            if not worked:
                await asyncio.sleep(IDLE_SLEEP_S)
    finally:
        await database.disconnect()


if __name__ == "__main__":
    asyncio.run(main())
