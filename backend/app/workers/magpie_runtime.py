import asyncio
import logging
import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager, suppress
from pathlib import Path
from urllib.parse import urlsplit

import httpx

from app.core.config import Settings

logger = logging.getLogger("geonarrate.worker")
STARTUP_TIMEOUT = 120
BACKEND_ROOT = Path(__file__).resolve().parents[2]


async def _ready(client: httpx.AsyncClient, url: str) -> bool | None:
    try:
        response = await client.get(url)
    except httpx.ConnectError:
        return None
    except httpx.TimeoutException:
        return False
    if not response.is_success:
        return False
    try:
        return response.json().get("ready") is True
    except (ValueError, AttributeError):
        return False


@asynccontextmanager
async def magpie_runtime(settings: Settings) -> AsyncIterator[asyncio.subprocess.Process | None]:
    endpoint = urlsplit(settings.magpie_tts_url)
    if (
        settings.tts_provider != "magpie"
        or not settings.magpie_tts_autostart
        or endpoint.scheme != "http"
        or endpoint.hostname not in {"127.0.0.1", "localhost"}
        or endpoint.path not in {"", "/"}
    ):
        yield None
        return

    url = f"{settings.magpie_tts_url.rstrip('/')}/ready"
    process = None
    try:
        async with httpx.AsyncClient(timeout=2.0, trust_env=False) as client:
            ready = await _ready(client, url)
            if ready is None:
                device = settings.magpie_tts_device
                runtime = BACKEND_ROOT / (
                    "var/nemo-speech-cjk-cuda" if device == "cuda" else "var/nemo-speech-cjk"
                )
                binary = runtime / "bin/nemo-speech"
                data_dir = runtime / "share/nemo-speech"
                model_dir = BACKEND_ROOT / "var/nemo-models"
                if not binary.is_file():
                    raise RuntimeError(
                        f"Thiếu runtime Magpie cho {device.upper()} tại {binary}. Xem README."
                    )
                if not model_dir.is_dir():
                    raise RuntimeError(f"Thiếu model Magpie tại {model_dir}. Xem README.")
                logger.info("Đang khởi động MagpieTTS cục bộ (%s)", device)
                process = await asyncio.create_subprocess_exec(
                    str(binary),
                    "serve",
                    "--tts-model",
                    "magpie",
                    "--device",
                    device,
                    "--host",
                    "127.0.0.1",
                    "--port",
                    str(endpoint.port or 80),
                    "--threads",
                    "2",
                    "--no-ui",
                    env={
                        **os.environ,
                        "NEMO_SPEECH_MODEL_DIR": str(model_dir),
                        "MAGPIE_OPENJTALK_DIC_DIR": os.environ.get("MAGPIE_OPENJTALK_DIC_DIR")
                        or str(data_dir / "open_jtalk_dic"),
                        "MAGPIE_MANDARIN_G2P_DIR": os.environ.get("MAGPIE_MANDARIN_G2P_DIR")
                        or str(data_dir / "mandarin_g2p"),
                    },
                )
            try:
                async with asyncio.timeout(STARTUP_TIMEOUT):
                    while not ready:
                        if process is not None and process.returncode is not None:
                            raise RuntimeError(f"MagpieTTS dừng với mã {process.returncode}")
                        await asyncio.sleep(1)
                        ready = await _ready(client, url)
            except TimeoutError as exc:
                raise RuntimeError(f"MagpieTTS chưa sẵn sàng tại {url}") from exc
        logger.info("MagpieTTS sẵn sàng")
        yield process
    finally:
        if process is not None and process.returncode is None:
            with suppress(ProcessLookupError):
                process.terminate()
            try:
                await asyncio.wait_for(process.wait(), timeout=5)
            except TimeoutError:
                with suppress(ProcessLookupError):
                    process.kill()
                await process.wait()
