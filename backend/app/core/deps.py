from app.core.database import get_db
from app.repositories.language_repo import MongoLanguageRepository
from app.services.language_service import LanguageService


def get_language_service() -> LanguageService:
    return LanguageService(MongoLanguageRepository(get_db()))
