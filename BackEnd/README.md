# Scanity backend: database setup

The backend supports PostgreSQL through Psycopg 3 and retains SQLite for local development. The Supabase connection must be configured and checked on each developer's machine. A successful package installation or a passing SQLite test does not establish a Supabase connection.

## 1. Apply the update and protect local settings

Use the database branch requested by your team leader. The update archive contains a `Scanity` folder with changed/new files only. Merge its contents into your existing `Scanity` repository and replace matching files. Keep your existing `.env` and `.venv`.

The uploaded Git index tracks `BackEnd/.env`, `BackEnd/scanity.db`, and Python cache files. After applying the new root `.gitignore`, run this once from the repository's `Scanity` folder, before entering real database credentials:

```powershell
git rm -r --cached --ignore-unmatch -- BackEnd/.env BackEnd/scanity.db ":(glob)**/__pycache__/**"
git ls-files -- BackEnd/.env
git check-ignore -v -- BackEnd/.env
```

The first command stages removal of those files from Git tracking and keeps the local copies. The second should return no filenames. The third should show the `.env` ignore rule. The `.env.example` template remains tracked. `.gitignore` does not affect files that Git already tracks. [Git documentation](https://git-scm.com/docs/gitignore)

Review these staged removals with the code changes in GitHub Desktop. Keep the work on your feature branch while completing verification; these instructions do not require a push. Teammates should preserve their own local `.env` before pulling a future commit that removes the tracked file. This change does not erase old Git history. If a real secret was previously committed, coordinate its replacement with the project owner.

## 2. Install requirements in the project environment

For Kyle's current folder layout, run these separately in the VS Code PowerShell terminal:

```powershell
cd "C:\Users\Kyle\Documents\Scanity Project\Scanity\BackEnd"
..\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

The `.venv` is one folder above `BackEnd`. `..` means the parent folder. These commands use that Python directly, so activation is optional. For a fresh clone with no environment, run `python -m venv .venv` from the `Scanity` repository folder first. Do not copy another developer's virtual environment. [Python venv documentation](https://docs.python.org/3/library/venv.html)

`psycopg[binary]` is the PostgreSQL driver. `httpx` is included for the existing FastAPI TestClient tests. Keep the other project requirements. Psycopg's binary installation includes its client libraries. [Psycopg installation](https://www.psycopg.org/psycopg3/docs/basic/install.html)

## 3. Configure `.env` for Supabase

Open [the team's Supabase project](https://supabase.com/dashboard/project/egnnmylepxdekvtimjaz/database/schemas). Select **Connect**, then **Session pooler** and the **URI** format. Copy the URI while it still contains the password placeholder. Use the exact host supplied by the dashboard. Session pooling uses port `5432` and supports IPv4 connections. [Supabase connection guide](https://supabase.com/docs/guides/database/connecting-to-postgres)

From `BackEnd`, run:

```powershell
..\.venv\Scripts\python.exe -m scripts.configure_database
```

Paste the URI at the first prompt. Enter the database password at the second prompt; typing is hidden. This is the database password, not a Supabase API key. Obtain the team's development credentials from the project owner if needed.

The helper updates only `DATABASE_URL` in an existing `.env`, preserving other settings and comments. If `.env` is missing, it copies `.env.example` and generates a random application `SECRET_KEY`. It encodes password punctuation automatically and enables SSL with `sslmode=require`. It never prints the completed URL or password. Saving the URL does not test it.

The resulting URL starts with `postgresql+psycopg://`. The `+psycopg` part selects the installed Psycopg 3 driver. The settings class also normalizes plain `postgresql://` and `postgres://` URLs to that driver. [SQLAlchemy PostgreSQL documentation](https://docs.sqlalchemy.org/en/20/dialects/postgresql.html#module-sqlalchemy.dialects.postgresql.psycopg)

For manual editing, replace the placeholders in `.env.example` with your values in `.env` only. Use the setup helper if your password has characters such as `@`, `/`, `#`, or `%`.

## 4. Test the actual PostgreSQL connection and writes

```powershell
..\.venv\Scripts\python.exe -m scripts.check_database
```

Successful output contains seven `PASS` lines covering connection, parameterized reads, insertion and read-back after commit, update, delete, rollback, and cleanup. The command exits with code `0` only when every check succeeds. It refuses to report a SQLite database as PostgreSQL success.

All writes use a session-local temporary table named `scanity_db_check`; the script explicitly drops it before returning. Temporary tables can preserve their rows across commits within the session, allowing committed writes to be checked without adding an application table. [PostgreSQL CREATE TABLE documentation](https://www.postgresql.org/docs/current/sql-createtable.html)

The role needs permission to create temporary tables. These checks do not establish access to the team's actual application tables, validate Supabase Auth/RLS policies, or migrate existing SQLite data. The backend connection's database role determines its permissions.

## 5. Run FastAPI and check readiness

Save your `.env` edits first. If the API is already running, stop it with **Ctrl + C** and restart it with the following command. Environment changes are loaded at process startup; do not rely on `--reload` to notice `.env` edits.

```powershell
..\.venv\Scripts\python.exe -m uvicorn main:app --reload
```

Open [database health](http://127.0.0.1:8000/health/db). After a successful Supabase configuration it should return:

```json
{"status":"ok","database":"postgresql"}
```

The app runs `SELECT 1` during startup and closes its pool during shutdown. If the startup query fails, it exits with a safe message pointing to the diagnostic command. A connection failure after startup produces HTTP `503` at `/health/db`. Stop the development server with **Ctrl + C**. Keep `--reload` for local development.

`/` and `/api/v1/example` preserve their existing behavior. The example endpoint is still a static demonstration; `/health/db` makes a database query. Startup no longer calls `Base.metadata.create_all()`. Existing shared schema changes should use the team's migration process, rather than creating tables whenever the API starts. This update neither applies migrations nor creates persistent Supabase tables.

### Verify the running app, loaded settings, and Git rules together

Keep the Uvicorn terminal running. Open a **second** PowerShell terminal and run:

```powershell
cd "C:\Users\Kyle\Documents\Scanity Project\Scanity\BackEnd"
..\.venv\Scripts\python.exe -m scripts.verify_backend
```

This command checks the local `.env` exists, PostgreSQL/Psycopg is selected, request sessions share the configured engine, and the actual engine pool size/wait timeout match the loaded settings. It reports only timeout/pool numbers and the names of overriding environment variables; it does not print the database URL, password, or application secret. Automated tests additionally verify that custom `.env` values reach the driver connection timeout and pool overflow limit.

It asks Git whether `.env`, local overrides, `.venv`, Python/pytest caches, and the local database are excluded, whether `.env.example` remains available to Git, and whether ignored files are already tracked. A tracked file remains tracked even when its ignore rule is correct, so both checks are necessary. [Git check-ignore documentation](https://git-scm.com/docs/git-check-ignore)

Finally it requests the running API's `/health/db`. Success requires HTTP `200` with `status=ok` and `database=postgresql`. An old API returning `404`, an API still using SQLite, an unavailable database, and an unreachable API all fail the check. Exit code `0` means all checks passed; `1` means an item needs attention. The script does not stage, commit, push, edit `.env`, or change database tables.

Local settings are inspected in the verification process; HTTP health is inspected in the running API process. Restart Uvicorn from this checkout after saving settings so both use the same configuration. Health confirms PostgreSQL query execution, not the exact project identity or application-table permissions. For a different local port, pass `--url http://127.0.0.1:8001/health/db`.

## 6. Run automated tests

```powershell
..\.venv\Scripts\python.exe -m pytest -q
```

Default tests replace database settings before importing the app and use isolated, in-memory SQLite. They cover saved writes and rollback through actual FastAPI test requests, shared engine wiring and real health SQL execution, custom PostgreSQL pool/driver settings loaded from `.env`, startup and health failures, redacted HTTP errors, `.env` loading from another folder, password encoding, real Git ignore/index checks, and HTTP verification failures. HTTP verifier tests use a local test server and Git tests use disposable checkouts. The PostgreSQL integration test is skipped unless `TEST_POSTGRES_URL` is explicitly set. A skipped PostgreSQL test is not a failed connection and is not proof that Supabase works; use the diagnostic command in step 4.

If you want the opt-in pytest check to use the URL already configured privately in `.env`, run these from `BackEnd`:

```powershell
$env:TEST_POSTGRES_URL = (& ..\.venv\Scripts\python.exe -c "from app.core.config import settings; print(settings.DATABASE_URL)")
..\.venv\Scripts\python.exe -m pytest -q -m postgres
Remove-Item Env:TEST_POSTGRES_URL
```

The assignment captures the URL without displaying it. Do not print that environment variable or include it in screenshots. The integration check uses the same temporary-table procedure.

## Configuration reference

| Variable | Behavior |
| --- | --- |
| `DATABASE_URL` | Required. PostgreSQL/Psycopg or SQLite URL. Hidden in settings repr and validation errors. |
| `DATABASE_CONNECT_TIMEOUT` | PostgreSQL connection timeout in seconds; default `10`. |
| `DATABASE_POOL_SIZE` | Connections kept per worker; default `5`. |
| `DATABASE_MAX_OVERFLOW` | Extra concurrent connections per worker; default `0`. |
| `DATABASE_POOL_TIMEOUT` | Maximum wait for a free pooled connection; default `10` seconds. |
| `SECRET_KEY` | Existing application secret, kept separate from the database password. |

Settings read `BackEnd/.env` using its absolute location, independent of the terminal's folder. Environment variables take precedence over `.env`. Restart the server after changing settings. [Pydantic Settings documentation](https://docs.pydantic.dev/latest/concepts/pydantic_settings/)

PostgreSQL connections default to encrypted SSL. An explicit SSL mode in the URL is respected. `sslmode=require` encrypts the connection; certificate/hostname verification requires configuring `verify-full` and the appropriate root certificate. No PostgreSQL options are passed to SQLite, and `check_same_thread` is only used for SQLite. `pool_pre_ping` checks a pooled connection before reuse; it does not retry a transaction that fails halfway through. Connection and pool waits are bounded, but query execution timeouts are not configured by this update. [SQLAlchemy connection pooling](https://docs.sqlalchemy.org/en/20/core/pooling.html)

## Using sessions in backend code

Use `Depends(get_db)` from `app.database.session` in synchronous route functions when doing synchronous SQLAlchemy work. A service should explicitly call `db.commit()` for successful writes. The dependency rolls back if an exception escapes the request and always closes the session. No automatic retry repeats write operations.

For example, this standalone FastAPI route demonstrates a bound read parameter without depending on any application table:

```python
from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session
from app.database.session import get_db

router = APIRouter()

@router.get("/query-example")
def query_example(number: int = 41, db: Session = Depends(get_db)):
    result = db.scalar(text("SELECT CAST(:number AS INTEGER) + 1"), {"number": number})
    return {"result": result}
```

This is a documentation example, not a route added to the application. For writes, use `db.add(...)` with an implemented model or a bound SQL statement, then `db.commit()` after the operation succeeds. Register new routers explicitly with the app.

Database exception handling returns a generic `503` for connection/pool failures, `409` for constraint violations, and `500` for other SQLAlchemy errors. Logs record the exception class, not raw driver messages, SQL, parameters, or database URLs.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| `python.exe` is not recognized | Start in `BackEnd` and use `..\.venv\Scripts\python.exe`. |
| `No module named psycopg` | Install the updated requirements with that same Python. |
| Invalid `DATABASE_URL` or placeholder error | Run the setup helper; keep real values in `.env`. |
| Diagnostic says SQLite | The active URL still points to the local file; check for an overriding environment variable. |
| Connection refused or timeout | Confirm project availability, network access, and the exact Session pooler host. |
| Password authentication fails | Check the database password and complete username from Connect. |
| Cannot create temporary table | Ask the database owner to verify the development role's privileges. |
| Existing tables do not appear after switching | Changing a URL does not transfer SQLite tables/data; follow the team's migration process. |
| Git command is not recognized | Run the tracking cleanup through a Git terminal or install Git for Windows before adding real credentials. |

For server-side connection issues, use [Supabase's connection troubleshooting](https://supabase.com/docs/guides/database/connecting-to-postgres#troubleshooting-and-postgres-connection-string-faqs).

## Task evidence

See [the task verification record](docs/DATABASE_TASK_STATUS.md) for the distinction between implemented/tested code, the successful live checks already shown on Kyle's laptop, and the final app verification still needed there.

The references are summarized in [database design notes](docs/DATABASE_DESIGN_NOTES.md), including differences between the revised ERD and older system design. They guide future application models and queries; completing these connection tasks does not mean every SRS feature is implemented.
