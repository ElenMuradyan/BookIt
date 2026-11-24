from functools import lru_cache
from typing import Literal

from pydantic import AliasChoices, Field, field_validator, model_validator
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
    direct_database_url: str | None = Field(
        default=None,
        validation_alias=AliasChoices("DIRECT_DATABASE_URL", "DIRECT_URL"),
        description="Optional direct (unpooled) PostgreSQL URL for Alembic migrations (e.g. Neon direct host)",
    )
    test_database_url: str = Field(
        default="postgresql+asyncpg://bookit:bookit_dev_password@localhost:5432/bookit_test",
    )
    db_pool_size: int = 5
    db_max_overflow: int = 10
    db_pool_recycle: int = 300
    db_use_null_pool: bool = False

    jwt_secret_key: str = "dev-only-jwt-secret-change-in-production-32bytes"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 30
    csrf_secret_key: str = "dev-only-csrf-secret-change-in-production-32bytes"

    cookie_secure: bool = False
    cookie_samesite: Literal["lax", "strict", "none"] = "lax"
    cookie_domain: str | None = None

    cors_origins: str = "http://localhost:3000,http://127.0.0.1:3000"
    frontend_base_url: str = "http://localhost:3000"

    auth_rate_limit_max_attempts: int = 15
    auth_rate_limit_window_seconds: int = 60
    verification_resend_cooldown_seconds: int = 60
    trust_proxy_headers: bool = False

    payment_provider: Literal["sandbox_unconfigured", "sandbox", "stripe"] = "sandbox_unconfigured"
    payment_webhook_secret: str = "dev-only-webhook-secret-change-in-production"
    stripe_secret_key: str | None = None

    email_provider: Literal["log_only", "smtp", "resend"] = "log_only"
    email_from: str | None = None
    push_provider: Literal["log_only", "fcm"] = "log_only"
    smtp_host: str | None = None
    smtp_port: int = 587
    smtp_user: str | None = None
    smtp_password: str | None = None
    smtp_use_tls: bool = True
    resend_api_key: str | None = None
    resend_api_base_url: str = "https://api.resend.com"
    fcm_server_key: str | None = None

    @field_validator(
        "cookie_domain",
        "direct_database_url",
        "email_from",
        "smtp_host",
        "smtp_user",
        "smtp_password",
        "resend_api_key",
        mode="before",
    )
    @classmethod
    def empty_str_to_none(cls, value: str | None) -> str | None:
        if value is not None and value.strip() == "":
            return None
        return value

    @model_validator(mode="after")
    def resolve_and_validate_settings(self) -> "Settings":
        # If EMAIL_PROVIDER was not explicitly specified, prefer configured transactional credentials outside tests
        if "email_provider" not in self.model_fields_set and self.environment != "test":
            if self.resend_api_key:
                self.email_provider = "resend"
            elif self.smtp_host:
                self.email_provider = "smtp"

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
            if self.email_provider == "resend" and (not self.resend_api_key or not self.email_from):
                raise ValueError("RESEND_API_KEY and EMAIL_FROM are required when EMAIL_PROVIDER=resend")
            if self.email_provider == "smtp" and (not self.smtp_host or not self.email_from):
                raise ValueError("SMTP_HOST and EMAIL_FROM are required when EMAIL_PROVIDER=smtp")
        return self

    @property
    def cors_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
