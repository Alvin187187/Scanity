"""Check PostgreSQL reads, committed writes, and rollback using a temporary table."""

from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError


class DatabaseCheckError(RuntimeError):
    pass


def require_result(condition: bool, description: str):
    if not condition:
        raise DatabaseCheckError(description)


def run_database_checks(engine) -> list[str]:
    if engine.dialect.name != "postgresql":
        raise DatabaseCheckError(
            "DATABASE_URL still uses SQLite. Run python -m scripts.configure_database for Supabase."
        )
    results = []
    with engine.connect() as connection:
        require_result(connection.scalar(text("SELECT 1")) == 1, "Connection query returned an unexpected result.")
        results.append("PASS: PostgreSQL connection")
        result = connection.scalar(text("SELECT CAST(:number AS INTEGER) + 1"), {"number": 41})
        require_result(result == 42, "The parameterized query returned an unexpected result.")
        results.append("PASS: Parameterized read query")
        connection.commit()
        table_created = False
        try:
            connection.execute(text(
                "CREATE TEMPORARY TABLE scanity_db_check "
                "(id INTEGER PRIMARY KEY, value TEXT NOT NULL) ON COMMIT PRESERVE ROWS"
            ))
            table_created = True
            connection.commit()
            connection.execute(
                text("INSERT INTO pg_temp.scanity_db_check (id, value) VALUES (:id, :value)"),
                {"id": 1, "value": "first value"},
            )
            connection.commit()
            select_value = text("SELECT value FROM pg_temp.scanity_db_check WHERE id = :id")
            require_result(connection.scalar(select_value, {"id": 1}) == "first value", "Inserted value was not readable after commit.")
            results.append("PASS: INSERT, commit, and read back (temporary table)")
            connection.execute(text("UPDATE pg_temp.scanity_db_check SET value = :value WHERE id = :id"), {"id": 1, "value": "updated value"})
            connection.commit()
            require_result(connection.scalar(select_value, {"id": 1}) == "updated value", "Updated value was not readable after commit.")
            results.append("PASS: UPDATE and commit")
            connection.execute(text("DELETE FROM pg_temp.scanity_db_check WHERE id = :id"), {"id": 1})
            connection.commit()
            require_result(connection.scalar(select_value, {"id": 1}) is None, "Deleted row is still present.")
            results.append("PASS: DELETE and commit")
            connection.execute(text("INSERT INTO pg_temp.scanity_db_check (id, value) VALUES (:id, :value)"), {"id": 2, "value": "rolled back value"})
            connection.rollback()
            require_result(connection.scalar(select_value, {"id": 2}) is None, "Rollback did not remove the uncommitted row.")
            results.append("PASS: Transaction rollback")
        finally:
            if table_created:
                connection.rollback()
                connection.execute(text("DROP TABLE IF EXISTS pg_temp.scanity_db_check"))
                connection.commit()
    results.append("PASS: Temporary table removed")
    return results


def main() -> int:
    engine = None
    try:
        from app.database.session import engine

        for result in run_database_checks(engine):
            print(result)
    except DatabaseCheckError as exc:
        print(f"CHECK FAILED: {exc}")
        return 1
    except SQLAlchemyError as exc:
        # Never print the raw driver exception: it can contain credentials or SQL.
        print(f"CHECK FAILED: Database operation failed ({type(exc).__name__}).")
        print("Check the database password, Session pooler URI, project status, and network access.")
        print("The database role must also be allowed to create temporary tables.")
        return 1
    except (ValueError, ImportError):
        print("CHECK FAILED: Install requirements.txt and check BackEnd/.env; then run the setup command.")
        return 1
    finally:
        if engine is not None:
            engine.dispose()
    print("All PostgreSQL checks passed. Application tables were not changed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
