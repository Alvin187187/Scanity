"""Default tests always use an isolated SQLite database, never a developer's .env DB."""

import os


os.environ.update({
    "PROJECT_NAME": "Scanity API",
    "DATABASE_URL": "sqlite://",
    "SECRET_KEY": "test-only-secret",
    "JWT_ALGORITHM": "HS256",
    "ACCESS_TOKEN_EXPIRE_MINUTES": "30",
    "OLLAMA_HOST": "http://localhost:11434",
    "OPENFOODFACTS_API": "https://world.openfoodfacts.org/api/v2",
    "DATABASE_CONNECT_TIMEOUT": "2",
    "DATABASE_POOL_SIZE": "2",
    "DATABASE_MAX_OVERFLOW": "0",
    "DATABASE_POOL_TIMEOUT": "2",
})
