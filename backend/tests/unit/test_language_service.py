from app.models.language import Language
from app.services.language_service import DEFAULT_LANGUAGES, LanguageService


class FakeLanguageRepo:
    def __init__(self) -> None:
        self.items: dict[str, Language] = {}

    async def list_active(self) -> list[Language]:
        return sorted((x for x in self.items.values() if x.is_active), key=lambda x: x.code)

    async def upsert(self, lang: Language) -> None:
        self.items[lang.code] = lang


async def test_seed_defaults_is_idempotent() -> None:
    repo = FakeLanguageRepo()
    svc = LanguageService(repo)
    await svc.seed_defaults()
    await svc.seed_defaults()
    langs = await svc.list_active()
    assert [x.code for x in langs] == sorted(x.code for x in DEFAULT_LANGUAGES)
    assert [x.code for x in langs if x.is_source] == ["vi"]
