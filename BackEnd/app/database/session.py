from sqlalchemy import create_engine
from sqlalchemy.engine import make_url
from sqlalchemy.orm import declarative_base, sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.config import settings


def create_database_engine(database_url: str):
    url = make_url(database_url)
    options = {"pool_pre_ping": True, "hide_parameters": True}
    if url.get_backend_name() == "sqlite":
        options["connect_args"] = {"check_same_thread": False}
        if not url.database or url.database == ":memory:":
            options["poolclass"] = StaticPool
    else:
        connect_args = {"connect_timeout": settings.DATABASE_CONNECT_TIMEOUT}
        # Require encryption unless the URL explicitly sets an SSL mode.
        if "sslmode" not in url.query:
            connect_args["sslmode"] = "require"
        options.update(
            connect_args=connect_args,
            pool_size=settings.DATABASE_POOL_SIZE,
            max_overflow=settings.DATABASE_MAX_OVERFLOW,
            pool_timeout=settings.DATABASE_POOL_TIMEOUT,
        )
    return create_engine(url, **options)


engine = create_database_engine(settings.DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
