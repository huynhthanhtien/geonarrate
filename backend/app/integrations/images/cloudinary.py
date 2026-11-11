import hashlib
import time
from urllib.parse import unquote, urlparse

import httpx

HOST = "res.cloudinary.com"


def parse_cloudinary_url(url: str) -> tuple[str, str, str]:
    """`cloudinary://<api_key>:<api_secret>@<cloud_name>` → (cloud_name, api_key, api_secret)."""
    parsed = urlparse(url)
    if parsed.scheme != "cloudinary" or not (
        parsed.hostname and parsed.username and parsed.password
    ):
        raise ValueError("CLOUDINARY_URL phải có dạng cloudinary://api_key:api_secret@cloud_name")
    return parsed.hostname, unquote(parsed.username), unquote(parsed.password)


def is_cloudinary_image(url: str) -> bool:
    """Chỉ ảnh do Cloudinary phục vụ mới được kéo vào pack (tránh SSRF tới host tuỳ ý)."""
    parsed = urlparse(url)
    return parsed.scheme == "https" and parsed.hostname == HOST


class CloudinaryImages:
    """Tải ảnh lên Cloudinary bằng upload có chữ ký (khoá bí mật chỉ nằm ở backend)."""

    def __init__(self, cloudinary_url: str, folder: str = "geonarrate") -> None:
        self._cloud, self._key, self._secret = parse_cloudinary_url(cloudinary_url)
        self._folder = folder

    def _sign(self, params: dict[str, str]) -> str:
        to_sign = "&".join(f"{k}={v}" for k, v in sorted(params.items()))
        return hashlib.sha1((to_sign + self._secret).encode()).hexdigest()  # noqa: S324

    async def upload(self, data: bytes, content_type: str) -> str:
        params = {"folder": self._folder, "timestamp": str(int(time.time()))}
        form = {**params, "api_key": self._key, "signature": self._sign(params)}
        url = f"https://api.cloudinary.com/v1_1/{self._cloud}/image/upload"
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(url, data=form, files={"file": ("image", data, content_type)})
        if resp.status_code != 200:
            raise RuntimeError(f"Cloudinary từ chối ảnh ({resp.status_code})")
        secure = resp.json().get("secure_url")
        if not isinstance(secure, str):
            raise RuntimeError("Cloudinary không trả về URL ảnh")
        return secure
