from app.integrations.translate.base import GlossaryTerm


class MockTranslate:
    """Chỉ để chạy thử luồng: không dịch thật, chỉ áp thuật ngữ và gắn tiền tố ngôn ngữ."""

    name = "mock"

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
        for t in terms:
            text = text.replace(t.term, t.translation)
        return f"[{target}] {text}"
