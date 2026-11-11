import httpx

MAX_IMAGE_BYTES = 8 * 1024 * 1024
EXT_BY_TYPE = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif"}
TYPE_BY_EXT = {ext: ctype for ctype, ext in EXT_BY_TYPE.items()}


def sniff(data: bytes) -> str | None:
    """Định dạng thật của ảnh theo vài byte đầu (không tin Content-Type của client)."""
    if data.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    if data[:6] in (b"GIF87a", b"GIF89a"):
        return "image/gif"
    return None


async def fetch_image(url: str) -> tuple[bytes, str]:
    """Tải ảnh về để đưa vào pack; trả (bytes, đuôi file). Lỗi → RuntimeError (job sẽ thử lại)."""
    async with httpx.AsyncClient(timeout=30, follow_redirects=False) as client:
        async with client.stream("GET", url) as resp:
            if resp.status_code != 200:
                raise RuntimeError(f"Không tải được ảnh ({resp.status_code}): {url}")
            buf = bytearray()
            async for chunk in resp.aiter_bytes():  # dừng sớm khi vượt giới hạn
                buf += chunk
                if len(buf) > MAX_IMAGE_BYTES:
                    break
    data = bytes(buf)
    ctype = sniff(data)
    if ctype is None or len(data) > MAX_IMAGE_BYTES:
        raise RuntimeError(f"Ảnh không hợp lệ hoặc quá {MAX_IMAGE_BYTES // 2**20} MB: {url}")
    return data, EXT_BY_TYPE[ctype]
