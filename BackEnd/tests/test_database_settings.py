from pathlib import Path
import importlib.util
import shutil

from dotenv import dotenv_values
from pydantic import ValidationError
import pytest
from sqlalchemy.engine import make_url

from app.core.config import BACKEND_DIR, Settings
from scripts.configure_database import configure_env


POOLER_URI = "postgresql://postgres.testproject:[YOUR-PASSWORD]@aws-0-test.pooler.supabase.com:5432/postgres"


@pytest.mark.parametrize("prefix", ["postgres", "postgresql", "postgresql+psycopg"])
def test_postgres_uris_select_the_installed_psycopg_driver(prefix):
    settings = Settings(_env_file=None, DATABASE_URL=f"{prefix}://user:password@localhost:5432/postgres")
    assert make_url(settings.DATABASE_URL).drivername == "postgresql+psycopg"


def test_sqlite_path_remains_in_backend_when_working_directory_changes(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    settings = Settings(_env_file=None, DATABASE_URL="sqlite:///./scanity.db")
    assert Path(make_url(settings.DATABASE_URL).database) == BACKEND_DIR / "scanity.db"


def test_env_is_loaded_from_backend_from_another_working_directory(tmp_path, monkeypatch):
    backend = tmp_path / "backend"
    config_path = backend / "app" / "core" / "config.py"
    config_path.parent.mkdir(parents=True)
    shutil.copyfile(BACKEND_DIR / "app" / "core" / "config.py", config_path)
    values = {
        "PROJECT_NAME": "Loaded from the backend env",
        "DATABASE_URL": "sqlite:///./scanity.db",
        "SECRET_KEY": "test-only-value",
        "OLLAMA_HOST": "http://localhost:11434",
        "OPENFOODFACTS_API": "https://example.invalid",
    }
    (backend / ".env").write_text("\n".join(f"{key}={value}" for key, value in values.items()))
    for key in values:
        monkeypatch.delenv(key, raising=False)
    monkeypatch.chdir(tmp_path)
    spec = importlib.util.spec_from_file_location("isolated_config", config_path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    assert module.settings.PROJECT_NAME == values["PROJECT_NAME"]
    assert Path(make_url(module.settings.DATABASE_URL).database) == backend / "scanity.db"


def test_invalid_database_url_does_not_appear_in_validation_errors():
    with pytest.raises(ValidationError) as captured:
        Settings(_env_file=None, DATABASE_URL="credential-canary-invalid-url")
    assert "credential-canary" not in str(captured.value)


def test_supabase_example_requires_real_connection_values():
    example = dotenv_values(BACKEND_DIR / ".env.example")
    with pytest.raises(ValidationError, match="placeholders"):
        Settings(_env_file=None, DATABASE_URL=example["DATABASE_URL"])


def test_setup_encodes_password_and_preserves_existing_other_values(tmp_path):
    env_path = tmp_path / ".env"
    env_path.write_text("# Team configuration\nSECRET_KEY=keep-this\nDATABASE_URL=sqlite:///./scanity.db\nCUSTOM_FLAG=yes\n", encoding="utf-8")
    password = "p@ss:/?#% with ${punctuation}'"
    configure_env(POOLER_URI, password, env_path, BACKEND_DIR / ".env.example")
    values = dotenv_values(env_path)
    url = make_url(values["DATABASE_URL"])
    assert url.password == password
    assert url.drivername == "postgresql+psycopg"
    assert url.query["sslmode"] == "require"
    assert values["SECRET_KEY"] == "keep-this"
    assert values["CUSTOM_FLAG"] == "yes"
    assert "# Team configuration" in env_path.read_text()


def test_setup_creates_env_with_a_new_application_secret(tmp_path):
    env_path = tmp_path / ".env"
    configure_env(POOLER_URI, "test-password", env_path, BACKEND_DIR / ".env.example")
    values = dotenv_values(env_path)
    assert len(values["SECRET_KEY"]) == 64
    assert values["PROJECT_NAME"] == "Scanity API"
    assert make_url(values["DATABASE_URL"]).password == "test-password"


@pytest.mark.parametrize("uri", [
    "https://supabase.com/dashboard/project/example",
    POOLER_URI.replace(":5432/", ":6543/"),
    POOLER_URI.replace("aws-0-test.pooler.supabase.com", "wrong.example.com"),
])
def test_invalid_setup_input_does_not_change_existing_env(uri, tmp_path):
    env_path = tmp_path / ".env"
    original = "DATABASE_URL=sqlite:///./scanity.db\nSECRET_KEY=keep-this\n"
    env_path.write_text(original)
    with pytest.raises(ValueError):
        configure_env(uri, "password", env_path, BACKEND_DIR / ".env.example")
    assert env_path.read_text() == original
