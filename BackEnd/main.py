from fastapi import FastAPI
<<<<<<< Updated upstream
=======
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from starlette.concurrency import run_in_threadpool
>>>>>>> Stashed changes

from app.core.config import settings
from app.database.session import Base, engine
from app.routers.example import router as example_router
<<<<<<< Updated upstream

app = FastAPI(title=settings.PROJECT_NAME)
=======
from app.routers.scan_router import router as scan_router

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
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:8443", "http://127.0.0.1:8443"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_exception_handler(SQLAlchemyError, database_exception_handler)
>>>>>>> Stashed changes
app.include_router(example_router, prefix="/api/v1")


@app.on_event("startup")
async def startup_event():
    Base.metadata.create_all(bind=engine)


@app.get("/")
async def root():
    return {"message": f"Welcome to {settings.PROJECT_NAME}"}
