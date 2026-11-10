from functools import lru_cache
from typing import Literal

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Cấu hình đọc từ .env — thiếu secret thì fail-fast khi khởi động."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_env: str = "dev"
    database_url: str
    redis_url: str
    jwt_secret: str
    storage_dir: str = "./var/storage"
    storage_provider: Literal["local", "s3"] = "local"
    s3_bucket: str = ""
    s3_endpoint_url: str = ""
    tts_provider: Literal["edge", "magpie", "azure"] = "edge"
    azure_speech_key: str = ""
    azure_speech_region: str = ""
    magpie_tts_url: str = "http://127.0.0.1:18081"
    magpie_tts_voice: str = "Aria"
    magpie_tts_autostart: bool = True
    magpie_tts_device: Literal["cpu", "cuda"] = "cpu"
    translate_provider: Literal["mock", "libretranslate", "groq"] = "mock"
    libretranslate_url: str = "http://127.0.0.1:5000"
    libretranslate_api_key: str = ""
    groq_api_key: str = ""
    groq_model: str = "openai/gpt-oss-20b"
    comet_model: str = ""  # Model QE (không cần reference); rỗng = chưa chấm
    whisper_model: str = ""  # Model faster-whisper; rỗng = chưa chấm
    cors_origins: tuple[str, ...] = ("http://localhost:5173",)
    # Chỉ dùng khi APP_ENV=dev: seed sẵn 1 tài khoản admin để đăng nhập thử
    dev_admin_email: str | None = None
    dev_admin_password: str | None = None

    # Hằng số then chốt (chương 12)
    access_token_ttl_s: int = 15 * 60
    refresh_token_ttl_s: int = 30 * 24 * 3600
    login_rate_limit: int = 5  # số lần đăng nhập sai tối đa / IP / cửa sổ
    login_rate_window_s: int = 60
    public_rate_limit: int = 300
    public_activate_rate_limit: int = 10
    public_rate_window_s: int = 60
    playback_retention_days: int = 180
    purge_interval_s: int = 3600
    tts_concurrency: int = 4
    comet_qe_min: float = 0.80
    asr_wer_max: float = 0.08
    supported_langs: tuple[str, ...] = ("vi", "en", "zh", "ja", "ko")

    @model_validator(mode="after")
    def validate_runtime(self) -> "Settings":
        if self.storage_provider == "s3" and not self.s3_bucket:
            raise ValueError("STORAGE_PROVIDER=s3 cần S3_BUCKET")
        if self.app_env == "production" and len(self.jwt_secret.encode()) < 32:
            raise ValueError("Production cần JWT_SECRET ít nhất 32 byte ngẫu nhiên")
        if self.tts_provider == "azure" and (
            not self.azure_speech_key or not self.azure_speech_region
        ):
            raise ValueError("Azure TTS cần AZURE_SPEECH_KEY và AZURE_SPEECH_REGION")
        if self.translate_provider == "groq" and not self.groq_api_key:
            raise ValueError("Groq Translate cần GROQ_API_KEY")
        for value in (
            self.public_rate_limit,
            self.public_activate_rate_limit,
            self.public_rate_window_s,
        ):
            if value <= 0:
                raise ValueError("Hạn mức và cửa sổ rate limit phải lớn hơn 0")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
