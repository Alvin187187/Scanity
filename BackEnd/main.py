from fastapi import FastAPI

from backend.app.core.config import settings
from backend.app.database.session import Base, engine
from backend.app.routers.example import router as example_router

app = FastAPI(title=settings.PROJECT_NAME)
app.include_router(example_router, prefix="/api/v1")


@app.on_event("startup")
async def startup_event():
    Base.metadata.create_all(bind=engine)


@app.get("/")
async def root():
    return {"message": f"Welcome to {settings.PROJECT_NAME}"}
