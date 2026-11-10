import httpx

from app.integrations.translate.base import GlossaryTerm


class LibreTranslate:
    """REST adapter. Thuật ngữ được kiểm tra bởi QA trước khi người dịch duyệt."""

    name = "libretranslate"

    def __init__(self, base_url: str, api_key: str = "") -> None:
        self._endpoint = f"{base_url.rstrip('/')}/translate"
        self._api_key = api_key

    async def translate(
        self, text: str, source: str, target: str, terms: list[GlossaryTerm]
    ) -> str:
        payload = {"q": text, "source": source, "target": target, "format": "text"}
        if self._api_key:
            payload["api_key"] = self._api_key
        async with httpx.AsyncClient(timeout=httpx.Timeout(120, connect=5)) as client:
            response = await client.post(self._endpoint, json=payload)
            response.raise_for_status()
        result = response.json().get("translatedText")
        if not isinstance(result, str) or not result.strip():
            raise RuntimeError("LibreTranslate không trả về bản dịch hợp lệ")
        return result
