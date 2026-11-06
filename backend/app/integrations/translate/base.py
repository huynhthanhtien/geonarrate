from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True)
class GlossaryTerm:
    term: str
    translation: str
    is_required: bool


class TranslateProvider(Protocol):
    """Port dịch máy; nhà cung cấp thật chưa chốt (PRD Q-05)."""

    name: str

    async def translate(
        self, text: str, source: str, target: str, terms: list[GlossaryTerm]
    ) -> str: ...
