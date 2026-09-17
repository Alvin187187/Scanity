"""Verify local settings, Git exclusions, and a running FastAPI database check."""

import argparse
import json
import os
from pathlib import Path
import subprocess
from urllib.error import HTTPError, URLError
from urllib.request import urlopen


BACKEND_DIR = Path(__file__).resolve().parents[1]
REPO_DIR = BACKEND_DIR.parent
IGNORED_PROBES = (
    "BackEnd/.env",
    "BackEnd/.env.local",
    ".venv/ignore_probe.txt",
    "BackEnd/__pycache__/ignore_probe.pyc",
    "BackEnd/.pytest_cache/ignore_probe.txt",
    "BackEnd/scanity.db",
)


class VerificationError(RuntimeError):
    """Only use fixed, credential-free messages in this exception."""


def git_output(repo_dir: Path, *args: str, input_text: str | None = None) -> str:
    try:
        result = subprocess.run(
            ["git", "-C", str(repo_dir), *args],
            input=input_text, capture_output=True, text=True, timeout=10,
        )
    except (OSError, subprocess.TimeoutExpired):
        raise VerificationError("Git is unavailable. Run this in your local Git checkout with Git installed.") from None
    allowed = (0, 1) if args[0] == "check-ignore" else (0,)
    if result.returncode not in allowed:
        raise VerificationError("Git could not inspect this checkout. Check the project folder and Git access.")
    return result.stdout


def check_git_files(repo_dir: Path = REPO_DIR) -> list[str]:
    if not (repo_dir / ".gitignore").is_file():
        raise VerificationError("The repository root .gitignore is missing. Apply the database update.")
    template = "BackEnd/.env.example"
    if not (repo_dir / template).is_file():
        raise VerificationError("BackEnd/.env.example is missing. Apply the database update.")
    probes = (*IGNORED_PROBES, template)
    ignored = set(git_output(
        repo_dir, "check-ignore", "--no-index", "-z", "--stdin",
        input_text="\0".join(probes) + "\0",
    ).split("\0"))
    if any(path not in ignored for path in IGNORED_PROBES):
        raise VerificationError("Git exclusions are incomplete. Check the root .gitignore against the update.")
    if template in ignored:
        raise VerificationError(".env.example is ignored. Keep the !.env.example rule in .gitignore.")
    tracked_ignored = git_output(repo_dir, "ls-files", "--cached", "--ignored", "--exclude-standard", "-z")
    if tracked_ignored:
        raise VerificationError(
            "Git still tracks ignored files. Review git ls-files -ci --exclude-standard and the README cleanup steps."
        )
    return [
        "PASS: Git ignores .env, local env overrides, .venv, Python caches, pytest cache, and the local database",
        "PASS: .env.example is available to Git; no ignored files remain in the index",
    ]


def check_local_settings() -> list[str]:
    from app.core.config import settings
    from app.database.session import SessionLocal, engine

    if not (BACKEND_DIR / ".env").is_file():
        raise VerificationError("BackEnd/.env is missing. Run python -m scripts.configure_database.")
    if engine.dialect.name != "postgresql" or engine.dialect.driver != "psycopg":
        raise VerificationError("The local app settings do not select PostgreSQL with Psycopg 3. Check DATABASE_URL.")
    if SessionLocal.kw.get("bind") is not engine:
        raise VerificationError("The request session factory is not bound to the configured database engine.")
    if engine.pool.size() != settings.DATABASE_POOL_SIZE or engine.pool.timeout() != settings.DATABASE_POOL_TIMEOUT:
        raise VerificationError("The active engine pool does not match the configured size and wait timeout.")
    results = [
        "PASS: Local app settings select PostgreSQL/Psycopg 3 and the request sessions share its engine",
        "PASS: Engine pool size and wait timeout match the loaded settings",
        f"INFO: connect timeout={settings.DATABASE_CONNECT_TIMEOUT}s; pool size={settings.DATABASE_POOL_SIZE}; "
        f"max overflow={settings.DATABASE_MAX_OVERFLOW}; pool timeout={settings.DATABASE_POOL_TIMEOUT}s",
    ]
    overrides = [key for key in ("DATABASE_URL", "DATABASE_CONNECT_TIMEOUT", "DATABASE_POOL_SIZE",
                 "DATABASE_MAX_OVERFLOW", "DATABASE_POOL_TIMEOUT") if key in os.environ]
    if overrides:
        results.append("INFO: Process environment overrides .env for: " + ", ".join(overrides))
    return results


def check_api_health(url: str) -> list[str]:
    try:
        with urlopen(url, timeout=10) as response:
            status = response.status
            payload = json.loads(response.read(4096))
    except HTTPError as exc:
        status = exc.code
        exc.close()
        raise VerificationError(
            f"The API returned HTTP {status}. For 404, apply the update and restart; for 503, run scripts.check_database."
        ) from None
    except (URLError, OSError):
        raise VerificationError("The API is unreachable. Start Uvicorn from BackEnd and keep that terminal running.") from None
    except (ValueError, UnicodeError):
        raise VerificationError("The health endpoint did not return valid JSON. Check the API address.") from None
    if status != 200 or not isinstance(payload, dict) or payload.get("status") != "ok":
        raise VerificationError("The API did not report a healthy database connection.")
    if payload.get("database") != "postgresql":
        raise VerificationError("The running API is not reporting PostgreSQL. Save .env and restart Uvicorn.")
    return ["PASS: The running FastAPI /health/db endpoint executed a PostgreSQL query (HTTP 200)"]


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", default="http://127.0.0.1:8000/health/db", help="Database health endpoint URL")
    args = parser.parse_args(argv)
    failed = False
    checks = (check_git_files, check_local_settings, lambda: check_api_health(args.url))
    for check in checks:
        try:
            for line in check():
                print(line)
        except VerificationError as exc:
            print(f"FAIL: {exc}")
            failed = True
        except (ValueError, ImportError, OSError):
            print("FAIL: Could not load local settings or dependencies. Check BackEnd/.env and install requirements.txt.")
            failed = True
    if failed:
        print("Verification incomplete. Fix the reported items and run this command again.")
        return 1
    print("Backend verification passed. See scripts.check_database for the separate committed-write checks.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
