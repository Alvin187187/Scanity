import logging

import psycopg
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError, OperationalError, ProgrammingError, SQLAlchemyError
from sqlalchemy.exc import TimeoutError as DatabaseTimeoutError
from sqlalchemy.orm import sessionmaker

import main
from app.database import session as database
from app.database.errors import database_exception_handler
from app.models.example import ExampleModel


@pytest.fixture
def local_engine():
    engine = database.create_database_engine("sqlite://")
    database.Base.metadata.create_all(engine)
    yield engine
    engine.dispose()


def test_session_commit_is_readable_in_a_new_session(local_engine, monkeypatch):
    factory = sessionmaker(bind=local_engine)
    monkeypatch.setattr(database, "SessionLocal", factory)
    dependency = database.get_db()
    session = next(dependency)
    session.add(ExampleModel(name="saved"))
    session.commit()
    with pytest.raises(StopIteration):
        next(dependency)
    with factory() as another_session:
        assert another_session.scalar(select(ExampleModel.name)) == "saved"


def test_request_failure_rolls_back_a_flushed_write(local_engine, monkeypatch):
    factory = sessionmaker(bind=local_engine)
    monkeypatch.setattr(database, "SessionLocal", factory)
    dependency = database.get_db()
    session = next(dependency)
    session.add(ExampleModel(name="must not persist"))
    session.flush()
    with pytest.raises(RuntimeError, match="request failed"):
        dependency.throw(RuntimeError("request failed"))
    with factory() as another_session:
        assert another_session.scalar(select(ExampleModel)) is None


def test_postgresql_driver_gets_ssl_timeout_and_no_sqlite_argument(monkeypatch):
    captured = {}

    def unavailable_connection(*args, **kwargs):
        captured.update(kwargs)
        raise psycopg.OperationalError("simulated unavailable database")

    monkeypatch.setattr(psycopg, "connect", unavailable_connection)
    engine = database.create_database_engine("postgresql+psycopg://user:password@localhost:5432/postgres")
    try:
        with pytest.raises(OperationalError):
            engine.connect()
        assert captured["sslmode"] == "require"
        assert captured["connect_timeout"] == 2
        assert "check_same_thread" not in captured
    finally:
        engine.dispose()


def test_database_health_executes_a_query():
    with TestClient(main.app) as client:
        response = client.get("/health/db")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "database": "sqlite"}


def test_database_outage_after_startup_returns_503(monkeypatch, caplog):
    def fail():
        raise OperationalError("SELECT private_data", {}, RuntimeError("credential-canary"))

    with TestClient(main.app) as client:
        monkeypatch.setattr(main, "check_database_connection", fail)
        with caplog.at_level(logging.ERROR):
            response = client.get("/health/db")
    assert response.status_code == 503
    assert "credential-canary" not in response.text + caplog.text
    assert "private_data" not in response.text + caplog.text


def test_startup_failure_has_an_actionable_redacted_error(monkeypatch, caplog):
    def fail():
        raise OperationalError("SELECT private_data", {}, RuntimeError("credential-canary"))

    monkeypatch.setattr(main, "check_database_connection", fail)
    with pytest.raises(RuntimeError, match="check_database") as captured:
        with TestClient(main.app):
            pass
    assert "credential-canary" not in str(captured.value) + caplog.text


@pytest.mark.parametrize("exception,status", [
    (IntegrityError("secret SQL", {}, RuntimeError("credential-canary")), 409),
    (ProgrammingError("secret SQL", {}, RuntimeError("credential-canary")), 500),
    (DatabaseTimeoutError("credential-canary"), 503),
])
def test_database_errors_do_not_expose_sql_or_credentials(exception, status, caplog):
    app = FastAPI()
    app.add_exception_handler(SQLAlchemyError, database_exception_handler)

    @app.get("/failure")
    def failure():
        raise exception

    with TestClient(app, raise_server_exceptions=False) as client:
        response = client.get("/failure")
    assert response.status_code == status
    assert "credential-canary" not in response.text + caplog.text
    assert "secret SQL" not in response.text + caplog.text
