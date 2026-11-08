"""Application configuration.

Settings are loaded from environment variables (see `.env.example`). Behavior
branches explicitly on `environment` (development/staging/production) per the
production-configuration design in the project plan - see ARCHITECTURE.md.
"""

from enum import StrEnum
from functools import lru_cache
from typing import Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Environment(StrEnum):
    """The deployment environment the application is running in."""

    DEVELOPMENT = "development"
    STAGING = "staging"
    PRODUCTION = "production"
    TEST = "test"


class Settings(BaseSettings):
    """Central, environment-driven application settings.

    Required production secrets (`jwt_secret_key`, `database_url`) are
    validated at startup rather than failing confusingly on first use.
    """

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    environment: Environment = Environment.DEVELOPMENT
    app_name: str = "Life API"

    database_url: str = Field(
        default="postgresql+asyncpg://life:life@localhost:5432/life_dev"
    )
    database_pool_size: int = 5
    database_max_overflow: int = 5

    jwt_secret_key: str = "dev-only-insecure-secret-change-me"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 30

    csrf_cookie_name: str = "csrf_token"
    access_cookie_name: str = "access_token"
    refresh_cookie_name: str = "refresh_token"
    cookie_domain: str | None = None
    cookie_secure: bool = True
    cookie_samesite: Literal["lax", "strict", "none"] = "lax"

    # Comma-separated in the env var; exposed as a list via `allowed_origins`.
    allowed_origins_raw: str = Field(default="http://localhost:5173", alias="ALLOWED_ORIGINS")

    rate_limit_storage_uri: str = "memory://"
    # Disable only for local E2E runs; always on in production.
    rate_limit_enabled: bool = True

    s3_endpoint_url: str | None = None
    s3_bucket_name: str = "life-avatars"
    s3_access_key: str | None = None
    s3_secret_key: str | None = None
    s3_region: str = "auto"
    s3_public_base_url: str | None = None

    log_level: str = "INFO"
    log_file: str | None = None
    log_json: bool | None = None
    max_request_body_bytes: int = 12 * 1024 * 1024

    @property
    def log_json_enabled(self) -> bool:
        return self.is_production if self.log_json is None else self.log_json

    @field_validator("database_url", mode="before")
    @classmethod
    def _normalize_database_url(cls, value: str) -> str:
        """Hosted Postgres (Render, Heroku-style) hands over `postgres://` or
        `postgresql://`; SQLAlchemy needs the explicit asyncpg driver."""
        if value.startswith("postgres://"):
            return value.replace("postgres://", "postgresql+asyncpg://", 1)
        if value.startswith("postgresql://"):
            return value.replace("postgresql://", "postgresql+asyncpg://", 1)
        return value

    @property
    def allowed_origins(self) -> list[str]:
        return [origin.strip() for origin in self.allowed_origins_raw.split(",") if origin.strip()]

    @property
    def is_production(self) -> bool:
        return self.environment == Environment.PRODUCTION

    @property
    def is_development(self) -> bool:
        return self.environment == Environment.DEVELOPMENT

    @property
    def docs_enabled(self) -> bool:
        return self.environment in (Environment.DEVELOPMENT, Environment.TEST)

    def validate_production_secrets(self) -> None:
        """Fail fast at startup if a production deployment is missing secrets."""
        if self.environment in (Environment.DEVELOPMENT, Environment.TEST):
            return
        if self.jwt_secret_key == "dev-only-insecure-secret-change-me":
            raise RuntimeError("JWT_SECRET_KEY must be set to a strong secret in production")
        if self.is_production and "life:life@localhost" in self.database_url:
            raise RuntimeError("DATABASE_URL must point at the production database")


@lru_cache
def get_settings() -> Settings:
    """Return the process-wide cached Settings instance."""
    return Settings()
