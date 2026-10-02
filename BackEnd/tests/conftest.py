"""
Database schema fixture for test sessions.
Creates all tables registered on Base.metadata before any tests execute.
"""
import pytest
from app.database.session import Base, engine

# Ensure all ORM models are imported so they register on Base.metadata
from app.models import schema  # noqa: F401


@pytest.fixture(scope="session", autouse=True)
def create_test_schema():
    Base.metadata.create_all(bind=engine)
    yield

