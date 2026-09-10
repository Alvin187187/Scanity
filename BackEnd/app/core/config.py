from pathlib import Path

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy.engine import make_url
from sqlalchemy.exc import ArgumentError


BACKEND_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    PROJECT_NAME: str = "Scanity API"
    DATABASE_URL: str = Field(repr=False)
    SECRET_KEY: str = Field(repr=False)
    SUPABASE_URL: str
    SUPABASE_KEY: str = Field(repr=False)
    SUPABASE_JWT_SECRET: str = Field(repr=False)
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    OLLAMA_HOST: str
    OPENFOODFACTS_API: str

    DATABASE_CONNECT_TIMEOUT: int = Field(default=10, ge=1, le=60)
    DATABASE_POOL_SIZE: int = Field(default=5, ge=1, le=20)
    DATABASE_MAX_OVERFLOW: int = Field(default=0, ge=0, le=20)
    DATABASE_POOL_TIMEOUT: int = Field(default=10, ge=1, le=60)

    model_config = SettingsConfigDict(
        env_file=BACKEND_DIR / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
        hide_input_in_errors=True,
    )

    @field_validator("DATABASE_URL")
    @classmethod
    def validate_database_url(cls, value: str) -> str:
        value = value.strip()
        if value.startswith("postgres://"):
            value = "postgresql+psycopg://" + value[len("postgres://"):]
        elif value.startswith("postgresql://"):
            value = "postgresql+psycopg://" + value[len("postgresql://"):]
        try:
            url = make_url(value)
        except (ArgumentError, ValueError):
            raise ValueError("DATABASE_URL is invalid; run python -m scripts.configure_database.") from None
        if url.drivername not in {"sqlite", "sqlite+pysqlite", "postgresql+psycopg"}:
            raise ValueError("Use a sqlite:/// URL or a postgresql+psycopg:// URL.")
        if url.get_backend_name() == "postgresql":
            if not url.host or not url.username or not url.database:
                raise ValueError("The PostgreSQL URL needs a host, username, and database name.")
            if url.port is not None and not 1 <= url.port <= 65535:
                raise ValueError("The PostgreSQL port must be between 1 and 65535.")
            if any(marker in value for marker in ("YOUR_", "YOUR-", "[YOUR", "REPLACE_")):
                raise ValueError("Replace the DATABASE_URL placeholders with your connection details.")
        elif url.database and url.database != ":memory:" and not Path(url.database).is_absolute():
            # Keep the same SQLite file even when Uvicorn starts from another folder.
            url = url.set(database=str((BACKEND_DIR / url.database).resolve()))
        return url.render_as_string(hide_password=False)


settings = Settings()
