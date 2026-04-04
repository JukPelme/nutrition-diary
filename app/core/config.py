from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    app_name: str = "Nutrition Diary API"
    version: str = "0.1.0"
    debug: bool = True

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

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
