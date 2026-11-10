from types import SimpleNamespace
from typing import Any

import pytest

from app.integrations import quality


@pytest.mark.parametrize(
    ("reference", "hypothesis", "expected"),
    [
        ("Hello, WORLD!", "hello world", 0),
        ("a b", "a c", 0.5),
        ("a b", "a", 0.5),
        ("a", "a b", 1),
        ("", "", 0),
        ("", "a", 1),
        ("你好世界", "你好世", 0.25),
        ("Xin chào", "xin chào!", 0),
    ],
)
def test_word_error_rate(reference: str, hypothesis: str, expected: float) -> None:
    assert quality.word_error_rate(reference, hypothesis) == expected


async def test_disabled_quality_is_not_fake_score() -> None:
    evaluator = quality.LocalQuality()
    assert await evaluator.audio_wer("text", b"audio", "en") is None


async def test_models_run_with_correct_inputs(monkeypatch: pytest.MonkeyPatch) -> None:
    class Whisper:
        def transcribe(self, audio: Any, **kwargs: Any) -> Any:
            assert audio.read() == b"audio"
            assert kwargs["language"] == "vi"
            return iter([SimpleNamespace(text="xin chào")]), None

    monkeypatch.setattr(quality, "_whisper_model", lambda _: Whisper())
    evaluator = quality.LocalQuality("asr")
    assert await evaluator.audio_wer("Xin chào!", b"audio", "vi") == 0
