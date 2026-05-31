from pydantic_settings import BaseSettings, SettingsConfigDict
from functools import lru_cache


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # Database — Supabase PostgreSQL
    DATABASE_URL: str = "postgresql+asyncpg://postgres:password@db.xxxx.supabase.co:5432/postgres"

    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"

    # JWT
    SECRET_KEY: str = "change-me-to-a-256-bit-secret"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # Anthropic
    ANTHROPIC_API_KEY: str = ""

    # OpenAI (AI task generator, risk analysis, writing assist)
    OPENAI_API_KEY: str = ""
    AI_DAILY_LIMIT: int = 10

    # GitHub
    GITHUB_WEBHOOK_SECRET: str = ""
    GITHUB_TOKEN: str = ""

    # Email
    EMAIL_API_KEY: str = ""
    EMAIL_API_URL: str = "https://api.resend.com/emails"
    FROM_EMAIL: str = "noreply@projecthub.app"

    # App
    FRONTEND_URL: str = "http://localhost:3000"
    APP_NAME: str = "ProjectHub"
    ENV: str = "development"
    ALLOWED_ORIGINS: str = ""  # Comma-separated list for production CORS
    SENTRY_DSN: str = ""

    # Google OAuth (optional)
    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""
    GOOGLE_REDIRECT_URI: str = "http://localhost:8000/api/auth/google/callback"

    # GitHub OAuth (optional)
    GITHUB_CLIENT_ID: str = ""
    GITHUB_CLIENT_SECRET: str = ""
    GITHUB_REDIRECT_URI: str = "http://localhost:8000/api/auth/github/callback"


@lru_cache()
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
