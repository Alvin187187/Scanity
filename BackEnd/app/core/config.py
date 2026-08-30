from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    PROJECT_NAME: str
    DATABASE_URL: str
    
    # Add these three fields so Pydantic accepts them from .env
    SUPABASE_URL: str
    SUPABASE_KEY: str
    SUPABASE_JWT_SECRET: str
    
    SECRET_KEY: str
    JWT_ALGORITHM: str
    ACCESS_TOKEN_EXPIRE_MINUTES: int
    OLLAMA_HOST: str
    OPENFOODFACTS_API: str

    model_config = SettingsConfigDict(
    env_file=".env",
    extra="ignore"

    )

settings = Settings()