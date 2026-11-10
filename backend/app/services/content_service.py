"""UC-05 dịch và duyệt bản dịch, UC-06 thuật ngữ."""

from collections.abc import Callable
from datetime import UTC, datetime
from typing import Any
from unicodedata import normalize

from app.core.exceptions import ConflictError, InvalidContentError, NotFoundError
from app.models.audit import AuditResource
from app.repositories.glossary_repo import SqlGlossaryRepository
from app.repositories.job_repo import job_spec, text_hash
from app.repositories.translation_repo import SqlTranslationRepository
from app.services.audit_service import AuditService


def _utcnow() -> datetime:
    return datetime.now(UTC)


def _normalize_term(value: str) -> str:
    value = normalize("NFKC", value).casefold()
    value = value.translate(dict.fromkeys(map(ord, "\u200b\ufeff")))
    return " ".join(value.split())


def _contains_term(text: str, term: str) -> bool:
    normalized_term = _normalize_term(term)
    return bool(normalized_term) and normalized_term in _normalize_term(text)


def qa_flags(
    source: str, text: str, terms: list[dict[str, Any]], provider: str | None
) -> list[str]:
    """Cờ để ưu tiên sửa: thiếu thuật ngữ, hoặc bản dịch giả chỉ dùng khi chạy thử."""
    flags = [
        f"missing_term:{t['term']}"
        for t in terms
        if _contains_term(source, t["term"]) and not _contains_term(text, t["translation"])
    ]
    if provider == "mock":
        flags.append("mock_translation")
    return flags


class ContentService:
    def __init__(
        self,
        translations: SqlTranslationRepository,
        glossary: SqlGlossaryRepository,
        audit: AuditService,
        clock: Callable[[], datetime] = _utcnow,
    ) -> None:
        self._translations = translations
        self._glossary = glossary
        self._audit = audit
        self._clock = clock

    async def list_translations(self, lang: str | None, status: str | None) -> list[dict[str, Any]]:
        rows = await self._translations.find(lang, status)
        for row in rows:
            terms = await self._glossary.for_translation(row["poi_id"], row["target_lang"])
            extras = [f for f in row["qa_flags"] if not f.startswith("missing_term:")]
            row["qa_flags"] = qa_flags(row["source_text"] or "", row["text"], terms, None) + extras
        return rows

    async def _get(self, translation_id: str) -> dict[str, Any]:
        row = await self._translations.get(translation_id)
        if row is None:
            raise NotFoundError("translation_not_found", "Không tìm thấy bản dịch")
        return row

    async def edit_translation(self, translation_id: str, text: str) -> dict[str, Any]:
        row = await self._get(translation_id)
        terms = await self._glossary.for_translation(row["poi_id"], row["target_lang"])
        flags = qa_flags(row["source_text"], text, terms, None)
        await self._translations.edit(translation_id, text, flags, text_hash(text), self._clock())
        return await self._get(translation_id)

    async def approve_translation(self, translation_id: str, actor_id: str) -> dict[str, Any]:
        row = await self._get(translation_id)
        terms = await self._glossary.for_translation(row["poi_id"], row["target_lang"])
        missing = [
            t["term"]
            for t in terms
            if t["is_required"]
            and _contains_term(row["source_text"] or "", t["term"])
            and not _contains_term(row["text"], t["translation"])
        ]
        if missing:
            raise InvalidContentError(
                "missing_required_terms", f"Bản dịch thiếu thuật ngữ bắt buộc: {', '.join(missing)}"
            )
        lang, aid = row["target_lang"], row["poi_id"]
        job = job_spec(
            "audio",
            f"audio:{aid}:{lang}:{text_hash(row['text'])}",
            {"poi_id": aid, "lang": lang},
        )
        now = self._clock()
        if not await self._translations.review(
            translation_id, "approved", None, actor_id, now, [job]
        ):
            raise ConflictError("translation_already_approved", "Bản dịch đã được duyệt")
        await self._audit.record(
            actor_id, "translation.approve", AuditResource("translation", translation_id)
        )
        return await self._get(translation_id)

    async def reject_translation(
        self, translation_id: str, note: str, actor_id: str
    ) -> dict[str, Any]:
        await self._get(translation_id)
        now = self._clock()
        if not await self._translations.review(translation_id, "rejected", note, actor_id, now):
            raise ConflictError("translation_already_approved", "Bản dịch đã được duyệt")
        await self._audit.record(
            actor_id, "translation.reject", AuditResource("translation", translation_id), note
        )
        return await self._get(translation_id)

    async def list_glossary(self, lang: str | None) -> list[dict[str, Any]]:
        return await self._glossary.find(lang)

    async def add_term(
        self,
        term: str,
        lang: str,
        translation: str,
        is_required: bool,
        poi_id: str | None,
        actor_id: str,
    ) -> dict[str, Any]:
        created = await self._glossary.insert(
            term, lang, translation, is_required, poi_id, actor_id, self._clock()
        )
        if created is None:
            raise ConflictError("term_exists", f"Thuật ngữ '{term}' đã có cho ngôn ngữ {lang}")
        await self._reflag(lang)
        return created

    async def delete_term(self, glossary_id: str, lang: str | None = None) -> None:
        if not await self._glossary.delete(glossary_id):
            raise NotFoundError("term_not_found", "Không tìm thấy thuật ngữ")

    async def _reflag(self, lang: str) -> None:
        """Thuật ngữ mới có thể làm bản dịch hiện có thành thiếu: gắn lại cờ cho bản chưa duyệt."""
        now = self._clock()
        for row in await self._translations.find(lang, None):
            if row["review_status"] == "approved":
                continue
            terms = await self._glossary.for_translation(row["poi_id"], lang)
            extras = [f for f in row["qa_flags"] if not f.startswith("missing_term:")]
            flags = qa_flags(row["source_text"], row["text"], terms, None) + extras
            await self._translations.set_flags(row["id"], flags, now)
