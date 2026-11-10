from typing import Protocol


class TTSProvider(Protocol):
    """Port cho TTS — Edge (nháp) / MagpieTTS tự host đều cài interface này."""

    async def synthesize(
        self, text: str, voice_id: str, rate: str = "+0%", *, lang: str = "en"
    ) -> bytes: ...
