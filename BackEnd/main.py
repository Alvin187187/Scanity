from fastapi import FastAPI

from app.core.config import settings
from app.database.session import Base, engine
import app.models.user
from app.routers.user import router as user_router

app = FastAPI(title=settings.PROJECT_NAME)

app.include_router(user_router, prefix="/api/v1")

@app.on_event("startup")
async def startup_event():
    Base.metadata.create_all(bind=engine)

@app.get("/")
async def root():
    return {"message": f"Welcome to {settings.PROJECT_NAME}"}