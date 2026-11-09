"""Đánh giá cục bộ tuỳ chọn; model chỉ được nạp trong worker khi bật cấu hình."""

import asyncio
import importlib
import io
import math
import re
import unicodedata
from functools import lru_cache
from typing import Any


def word_error_rate(reference: str, hypothesis: str) -> float:
    def tokens(value: str) -> list[str]:
        value = unicodedata.normalize("NFKC", value).casefold()
        # Tách từng ký tự Hán/Nhật để câu không có dấu cách vẫn so sánh được.
        value = re.sub(r"([\u3040-\u30ff\u3400-\u9fff])", r" \1 ", value)
        return re.findall(r"\w+", value)

    expected, actual = tokens(reference), tokens(hypothesis)
    if not expected:
        return float(len(actual))
    previous = list(range(len(actual) + 1))
    for i, token in enumerate(expected, 1):
        current = [i]
        for j, other in enumerate(actual, 1):
            current.append(
                min(current[-1] + 1, previous[j] + 1, previous[j - 1] + (token != other))
            )
        previous = current
    return previous[-1] / len(expected)


@lru_cache(maxsize=1)
def _comet_model(checkpoint: str) -> Any:
    comet = importlib.import_module("comet")
    return comet.load_from_checkpoint(comet.download_model(checkpoint))


@lru_cache(maxsize=1)
def _whisper_model(checkpoint: str) -> Any:
    whisper = importlib.import_module("faster_whisper")
    return whisper.WhisperModel(checkpoint, device="cpu", compute_type="int8")


class LocalQuality:
    def __init__(self, comet_model: str = "", whisper_model: str = "") -> None:
        self._comet = comet_model
        self._whisper = whisper_model

    async def translation_score(self, source: str, translation: str) -> float | None:
        if not self._comet:
            return None

        def evaluate() -> float:
            output = _comet_model(self._comet).predict(
                [{"src": source, "mt": translation}], batch_size=1, gpus=0
            )
            score = float(output.scores[0])
            if not math.isfinite(score):
                raise RuntimeError("COMET trả về điểm không hợp lệ")
            return score

        return await asyncio.to_thread(evaluate)

    async def audio_wer(self, text: str, audio: bytes, lang: str) -> float | None:
        if not self._whisper:
            return None

        def evaluate() -> float:
            segments, _ = _whisper_model(self._whisper).transcribe(
                io.BytesIO(audio), language=lang, beam_size=5
            )
            return word_error_rate(text, " ".join(segment.text for segment in segments))

        return await asyncio.to_thread(evaluate)
