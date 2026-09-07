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

