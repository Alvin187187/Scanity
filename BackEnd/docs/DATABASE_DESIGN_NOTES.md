# Database scope and design references

Reviewed 2026-09-07 against the uploaded System Design Documentation v0.1, SRS Version 0.1, and ERD PDFs.

## What this database setup delivers

The connection layer loads the configured Supabase PostgreSQL URL, creates a Psycopg/SQLAlchemy engine, binds request sessions to that engine, checks a real database query during FastAPI startup and at `/health/db`, and handles database failures. The diagnostic exercises parameterized reads, committed writes, and rollback in a temporary table. It supplies the infrastructure for the product features in the SRS.

The existing `/api/v1/example` route remains a scaffold. Completing the connection task does not implement the scan, product lookup, profile, or comparison features. Those features need their own models, migrations, services, authorization, and API tests. No persistent schema migration runs during startup or these diagnostics.

## Which diagram to use when planning models

Use the section labeled **After Final Revision** in `ERD.pdf`, pages 2-3, as the working reference for future schema work. The ERD in the older System Design PDF, page 4, shows a different design: integer identifiers, older table names, and fewer relationship tables. Do not combine both schemas automatically. The actual Supabase schema has not been inspected in this review.

| Area | Entities in the revised ERD | Backend responsibility |
| --- | --- | --- |
| Account and profile | `USERS`, `HEALTH_PROFILES` | Identify the current user and load their profile. |
| Allergies | `USER_ALLERGIES`, `ALLERGY_TYPES` | Relate users to allergy definitions. |
| Conditions | `USER_HEALTH_CONDITIONS`, `HEALTH_CONDITION_TYPES` | Relate users to condition definitions. |
| Product lookup | `PRODUCTS` | Look up a product by its identifier or barcode. |
| Ingredients | `PRODUCT_INGREDIENTS`, `INGREDIENTS` | Relate products to ingredient definitions. |
| Rule flags | `PRODUCT_NUTRITION_FLAGS`, `NUTRITION_RULES` | Relate products to rule definitions. |
| History | `SCAN_HISTORIES` | Link each recorded scan to a user and product. |

These are diagram labels, not confirmation of physical PostgreSQL table names or permissions. A successful temporary-table diagnostic does not validate these application tables or row-level access rules.

## Design differences to settle before migrations

| Reference difference | Why it matters for implementation |
| --- | --- |
| SRS FR-05 names `INGREDIENTS.translated_name`; revised ERD pages 2-3 show `common_name`. | Choose the stored column and API field mapping before writing lookup queries. |
| The revised ERD attribute list on page 2 includes `USERS.username`; the relationship view on page 3 omits it. | Confirm whether username is required in the account schema. |
| Revised identifiers are UUIDs; the older diagram uses integers. | Existing tables and foreign keys must be checked before generating migrations. |
| The diagram uses `datetime` and `tinyint(1)` notation. | PostgreSQL models need explicit timestamp and boolean types; diagram notation is not executable PostgreSQL DDL. |
| SRS FR-02/FR-04 need product nutrition facts; the revised `PRODUCTS` list does not specify where those numeric values are stored. | Define storage or retrieval of those facts before implementing the corresponding feature. |

These decisions affect feature and schema implementation; they do not prevent the database connection infrastructure from being verified.

## Guidance for the next backend features

Use `Depends(get_db)` with synchronous SQLAlchemy routes/services. Use bound query parameters or ORM expressions. Commit successful writes explicitly; let exceptions propagate to the database handler so the dependency can roll back failed work. See `README.md` for the session example and error behavior.

The System Design API contract on page 5 describes scan routes and product lookup/comparison routes. When those features are implemented, query the agreed physical schema and test through those routes using designated test data. The database connection role does not, by itself, establish the logged-in user's application permissions. Authentication and application-table authorization require separate implementation and tests.
