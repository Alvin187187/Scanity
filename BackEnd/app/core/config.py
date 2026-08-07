from pydantic import BaseSettings


class Settings(BaseSettings):
    PROJECT_NAME: str = "New Backend"
    SQLALCHEMY_DATABASE_URI: str = "sqlite:///./backend.db"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()
