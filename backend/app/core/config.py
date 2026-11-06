from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Cấu hình đọc từ .env — thiếu secret thì fail-fast khi khởi động."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_env: str = "dev"
    database_url: str
    redis_url: str
    jwt_secret: str
    storage_dir: str = "./var/storage"
    tts_provider: str = "edge"
    translate_provider: str = "mock"  # chỉ để chạy thử; nhà cung cấp thật chưa chốt (PRD Q-05)
    # Chỉ dùng khi APP_ENV=dev: seed sẵn 1 tài khoản admin để đăng nhập thử
    dev_admin_email: str | None = None
    dev_admin_password: str | None = None

    # Hằng số then chốt (chương 12)
    access_token_ttl_s: int = 15 * 60
    refresh_token_ttl_s: int = 30 * 24 * 3600
    login_rate_limit: int = 5  # số lần đăng nhập sai tối đa / IP / cửa sổ
    login_rate_window_s: int = 60
    playback_retention_days: int = 180
    purge_interval_s: int = 3600
    tts_concurrency: int = 4
    comet_qe_min: float = 0.80
    asr_wer_max: float = 0.08
    supported_langs: tuple[str, ...] = ("vi", "en", "zh", "ja", "ko")


@lru_cache
def get_settings() -> Settings:
    return Settings()
