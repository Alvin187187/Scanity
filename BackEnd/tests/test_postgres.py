import os

import pytest
from sqlalchemy import text

from app.core.config import Settings
from app.database.session import create_database_engine
from scripts.check_database import DatabaseCheckError, run_database_checks


def test_postgres_check_cannot_report_sqlite_as_success():
    engine = create_database_engine("sqlite://")
    try:
        with pytest.raises(DatabaseCheckError, match="still uses SQLite"):
            run_database_checks(engine)
    finally:
        engine.dispose()


@pytest.mark.postgres
@pytest.mark.skipif(not os.environ.get("TEST_POSTGRES_URL"), reason="Set TEST_POSTGRES_URL explicitly to run PostgreSQL integration checks.")
def test_postgres_read_write_commit_rollback_and_cleanup():
    settings = Settings(_env_file=None, DATABASE_URL=os.environ["TEST_POSTGRES_URL"])
    engine = create_database_engine(settings.DATABASE_URL)
    try:
        results = run_database_checks(engine)
        assert results[-1] == "PASS: Temporary table removed"
        with engine.connect() as connection:
            assert connection.scalar(text("SELECT to_regclass('pg_temp.scanity_db_check')")) is None
    finally:
        engine.dispose()
