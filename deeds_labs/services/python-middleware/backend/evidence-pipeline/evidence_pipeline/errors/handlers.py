"""Error handling and custom exceptions."""

from fastapi import HTTPException
import structlog
from typing import Dict, Any

logger = structlog.get_logger(__name__)


class InvalidDocumentError(Exception):
    """Invalid document error."""
    pass


class FileSizeExceededError(Exception):
    """File size exceeded error."""
    pass


class CorruptedFileError(Exception):
    """Corrupted file error."""
    pass


class ProcessingError(Exception):
    """Processing error."""
    pass


def create_error_response(
    error_code: str,
    message: str,
    details: Dict[str, Any] = None,
) -> Dict[str, Any]:
    """
    Create a structured error response.

    Args:
        error_code: Error code (e.g., "INVALID_DOCUMENT")
        message: User-friendly error message
        details: Additional error details

    Returns:
        dict: Error response
    """
    response = {
        "error": {
            "code": error_code,
            "message": message,
        }
    }

    if details:
        response["error"]["details"] = details

    return response


def handle_validation_error(error: Exception) -> HTTPException:
    """
    Handle validation errors.

    Args:
        error: The validation error

    Returns:
        HTTPException: HTTP exception with appropriate status code
    """
    error_str = str(error)

    if "File size" in error_str or "exceeds" in error_str:
        logger.warning("File size exceeded", error=error_str)
        return HTTPException(
            status_code=413,
            detail=create_error_response(
                "FILE_SIZE_EXCEEDED",
                "File size exceeds maximum allowed size",
                {"max_size_mb": 50},
            ),
        )

    if "MIME type" in error_str or "not allowed" in error_str:
        logger.warning("Invalid MIME type", error=error_str)
        return HTTPException(
            status_code=400,
            detail=create_error_response(
                "INVALID_MIME_TYPE",
                "File type is not supported",
                {"allowed_types": ["PDF", "JPEG", "PNG", "TIFF"]},
            ),
        )

    if "corrupted" in error_str.lower():
        logger.warning("Corrupted file", error=error_str)
        return HTTPException(
            status_code=400,
            detail=create_error_response(
                "CORRUPTED_FILE",
                "File appears to be corrupted or invalid",
            ),
        )

    if "not found" in error_str.lower():
        logger.warning("File not found", error=error_str)
        return HTTPException(
            status_code=404,
            detail=create_error_response(
                "FILE_NOT_FOUND",
                "File not found",
            ),
        )

    # Generic validation error
    logger.warning("Validation error", error=error_str)
    return HTTPException(
        status_code=400,
        detail=create_error_response(
            "VALIDATION_ERROR",
            "File validation failed",
            {"reason": error_str},
        ),
    )


def handle_processing_error(error: Exception) -> HTTPException:
    """
    Handle processing errors.

    Args:
        error: The processing error

    Returns:
        HTTPException: HTTP exception
    """
    logger.error("Processing error", error=str(error))
    return HTTPException(
        status_code=500,
        detail=create_error_response(
            "PROCESSING_ERROR",
            "An error occurred during processing",
        ),
    )
