from functools import lru_cache
from typing import Literal

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    environment: Literal["development", "test", "staging", "production"] = "development"
    app_name: str = "BookIt API"
    app_version: str = "0.1.0"
    debug: bool = False
    log_level: str = "INFO"

    database_url: str = Field(
        default="postgresql+asyncpg://bookit:bookit_dev_password@localhost:5432/bookit",
        description="Async SQLAlchemy PostgreSQL connection string",
    )
    test_database_url: str = Field(
        default="postgresql+asyncpg://bookit:bookit_dev_password@localhost:5432/bookit_test",
    )

    jwt_secret_key: str = "dev-only-jwt-secret-change-in-production-32bytes"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 30
    csrf_secret_key: str = "dev-only-csrf-secret-change-in-production-32bytes"

    cookie_secure: bool = False
    cookie_samesite: Literal["lax", "strict", "none"] = "lax"
    cookie_domain: str | None = None

    cors_origins: str = "http://localhost:3000,http://127.0.0.1:3000"

    auth_rate_limit_max_attempts: int = 15
    auth_rate_limit_window_seconds: int = 60

    payment_provider: Literal["sandbox_unconfigured", "sandbox", "stripe"] = "sandbox_unconfigured"
    payment_webhook_secret: str = "dev-only-webhook-secret-change-in-production"
    stripe_secret_key: str | None = None

    email_provider: Literal["log_only", "smtp"] = "log_only"
    push_provider: Literal["log_only", "fcm"] = "log_only"
    smtp_host: str | None = None
    smtp_port: int = 587
    smtp_user: str | None = None
    smtp_password: str | None = None
    fcm_server_key: str | None = None

    @field_validator("cookie_domain", mode="before")
    @classmethod
    def empty_str_to_none(cls, value: str | None) -> str | None:
        if value is not None and value.strip() == "":
            return None
        return value

    @model_validator(mode="after")
    def validate_production_secrets(self) -> "Settings":
        if self.environment in ("staging", "production"):
            insecure_markers = ("replace-with", "dev-only", "change-me", "secret")
            if len(self.jwt_secret_key) < 32 or any(m in self.jwt_secret_key.lower() for m in insecure_markers):
                raise ValueError("JWT_SECRET_KEY must be a strong 32+ character secret in staging/production")
            if len(self.csrf_secret_key) < 32 or any(m in self.csrf_secret_key.lower() for m in insecure_markers):
                raise ValueError("CSRF_SECRET_KEY must be a strong 32+ character secret in staging/production")
            if not self.cookie_secure:
                raise ValueError("COOKIE_SECURE must be true in staging/production")
            if "*" in self.cors_origins_list:
                raise ValueError("Wildcard CORS origins are forbidden with credentialed cookies")
        return self

    @property
    def cors_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
