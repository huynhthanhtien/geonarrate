import pytest

from app.services.content_service import qa_flags


@pytest.mark.parametrize(
    "translated",
    [
        "Ben Thanh Market",
        "Ben\u202fThanh\u202fMarket",
        "BEN\u00a0THANH   MARKET",
        "Ben\u200b Thanh Market",
    ],
)
def test_glossary_matches_unicode_whitespace_and_case(translated: str) -> None:
    terms = [{"term": "Chợ Bến Thành", "translation": "Ben Thanh Market"}]
    assert qa_flags("Chợ Bến Thành", translated, terms, "groq") == []


def test_glossary_still_flags_missing_translation() -> None:
    terms = [{"term": "Chợ Bến Thành", "translation": "Ben Thanh Market"}]
    assert qa_flags("Chợ Bến Thành", "Saigon market", terms, "groq") == [
        "missing_term:Chợ Bến Thành"
    ]


def test_glossary_matches_composed_and_decomposed_vietnamese() -> None:
    terms = [{"term": "Chợ Bến Thành", "translation": "Ben Thanh Market"}]
    assert qa_flags("Cho\u031b\u0323 Be\u0302\u0301n Tha\u0300nh", "other", terms, None) == [
        "missing_term:Chợ Bến Thành"
    ]
