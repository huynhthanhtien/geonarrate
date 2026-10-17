from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Cấu hình đọc từ .env — thiếu secret thì fail-fast khi khởi động."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_env: str = "dev"
    mongo_uri: str
    mongo_db: str
    redis_url: str
    jwt_secret: str
    storage_dir: str = "./var/storage"
    tts_provider: str = "edge"

    # Hằng số then chốt (chương 12)
    access_token_ttl_s: int = 15 * 60
    refresh_token_ttl_s: int = 30 * 24 * 3600
    segment_max_chars: int = 600
    tts_concurrency: int = 4
    comet_qe_min: float = 0.80
    asr_wer_max: float = 0.08
    supported_langs: tuple[str, ...] = ("vi", "en", "zh", "ja", "ko")


@lru_cache
def get_settings() -> Settings:
    return Settings()
