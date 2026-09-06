"""Keep database credentials and SQL details out of HTTP responses and logs."""

import logging

from fastapi import Request
from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError, InterfaceError, OperationalError, SQLAlchemyError
from sqlalchemy.exc import TimeoutError as DatabaseTimeoutError


logger = logging.getLogger(__name__)


async def database_exception_handler(request: Request, exc: SQLAlchemyError):
    logger.error("Database request failed (%s).", type(exc).__name__)
    if isinstance(exc, (OperationalError, InterfaceError, DatabaseTimeoutError)):
        return JSONResponse(status_code=503, content={"detail": "Database temporarily unavailable. Please try again later."})
    if isinstance(exc, IntegrityError):
        return JSONResponse(status_code=409, content={"detail": "The data conflicts with a database constraint."})
    return JSONResponse(status_code=500, content={"detail": "A database operation failed."})
