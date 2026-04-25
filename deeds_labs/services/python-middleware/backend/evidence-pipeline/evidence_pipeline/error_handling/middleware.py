"""Error handling middleware for FastAPI."""

from fastapi import Request, status
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
import structlog
import traceback
from typing import Callable

from evidence_pipeline.error_handling.recovery import ProcessingError, ErrorSeverity

logger = structlog.get_logger(__name__)


class ErrorHandlingMiddleware(BaseHTTPMiddleware):
    """Middleware for handling and logging errors."""

    async def dispatch(self, request: Request, call_next: Callable):
        """Process request and handle errors."""
        try:
            response = await call_next(request)
            return response
        except ProcessingError as e:
            logger.error(
                "Processing error",
                stage=e.stage,
                message=e.message,
                severity=e.severity.value,
                details=e.details,
                path=request.url.path,
            )

            status_code = (
                status.HTTP_400_BAD_REQUEST
                if e.severity == ErrorSeverity.RECOVERABLE
                else status.HTTP_500_INTERNAL_SERVER_ERROR
            )

            return JSONResponse(
                status_code=status_code,
                content={
                    "error": e.message,
                    "stage": e.stage,
                    "severity": e.severity.value,
                    "recoverable": e.is_recoverable(),
                    "details": e.details,
                },
            )
        except Exception as e:
            logger.error(
                "Unhandled exception",
                error=str(e),
                path=request.url.path,
                traceback=traceback.format_exc(),
            )

            return JSONResponse(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                content={
                    "error": "Internal server error",
                    "message": str(e),
                },
            )


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """Middleware for logging requests and responses."""

    async def dispatch(self, request: Request, call_next: Callable):
        """Log request and response."""
        import time

        start_time = time.time()

        try:
            response = await call_next(request)
            duration = time.time() - start_time

            logger.info(
                "Request completed",
                method=request.method,
                path=request.url.path,
                status_code=response.status_code,
                duration_ms=duration * 1000,
            )

            return response
        except Exception as e:
            duration = time.time() - start_time
            logger.error(
                "Request failed",
                method=request.method,
                path=request.url.path,
                error=str(e),
                duration_ms=duration * 1000,
            )
            raise
