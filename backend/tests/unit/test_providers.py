import io
import json
import shutil
import wave
from xml.etree.ElementTree import fromstring

import httpx
import pytest

from app.integrations.translate.libretranslate import LibreTranslate
from app.integrations.tts.azure import AzureTTS
from app.integrations.tts.magpie import MagpieTTS, _encode_mp3


def mock_http(monkeypatch: pytest.MonkeyPatch, response: httpx.Response) -> list[httpx.Request]:
    requests: list[httpx.Request] = []
    original = httpx.AsyncClient

    def handle(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return response

    def factory(**kwargs: object) -> httpx.AsyncClient:
        return original(transport=httpx.MockTransport(handle))

    monkeypatch.setattr(httpx, "AsyncClient", factory)
    return requests


async def test_libretranslate_request(monkeypatch: pytest.MonkeyPatch) -> None:
    requests = mock_http(monkeypatch, httpx.Response(200, json={"translatedText": "Hello"}))
    result = await LibreTranslate("http://translator/", "key").translate("Xin chào", "vi", "en", [])
    assert result == "Hello"
    assert str(requests[0].url) == "http://translator/translate"
    assert json.loads(requests[0].content) == {
        "q": "Xin chào",
        "source": "vi",
        "target": "en",
        "format": "text",
        "api_key": "key",
    }


@pytest.mark.parametrize("value", ["", "  ", None, [], 123])
async def test_libretranslate_rejects_bad_results(
    monkeypatch: pytest.MonkeyPatch, value: object
) -> None:
    mock_http(monkeypatch, httpx.Response(200, json={"translatedText": value}))
    with pytest.raises(RuntimeError):
        await LibreTranslate("http://translator").translate("x", "vi", "en", [])


async def test_provider_http_errors_propagate(monkeypatch: pytest.MonkeyPatch) -> None:
    mock_http(monkeypatch, httpx.Response(429))
    with pytest.raises(httpx.HTTPStatusError):
        await LibreTranslate("http://translator").translate("x", "vi", "en", [])
    with pytest.raises(httpx.HTTPStatusError):
        await AzureTTS("key", "eastus").synthesize("x", "en-US-AriaNeural")


async def test_azure_escapes_ssml_and_requests_mp3(monkeypatch: pytest.MonkeyPatch) -> None:
    requests = mock_http(monkeypatch, httpx.Response(200, content=b"mp3"))
    assert await AzureTTS("key", "eastus").synthesize("A & <B>", "vi-VN-HoaiMyNeural") == b"mp3"
    request = requests[0]
    root = fromstring(request.content)
    assert root.attrib["{http://www.w3.org/XML/1998/namespace}lang"] == "vi-VN"
    assert root.find("voice/prosody").text == "A & <B>"  # type: ignore[union-attr]
    assert request.headers["X-Microsoft-OutputFormat"] == "audio-24khz-48kbitrate-mono-mp3"


async def test_azure_empty_audio(monkeypatch: pytest.MonkeyPatch) -> None:
    mock_http(monkeypatch, httpx.Response(200))
    with pytest.raises(RuntimeError):
        await AzureTTS("key", "eastus").synthesize("x", "en-US-AriaNeural")


def test_azure_requires_credentials() -> None:
    with pytest.raises(ValueError):
        AzureTTS("", "eastus")
    with pytest.raises(ValueError):
        AzureTTS("key", "invalid/region")


async def test_magpie_rejects_non_wav_and_custom_rate() -> None:
    with pytest.raises(RuntimeError, match="WAV"):
        await _encode_mp3(b"invalid")
    with pytest.raises(ValueError):
        await MagpieTTS("http://magpie").synthesize("x", "Aria", "+10%")


@pytest.mark.skipif(shutil.which("ffmpeg") is None, reason="Cần ffmpeg như trong Docker image")
async def test_magpie_converts_real_wav_to_mp3(monkeypatch: pytest.MonkeyPatch) -> None:
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(24000)
        wav.writeframes(b"\x00\x00" * 24000)
    requests = mock_http(monkeypatch, httpx.Response(200, content=buffer.getvalue()))
    result = await MagpieTTS("http://magpie/").synthesize("Xin chào", "Aria", lang="vi")
    assert len(result) > 5000
    assert result.startswith(b"ID3") or result.startswith(b"\xff")
    assert json.loads(requests[0].content)["language"] == "vi"
