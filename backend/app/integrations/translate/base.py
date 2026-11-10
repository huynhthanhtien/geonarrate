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
        self,
        text: str,
        source: str,
        target: str,
        terms: list[GlossaryTerm],
        *,
        source_tag: str | None = None,
        target_tag: str | None = None,
    ) -> str:
        """source/target là mã ngắn (vi, en); *_tag là mã BCP 47 trong bảng languages."""
        ...
