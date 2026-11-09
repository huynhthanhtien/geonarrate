import re
from xml.etree.ElementTree import Element, SubElement, tostring

import httpx


class AzureTTS:
    def __init__(self, key: str, region: str) -> None:
        if not key or not re.fullmatch(r"[a-z0-9-]+", region):
            raise ValueError("Azure TTS cần AZURE_SPEECH_KEY và AZURE_SPEECH_REGION hợp lệ")
        self._key = key
        self._endpoint = f"https://{region}.tts.speech.microsoft.com/cognitiveservices/v1"

    async def synthesize(
        self, text: str, voice_id: str, rate: str = "+0%", *, lang: str = "en"
    ) -> bytes:
        locale = "-".join(voice_id.split("-")[:2])
        root = Element("speak", {"version": "1.0", "xml:lang": locale})
        voice = SubElement(root, "voice", {"name": voice_id})
        SubElement(voice, "prosody", {"rate": rate}).text = text
        async with httpx.AsyncClient(timeout=httpx.Timeout(120, connect=5)) as client:
            response = await client.post(
                self._endpoint,
                headers={
                    "Ocp-Apim-Subscription-Key": self._key,
                    "Content-Type": "application/ssml+xml",
                    "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3",
                    "User-Agent": "GeoNarrate",
                },
                content=tostring(root, encoding="utf-8"),
            )
            response.raise_for_status()
        if not response.content:
            raise RuntimeError("Azure TTS không trả về âm thanh")
        return response.content
