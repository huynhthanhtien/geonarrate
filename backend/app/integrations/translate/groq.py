import httpx

from app.integrations.translate.base import GlossaryTerm


class GroqTranslate:
    """Dịch nội dung bằng chat completions API tương thích OpenAI của Groq."""

    name = "groq"
    _endpoint = "https://api.groq.com/openai/v1/chat/completions"

    def __init__(self, api_key: str, model: str) -> None:
        if not api_key.strip():
            raise ValueError("Groq Translate cần GROQ_API_KEY")
        self._api_key = api_key
        self._model = model

    async def translate(
        self,
        text: str,
        source: str,
        target: str,
        terms: list[GlossaryTerm],
        *,
        source_tag: str | None = None,
        target_tag: str | None = None,
    ) -> str:
        # Mã BCP 47 lấy từ bảng languages (do PipelineService truyền xuống), vd. vi-VN, zh-CN;
        # thiếu thì dùng mã ngắn của ngôn ngữ.
        source_name = source_tag or source
        target_name = target_tag or target
        glossary = "\n".join(
            f"- {term.term} → {term.translation}"
            + (" (required; preserve this exact translation)" if term.is_required else "")
            for term in terms
        )
        system = (
            f"Translate from {source_name} to {target_name} (BCP 47 language tags; "
            "zh-CN means Simplified Chinese). Preserve meaning, names, "
            "paragraph breaks, numbers, and proper nouns. Use natural, concise language "
            "suitable for an audio guide. Return only the translation, with no notes, "
            "quotes, or preamble."
        )
        if glossary:
            system += "\nFollow this project glossary consistently:\n" + glossary
        payload = {
            "model": self._model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": text},
            ],
            "temperature": 0.2,
        }
        async with httpx.AsyncClient(timeout=httpx.Timeout(120, connect=10)) as client:
            response = await client.post(
                self._endpoint,
                json=payload,
                headers={"Authorization": f"Bearer {self._api_key}"},
            )
            response.raise_for_status()
        choices = response.json().get("choices")
        result = (
            choices[0].get("message", {}).get("content")
            if isinstance(choices, list) and choices and isinstance(choices[0], dict)
            else None
        )
        if not isinstance(result, str) or not result.strip():
            raise RuntimeError("Groq không trả về bản dịch hợp lệ")
        return result.strip()
