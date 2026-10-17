from app.models.language import Language
from app.repositories.language_repo import LanguageRepository

DEFAULT_LANGUAGES = (
    Language("vi", "vi-VN", "Tiếng Việt", is_source=True),
    Language("en", "en-US", "English"),
    Language("zh", "zh-CN", "中文"),
    Language("ja", "ja-JP", "日本語"),
    Language("ko", "ko-KR", "한국어"),
)


class LanguageService:
    def __init__(self, repo: LanguageRepository) -> None:
        self._repo = repo

    async def list_active(self) -> list[Language]:
        return await self._repo.list_active()

    async def seed_defaults(self) -> None:
        for lang in DEFAULT_LANGUAGES:
            await self._repo.upsert(lang)
