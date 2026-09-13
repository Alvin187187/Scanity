"""Configure BackEnd/.env for local PostgreSQL or Supabase PostgreSQL."""

from getpass import getpass
import os
from pathlib import Path
import secrets
import shutil

from dotenv import set_key
from sqlalchemy.engine import make_url
from sqlalchemy.exc import ArgumentError


BACKEND_DIR = Path(__file__).resolve().parents[1]


def parse_postgres_uri(value: str):
    value = value.strip()

    if value.startswith("postgres://"):
        value = "postgresql://" + value[len("postgres://"):]

    try:
        url = make_url(value)
    except (ArgumentError, ValueError):
        raise ValueError("Enter a valid PostgreSQL connection URI.") from None

    if url.drivername not in {"postgresql", "postgresql+psycopg"}:
        raise ValueError("The connection must use PostgreSQL.")

    if not url.host:
        raise ValueError("The PostgreSQL URI must include a host.")

    if not url.username:
        raise ValueError("The PostgreSQL URI must include a username.")

    if not url.database:
        raise ValueError("The PostgreSQL URI must include a database name.")

    host = url.host.lower()
    port = url.port or 5432

    local_hosts = {"localhost", "127.0.0.1", "::1"}
    is_local = host in local_hosts
    is_supabase = host.endswith(".pooler.supabase.com")

    if not is_local and not is_supabase:
        raise ValueError(
            "Use local PostgreSQL or a Supabase Session pooler connection."
        )

    if port != 5432:
        raise ValueError(
            "Local PostgreSQL and the Supabase Session pooler must use port 5432."
        )

    return url


def configure_env(uri: str, password: str, env_path: Path, template_path: Path):
    url = parse_postgres_uri(uri)

    if not password:
        raise ValueError("The database password cannot be empty.")

    url = url.set(
        drivername="postgresql+psycopg",
        password=password,
    )

    host = (url.host or "").lower()

    # Supabase requires SSL.
    if host.endswith(".pooler.supabase.com"):
        url = url.update_query_dict({"sslmode": "require"})

    # Local PostgreSQL should not require SSL for school/offline use.
    elif host in {"localhost", "127.0.0.1", "::1"}:
        url = url.update_query_dict({"sslmode": "disable"})

    if not env_path.exists():
        shutil.copyfile(template_path, env_path)
        set_key(str(env_path), "SECRET_KEY", secrets.token_hex(32))

    set_key(
        str(env_path),
        "DATABASE_URL",
        url.render_as_string(hide_password=False),
    )

    if os.name != "nt":
        env_path.chmod(0o600)


def main() -> int:
    print("Configure Scanity PostgreSQL.")
    print()
    print("Local example:")
    print("postgresql://postgres@localhost:5432/scanity")
    print()
    print("A Supabase Session Pooler URI can also be used when needed.")

    try:
        uri = input("PostgreSQL URI: ")
        parse_postgres_uri(uri)

        password = getpass("Database password (typing is hidden): ")

        configure_env(
            uri,
            password,
            BACKEND_DIR / ".env",
            BACKEND_DIR / ".env.example",
        )

    except ValueError as exc:
        print(f"Setup could not continue: {exc}")
        return 1

    except OSError:
        print(
            "Could not save BackEnd/.env. "
            "Check that the folder is writable and .env.example exists."
        )
        return 1

    except (EOFError, KeyboardInterrupt):
        print("\nSetup cancelled.")
        return 1

    print("Saved DATABASE_URL in BackEnd/.env.")
    print("Existing other settings were preserved.")
    print("The connection has not been tested yet.")
    print("Next: python -m scripts.check_database")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())