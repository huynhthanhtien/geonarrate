from typing import Protocol


class TTSProvider(Protocol):
    """Port cho TTS — Edge (nháp) / Azure (production) / self-host đều cài interface này."""

    async def synthesize(self, text: str, voice_id: str, rate: str = "+0%") -> bytes: ...
