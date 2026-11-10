"""Worker nền: `python -m app.workers.run`."""

import asyncio
import logging
import signal

from app.core import database
from app.core.config import get_settings
from app.core.deps import get_pipeline_service
from app.workers.magpie_runtime import magpie_runtime

logger = logging.getLogger("geonarrate.worker")
IDLE_SLEEP_S = 2.0


async def main() -> None:
    logging.basicConfig(level=logging.INFO)
    task = asyncio.current_task()
    loop = asyncio.get_running_loop()
    if task is not None:
        loop.add_signal_handler(signal.SIGTERM, task.cancel)
    try:
        async with magpie_runtime(get_settings()) as magpie:
            await database.connect()
            try:
                svc = get_pipeline_service()
                logger.info("Worker sẵn sàng")
                while True:
                    if magpie is not None and magpie.returncode is not None:
                        raise RuntimeError(f"MagpieTTS đã dừng với mã {magpie.returncode}")
                    try:
                        worked = await svc.run_once()
                    except Exception:
                        logger.exception("Vòng xử lý job lỗi")
                        worked = False
                    if not worked:
                        await asyncio.sleep(IDLE_SLEEP_S)
            finally:
                await database.disconnect()
    finally:
        loop.remove_signal_handler(signal.SIGTERM)


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except (KeyboardInterrupt, asyncio.CancelledError):
        pass
