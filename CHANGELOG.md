# Scanity Changelog

## v0.3.0 — Local PostgreSQL & Supabase Responsibility Update

This update focuses on making the Scanity backend easier to run locally, safer to configure, and easier for other backend developers to reproduce on another computer.

---

## Added

- Added local PostgreSQL support for school development and offline/demo use.
- Added support for a local `scanity` PostgreSQL database.
- Added Alembic for database migrations.
- Added the finalized 12-table ERD schema through Alembic migration.
- Added Supabase environment variable support:
  - `SUPABASE_URL`
  - `SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`
- Added database verification scripts.
- Added the `/health/db` endpoint for checking database connectivity.
- Added documentation for the Local PostgreSQL vs Supabase responsibility split.
- Added local development setup instructions for other backend developers.
- Added documentation for mapping a Supabase Auth UUID to the local `USERS.user_id`.

---

## Database

The following application tables were created based on the finalized ERD:

- `users`
- `health_profiles`
- `user_allergies`
- `allergy_types`
- `user_health_conditions`
- `health_condition_types`
- `scan_histories`
- `products`
- `product_ingredients`
- `ingredients`
- `product_nutrition_flags`
- `nutrition_rules`

The updated `USERS` table follows the latest ERD and no longer includes `username`.

---

## Changed

- Updated the backend database setup so FastAPI can run using local PostgreSQL instead of depending only on Supabase PostgreSQL.
- Updated `.env.example` for local PostgreSQL and Supabase configuration.
- Updated `configure_database.py` to support:
  - Local PostgreSQL on `localhost:5432`
  - Supabase Session Pooler connections
- Improved PostgreSQL URL validation.
- Local PostgreSQL now uses `sslmode=disable`.
- Supabase PostgreSQL connections continue to use `sslmode=require`.
- Improved database connection pooling and timeout handling.
- Updated the product `brand` field to match the finalized ERD as `varchar(25)`.

---

## Security

- Real PostgreSQL passwords remain inside the local `.env` file.
- Real Supabase keys are not stored in `.env.example`.
- Real keys and credentials are not committed to Git.
- Database errors are handled without exposing connection credentials or SQL details.
- Supabase service credentials remain private and server-side only.

---

## Fixed

- Fixed PostgreSQL configuration accepting unsupported remote hosts.
- Fixed invalid Supabase Session Pooler ports being accepted.
- Fixed an indentation error in `configure_database.py`.
- Fixed database configuration tests after adding local PostgreSQL support.
- Prevented the test-only `ExampleModel` from becoming part of the real Scanity ERD migration.
- Fixed the `PRODUCTS.brand` length from `varchar(250)` to `varchar(25)`.
- Resolved the `httpx` dependency conflict by keeping:
  - `httpx>=0.28,<1`

---

## Verification

### Local PostgreSQL

The local PostgreSQL verification passed:

```text
PASS: PostgreSQL connection
PASS: Parameterized read query
PASS: INSERT, commit, and read back (temporary table)
PASS: UPDATE and commit
PASS: DELETE and commit
PASS: Transaction rollback
PASS: Temporary table removed
All PostgreSQL checks passed. Application tables were not changed.
```

### FastAPI

The FastAPI database health endpoint returned:

```text
status   database
------   --------
ok       postgresql
```

The root endpoint returned:

```text
Welcome to Scanity API
```

### Supabase

Supabase Auth reachability was verified successfully:

```text
Supabase Auth status: 200
Reachable: True
```

---

## Testing

The full backend test suite passed:

```text
37 passed, 1 skipped, 2 warnings
```

- `0` failed tests
- `1` skipped test is the optional PostgreSQL integration test
- `2` warnings are dependency deprecation warnings and are not backend failures

---

## Cross-Computer Verification

The backend setup was successfully reproduced on another developer's computer.

The second developer successfully:

- Installed the backend dependencies
- Connected to local PostgreSQL
- Ran the PostgreSQL verification script
- Started FastAPI
- Ran the automated test suite

Their result also showed:

```text
37 passed, 1 skipped
```

and:

```text
All PostgreSQL checks passed.
```

This confirms that the backend setup can be reproduced on another computer using the same project instructions.

---

## Documentation

Added and updated:

```text
docs/database-responsibility-split.md
```

The documentation includes:

- Local PostgreSQL responsibilities
- Supabase responsibilities
- Offline school/demo setup
- `.env` configuration
- Local PostgreSQL setup
- Alembic migration instructions
- Connection proof
- Supabase Auth UUID to local `USERS.user_id` mapping

---

## Git / Branch Work

Issue #143 work is currently stored in:

```text
feature/143-lock-database-responsibilities
```

This branch was originally created from:

```text
feature/supabase-database-1
```

Important commits created during the work include:

```text
feat: add local PostgreSQL environment support
chore: add Alembic migration setup
feat: create local PostgreSQL ERD schema
docs: add local PostgreSQL setup guide
docs: add database connection proof
fix: validate local and Supabase PostgreSQL URLs
```

The previous Supabase database work is handled separately in:

```text
feature/supabase-database-1
```

---

## Current Status

### Completed

- Local PostgreSQL setup
- Local `scanity` database
- FastAPI local database connection
- Alembic migration setup
- Finalized 12-table ERD migration
- PostgreSQL verification
- Supabase Auth reachability check
- `.env.example` update
- Local vs Supabase documentation
- Cross-computer backend verification
- Automated backend tests

### Remaining Team / Review Tasks

- Confirm the final list of shared/cloud records that belong in Supabase.
- Complete review/merge of `feature/supabase-database-1`.
- Prepare the Issue #143 Pull Request after the dependency branch is handled.
- Request Backend buddy review.
- Request Full Stack review.
- Fix review comments if needed.
- Merge only after required approvals.
- Verify the endpoint again after merge.

---

## Update Summary

| Area | Status |
|---|---|
| Local PostgreSQL | Complete |
| FastAPI database connection | Complete |
| Alembic migrations | Complete |
| ERD schema | Complete |
| Supabase reachability | Complete |
| Automated tests | Complete |
| Cross-computer verification | Complete |
| Documentation | Complete |
| Pull Request / Team approval | In progress |
