\# Scanity Database Responsibility Split



\## Purpose



Scanity uses a local PostgreSQL database for school development and offline demonstrations.



Supabase is used for authentication and selected shared/cloud records.



The finalized ERD is the source of truth for application tables. No extra application tables should be added unless the team approves them.



\---



\## Local PostgreSQL



The local PostgreSQL database stores the application data required for Scanity to run during school development and demonstrations without requiring an internet connection.



The local database contains the tables from the finalized ERD:



1\. USERS

2\. HEALTH\_PROFILES

3\. USER\_ALLERGIES

4\. ALLERGY\_TYPES

5\. USER\_HEALTH\_CONDITIONS

6\. HEALTH\_CONDITION\_TYPES

7\. SCAN\_HISTORIES

8\. PRODUCTS

9\. PRODUCT\_INGREDIENTS

10\. INGREDIENTS

11\. PRODUCT\_NUTRITION\_FLAGS

12\. NUTRITION\_RULES



FastAPI connects to this database using SQLAlchemy and Psycopg.



The local PostgreSQL database must remain usable even when Supabase or the internet is unavailable.



\---



\## Supabase



Supabase is responsible for authentication.



Supabase Auth handles:



\- Account registration

\- User login

\- Authentication identity

\- Authentication user UUID



The final list of additional shared/cloud application records is still pending team confirmation.



Until the team confirms the agreed shared records, no additional ERD tables are assigned exclusively to Supabase.



\---



\## Supabase Auth to Local User Mapping



When Supabase Auth and the local database are both used, the Supabase Auth user UUID is used as the local USERS.user\_id.



Example flow:



1\. A user creates an account using Supabase Auth.

2\. Supabase creates an authentication user and assigns a UUID.

3\. The backend receives the authenticated user's UUID.

4\. FastAPI creates the matching row in the local USERS table.

5\. The value of USERS.user\_id matches the Supabase Auth UUID.



Example:



Supabase Auth:



&#x20;   id = 550e8400-e29b-41d4-a716-446655440000



Local PostgreSQL:



&#x20;   USERS.user\_id = 550e8400-e29b-41d4-a716-446655440000



This allows the application to identify the same user in both environments without creating another ID.



Supabase authentication passwords or credentials must not be copied from Supabase into the local database.



\---



\## Offline School / Demo Use



The local PostgreSQL database is the required database for offline school and demonstration use.



A developer should be able to:



1\. Start local PostgreSQL.

2\. Configure the local DATABASE\_URL.

3\. Start FastAPI.

4\. Access the backend without requiring a connection to Supabase.



Cloud authentication features may require Supabase and an internet connection.



\---



\## Current Shared Record Status



Supabase authentication is confirmed as a Supabase responsibility.



The exact list of additional shared/cloud records is pending team confirmation.



This document should be updated once the Backend and Full Stack teams confirm those records.

## Local Development Setup

The Scanity backend can run using a local PostgreSQL database without connecting to Supabase.

### Requirements

Install:

- Python
- PostgreSQL 17
- Git

PostgreSQL should run locally using:

- Host: localhost
- Port: 5432
- Database: scanity
- User: postgres

### 1. Create the local database

Open PostgreSQL and create the database:

    CREATE DATABASE scanity;

### 2. Configure the backend environment

Copy:

    BackEnd/.env.example

to:

    BackEnd/.env

Set DATABASE_URL using your local PostgreSQL password:

    DATABASE_URL=postgresql+psycopg://postgres:YOUR_LOCAL_PASSWORD@localhost:5432/scanity?sslmode=disable

Do not commit the real `.env` file or database password.

Supabase variables may remain empty during local/offline development if cloud authentication is not being tested.

### 3. Install backend dependencies

From the project root:

    .\.venv\Scripts\Activate.ps1

Then enter the backend:

    cd BackEnd

Install the dependencies:

    python -m pip install -r requirements.txt

### 4. Apply database migrations

Run:

    alembic upgrade head

This creates the application tables defined by the finalized Scanity ERD.

### 5. Test the PostgreSQL connection

Run:

    python -m scripts.check_database

A successful setup should end with:

    All PostgreSQL checks passed. Application tables were not changed.

### 6. Start FastAPI

Run:

    python -m uvicorn main:app --reload

The backend should start at:

    http://127.0.0.1:8000

### 7. Verify FastAPI and PostgreSQL

In another terminal, run:

    Invoke-RestMethod http://127.0.0.1:8000/health/db

Expected result:

    status   database
    ------   --------
    ok       postgresql

The main API endpoint can also be checked with:

    Invoke-RestMethod http://127.0.0.1:8000/

Expected result:

    Welcome to Scanity API

## Connection Proof

### Local PostgreSQL

Local PostgreSQL was tested successfully using:

    python -m scripts.check_database

The checks confirmed:

- PostgreSQL connection
- Parameterized read query
- INSERT and commit
- UPDATE and commit
- DELETE and commit
- Transaction rollback
- Temporary table cleanup

FastAPI was also tested against the local database using:

    Invoke-RestMethod http://127.0.0.1:8000/health/db

Expected result:

    status   database
    ------   --------
    ok       postgresql

### Supabase

Supabase Auth reachability was tested using the project URL and publishable key.

The Auth health endpoint returned:

    Supabase Auth status: 200
    Reachable: True

This confirms that the Supabase project is reachable while the application database remains configured for local PostgreSQL.