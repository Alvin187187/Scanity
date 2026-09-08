"""Configure BackEnd/.env locally without putting a password in shell history."""

from getpass import getpass
import os
from pathlib import Path
import secrets
import shutil

from dotenv import set_key
from sqlalchemy.engine import make_url
from sqlalchemy.exc import ArgumentError


BACKEND_DIR = Path(__file__).resolve().parents[1]


def parse_session_pooler_uri(value: str):
    value = value.strip()
    if value.startswith("postgres://"):
        value = "postgresql://" + value[len("postgres://"):]
    try:
        url = make_url(value)
    except (ArgumentError, ValueError):
        raise ValueError("Copy a PostgreSQL URI from Supabase Connect > Session pooler.") from None
    if url.drivername not in {"postgresql", "postgresql+psycopg"}:
        raise ValueError("Choose the PostgreSQL URI, not a dashboard or API URL.")
    if not url.host or not url.host.endswith(".pooler.supabase.com") or url.port != 5432:
        raise ValueError("Choose Session pooler: a pooler.supabase.com host on port 5432.")
    if not url.username or not url.database:
        raise ValueError("The URI must include the database username and database name.")
    return url


def configure_env(uri: str, password: str, env_path: Path, template_path: Path):
    url = parse_session_pooler_uri(uri)
    if not password:
        raise ValueError("The database password cannot be empty.")
    # SQLAlchemy encodes password punctuation such as @, #, %, and / correctly.
    url = url.set(drivername="postgresql+psycopg", password=password)
    url = url.update_query_dict({"sslmode": "require"})
    if not env_path.exists():
        shutil.copyfile(template_path, env_path)
        set_key(str(env_path), "SECRET_KEY", secrets.token_hex(32))
    set_key(str(env_path), "DATABASE_URL", url.render_as_string(hide_password=False))
    if os.name != "nt":
        env_path.chmod(0o600)


def main() -> int:
    print("Open Supabase > Connect > Session pooler > URI.")
    print("Copy the URI while its password is still [YOUR-PASSWORD].")
    try:
        uri = input("Session pooler URI: ")
        parse_session_pooler_uri(uri)
        password = getpass("Database password (typing is hidden): ")
        configure_env(uri, password, BACKEND_DIR / ".env", BACKEND_DIR / ".env.example")
    except ValueError as exc:
        print(f"Setup could not continue: {exc}")
        return 1
    except OSError:
        print("Could not save BackEnd/.env. Check that the folder is writable and .env.example exists.")
        return 1
    except (EOFError, KeyboardInterrupt):
        print("\nSetup cancelled.")
        return 1
    print("Saved DATABASE_URL in BackEnd/.env. Existing other settings were preserved.")
    print("This saved the settings; it has not tested the connection yet.")
    print("Next: python -m scripts.check_database")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
