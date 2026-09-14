from contextlib import asynccontextmanager
import logging

from fastapi import FastAPI
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from starlette.concurrency import run_in_threadpool

from app.core.config import settings
from app.database.errors import database_exception_handler
from app.database.session import engine
from app.routers.auth import router as auth_router
from app.routers.example import router as example_router
from app.routers.scan_router import router as scan_router
from app.routers.ocr_router import router as ocr_router

from fastapi.middleware.cors import CORSMiddleware

logger = logging.getLogger(__name__)


def check_database_connection():
    with engine.connect() as connection:
        connection.execute(text("SELECT 1"))


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        try:
            await run_in_threadpool(check_database_connection)
        except SQLAlchemyError as exc:
            logger.error("Database startup check failed (%s).", type(exc).__name__)
            raise RuntimeError(
                "Database connection failed. Check BackEnd/.env and run python -m scripts.check_database."
            ) from None
        yield
    finally:
        await run_in_threadpool(engine.dispose)


app = FastAPI(title=settings.PROJECT_NAME, lifespan=lifespan)
app.add_exception_handler(SQLAlchemyError, database_exception_handler)
app.include_router(example_router, prefix="/api/v1")
app.include_router(scan_router, prefix="/api/v1")
app.include_router(auth_router, prefix="/api/v1")
app.include_router(ocr_router, prefix="/api/v1")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:8443",
        "http://127.0.0.1:8443",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
async def root():
    return {"message": f"Welcome to {settings.PROJECT_NAME}"}


@app.get("/health/db", tags=["Health"])
def database_health():
    check_database_connection()
    return {"status": "ok", "database": engine.dialect.name}