import os
from pydantic_settings import BaseSettings
from pydantic import field_validator


def _normalize_db_url(url: str) -> str:
    if url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql://", 1)
    if url.startswith("postgresql://"):
        url = url.replace("postgresql://", "postgresql+asyncpg://", 1)
    return url


class Settings(BaseSettings):
    app_name: str = "Nutrition Diary API"
    version: str = "0.1.0"
    debug: bool = False
    sql_echo: bool = False  # never tie SQL echo to debug — it logs bind params (password hashes, diary data)

    # Database
    database_url: str = "sqlite+aiosqlite:///nutrition_diary.db"

    # Redis
    redis_url: str = "redis://localhost:6379/0"

    # Auth
    secret_key: str = "change-me-in-production"
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 30
    bot_token: str = "change-me-bot-token"
    algorithm: str = "HS256"

    # API
    api_v1_prefix: str = "/api/v1"

    # Food recognition
    anthropic_api_key: str | None = None
    logmeal_api_key: str | None = None
    deepgram_api_key: str | None = None

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}

    @field_validator("database_url", mode="after")
    @classmethod
    def normalize_db(cls, v: str) -> str:
        return _normalize_db_url(v)


settings = Settings()

# Fail-fast: never let a real server deployment boot with the default secret key.
# Keyed on a non-SQLite (server/Postgres) database rather than DEBUG, so a deploy
# that forgot both SECRET_KEY and DEBUG can't silently sign JWTs with a known key.
# Desktop builds run on SQLite (local, single-user) and are intentionally exempt.
_is_server_db = "sqlite" not in settings.database_url
if _is_server_db and settings.secret_key == "change-me-in-production":
    raise RuntimeError(
        "SECRET_KEY is still the insecure default on a server database. "
        "Set a strong SECRET_KEY env var before running in production."
    )
