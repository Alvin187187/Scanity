# Scanity Database Responsibility Split

## Purpose

Scanity uses a local PostgreSQL database for school development and offline/local demonstrations.

Supabase is used for authentication and may also be used for selected shared/cloud records once the team confirms the final list.

The finalized ERD remains the source of truth for the application table set. No extra application tables should be added without team approval.

The current authentication decision changes one local field responsibility: authentication passwords stay in Supabase Auth and are not stored in the local `USERS` table.

---

## Local PostgreSQL

The local PostgreSQL database stores the application data required for Scanity to run during school development and local demonstrations.

The local database contains these application tables:

1. `USERS`
2. `HEALTH_PROFILES`
3. `USER_ALLERGIES`
4. `ALLERGY_TYPES`
5. `USER_HEALTH_CONDITIONS`
6. `HEALTH_CONDITION_TYPES`
7. `SCAN_HISTORIES`
8. `PRODUCTS`
9. `PRODUCT_INGREDIENTS`
10. `INGREDIENTS`
11. `PRODUCT_NUTRITION_FLAGS`
12. `NUTRITION_RULES`

FastAPI connects to the local PostgreSQL database using SQLAlchemy and Psycopg.

### Local USERS table

The local `USERS` table contains:

- `user_id`
- `full_name`
- `email`

The local `USERS` table does **not** store a password.

Authentication passwords remain in Supabase Auth.

---

## Supabase

Supabase is responsible for authentication.

Supabase Auth handles:

- Account registration
- User login
- Session/token refresh
- Logout
- Password reset
- Authentication identity
- Authentication user UUID

The exact list of additional shared/cloud application records is still pending team confirmation.

Until that list is confirmed, no additional ERD tables are assigned exclusively to Supabase.

---

## Supabase Auth to Local User Mapping

Supabase Auth owns the authentication account.

When a matching local `USERS` row is created, its `user_id` must use the same UUID assigned by Supabase Auth.

Example flow:

1. A user registers through Supabase Auth.
2. Supabase creates the authentication user and assigns a UUID.
3. The backend receives the Supabase Auth UUID.
4. When the application creates the matching local `USERS` row, that UUID is used as `USERS.user_id`.
5. The same user can then be identified consistently in both systems.

Example:

```text
Supabase Auth user.id:
550e8400-e29b-41d4-a716-446655440000

Local PostgreSQL USERS.user_id:
550e8400-e29b-41d4-a716-446655440000
```

The current Auth implementation returns the Supabase Auth UUID during registration. The local row creation should follow the mapping rule above when that persistence step is used.

Supabase authentication passwords or credentials must never be copied into the local database.

---

## Environment Variables

Use `BackEnd/.env.example` as the template.

The real `BackEnd/.env` file must remain local and must not be committed.

### Local PostgreSQL

For local development:

```env
DATABASE_URL=postgresql+psycopg://postgres:YOUR_LOCAL_PASSWORD@localhost:5432/scanity?sslmode=disable
```

### Optional Supabase PostgreSQL Session Pooler

If the team needs to connect the application database to the Supabase PostgreSQL Session Pooler, use a separate connection string based on the real project values.

The pooler example stays commented in `.env.example` so the local PostgreSQL URL remains the default example.

### Supabase Auth

Keep the current Auth setting names used by `main`:

```env
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_KEY=YOUR_SUPABASE_PUBLISHABLE_KEY
```

Optional server-side value:

```env
SUPABASE_SERVICE_ROLE_KEY=YOUR_SUPABASE_SERVICE_ROLE_KEY
```

`SUPABASE_SERVICE_ROLE_KEY` must remain server-side only.

The backend currently uses:

```env
JWT_ALGORITHM=ES256
```

Tokens are verified using the Supabase JWKS endpoint, so `SUPABASE_JWT_SECRET` is not required for the current verification flow.

---

## Offline School / Demo Use

The local PostgreSQL database remains the required application database for school and local demonstration use.

A developer should be able to:

1. Start local PostgreSQL.
2. Configure the local `DATABASE_URL`.
3. Apply the Alembic migrations.
4. Start FastAPI.
5. Use local database functionality without requiring a Supabase PostgreSQL connection.

The current application settings still expect `SUPABASE_URL` and `SUPABASE_KEY` values to exist. For local-only setup, the placeholders from `.env.example` can be copied into `.env` when cloud authentication is not being tested.

Actual Supabase Auth actions such as registration, login, refresh, logout, and password reset require internet access to Supabase.

---

## Local Development Setup

### Requirements

Install:

- Python
- PostgreSQL
- Git

PostgreSQL should run locally using:

```text
Host: localhost
Port: 5432
Database: scanity
User: postgres
```

### 1. Create the local database

Create:

```sql
CREATE DATABASE scanity;
```

### 2. Configure the backend environment

Copy:

```text
BackEnd/.env.example
```

to:

```text
BackEnd/.env
```

Replace the local PostgreSQL password and any real Supabase values only inside `.env`.

Do not commit the real `.env` file.

### 3. Install backend dependencies

From the project root:

```powershell
.\.venv\Scripts\Activate.ps1
cd BackEnd
python -m pip install -r requirements.txt
```

### 4. Apply database migrations

Run:

```powershell
alembic upgrade head
```

The current migration chain includes the ERD schema and the migration that removes the local `users.password` column.

### 5. Test PostgreSQL

Run:

```powershell
python -m scripts.check_database
```

A successful setup should end with:

```text
All PostgreSQL checks passed. Application tables were not changed.
```

### 6. Start FastAPI

Run:

```powershell
python -m uvicorn main:app --reload
```

The backend should start at:

```text
http://127.0.0.1:8000
```

### 7. Verify FastAPI and PostgreSQL

In another terminal:

```powershell
Invoke-RestMethod http://127.0.0.1:8000/health/db
```

Expected database result:

```text
status   database
------   --------
ok       postgresql
```

---

## Connection Proof

### Local PostgreSQL

Local PostgreSQL has been tested successfully using:

```powershell
python -m scripts.check_database
```

The checks confirmed:

- PostgreSQL connection
- Parameterized read query
- INSERT and commit
- UPDATE and commit
- DELETE and commit
- Transaction rollback
- Temporary table cleanup

The local `USERS` table was also verified after the latest migration and contains:

```text
user_id
full_name
email
```

There is no local `password` column.

Current Alembic head after the password-removal migration:

```text
da67baeaba01
```

### Supabase

Supabase Auth reachability was previously verified using the project URL and publishable key.

Cloud Auth remains separate from the local PostgreSQL application database.

---

## Current Shared Record Status

Supabase Auth is confirmed as a Supabase responsibility.

The exact list of additional shared/cloud application records is still pending team confirmation.

This document should be updated once the Backend and Full Stack teams confirm those shared records.
