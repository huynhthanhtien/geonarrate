import asyncio

import httpx


class MagpieTTS:
    def __init__(self, base_url: str) -> None:
        self._endpoint = f"{base_url.rstrip('/')}/v1/audio/speech"

    async def synthesize(
        self, text: str, voice_id: str, rate: str = "+0%", *, lang: str = "en"
    ) -> bytes:
        if rate != "+0%":
            raise ValueError("MagpieTTS chỉ hỗ trợ tốc độ mặc định")
        async with httpx.AsyncClient(timeout=httpx.Timeout(120.0, connect=5.0)) as client:
            response = await client.post(
                self._endpoint,
                json={"input": text, "voice": voice_id, "language": lang, "response_format": "wav"},
            )
            try:
                response.raise_for_status()
            except httpx.HTTPStatusError as exc:
                try:
                    detail = response.json()["error"]["message"]
                except (ValueError, KeyError, TypeError):
                    detail = None
                if isinstance(detail, str) and detail.strip():
                    raise RuntimeError(
                        f"MagpieTTS ({lang}, HTTP {response.status_code}): {detail[:300]}"
                    ) from exc
                raise
        return await _encode_mp3(response.content)


async def _encode_mp3(wav: bytes) -> bytes:
    if len(wav) < 12 or wav[:4] != b"RIFF" or wav[8:12] != b"WAVE":
        raise RuntimeError("MagpieTTS không trả về WAV hợp lệ")
    process = await asyncio.create_subprocess_exec(
        "ffmpeg",
        "-hide_banner",
        "-loglevel",
        "error",
        "-f",
        "wav",
        "-i",
        "pipe:0",
        "-ac",
        "1",
        "-b:a",
        "48k",
        "-f",
        "mp3",
        "pipe:1",
        stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    try:
        audio, error = await asyncio.wait_for(process.communicate(wav), timeout=30)
    except (asyncio.CancelledError, TimeoutError):
        if process.returncode is None:
            process.kill()
        await process.communicate()
        raise
    if process.returncode != 0 or not audio:
        detail = error.decode(errors="replace").strip()
        raise RuntimeError(f"Không chuyển được audio MagpieTTS sang MP3: {detail}")
    return audio
