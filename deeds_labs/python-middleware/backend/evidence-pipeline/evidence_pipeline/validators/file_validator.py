"""File validation."""

import os
import magic
import structlog
from pathlib import Path
from typing import Optional

from evidence_pipeline.config import settings

logger = structlog.get_logger(__name__)


class ValidationError(Exception):
    """Base validation error."""
    pass


class FileSizeExceededError(ValidationError):
    """File size exceeds maximum allowed."""
    pass


class InvalidMimeTypeError(ValidationError):
    """Invalid MIME type."""
    pass


class CorruptedFileError(ValidationError):
    """File appears to be corrupted."""
    pass


# Allowed MIME types
ALLOWED_MIME_TYPES = {
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/tiff",
    "image/x-tiff",
}


def validate_file(file_path: str) -> bool:
    """
    Validate a file for processing.

    Checks:
    - File exists
    - File size within limits
    - MIME type is allowed
    - File is not corrupted

    Args:
        file_path: Path to the file

    Returns:
        bool: True if valid

    Raises:
        ValidationError: If validation fails
    """
    try:
        path = Path(file_path)

        # Check file exists
        if not path.exists():
            raise ValidationError(f"File not found: {file_path}")

        # Check file size
        file_size_mb = path.stat().st_size / (1024 * 1024)
        if file_size_mb > settings.MAX_FILE_SIZE_MB:
            raise FileSizeExceededError(
                f"File size {file_size_mb:.2f}MB exceeds maximum {settings.MAX_FILE_SIZE_MB}MB"
            )

        logger.info("File size valid", file_path=file_path, size_mb=file_size_mb)

        # Check MIME type
        mime = magic.Magic(mime=True)
        mime_type = mime.from_file(file_path)

        if mime_type not in ALLOWED_MIME_TYPES:
            raise InvalidMimeTypeError(f"MIME type not allowed: {mime_type}")

        logger.info("MIME type valid", file_path=file_path, mime_type=mime_type)

        # Check file integrity (magic bytes)
        if not _check_file_integrity(file_path, mime_type):
            raise CorruptedFileError(f"File appears to be corrupted: {file_path}")

        logger.info("File integrity valid", file_path=file_path)

        logger.info("File validation passed", file_path=file_path)
        return True

    except ValidationError:
        raise
    except Exception as e:
        logger.error("File validation failed", file_path=file_path, error=str(e))
        raise ValidationError(f"File validation failed: {str(e)}")


def _check_file_integrity(file_path: str, mime_type: str) -> bool:
    """
    Check file integrity by verifying magic bytes.

    Args:
        file_path: Path to the file
        mime_type: MIME type of the file

    Returns:
        bool: True if file appears valid
    """
    try:
        with open(file_path, "rb") as f:
            header = f.read(512)

        # PDF magic bytes
        if mime_type == "application/pdf":
            return header.startswith(b"%PDF")

        # JPEG magic bytes
        if mime_type == "image/jpeg":
            return header.startswith(b"\xff\xd8\xff")

        # PNG magic bytes
        if mime_type == "image/png":
            return header.startswith(b"\x89PNG\r\n\x1a\n")

        # TIFF magic bytes (little-endian or big-endian)
        if mime_type in ["image/tiff", "image/x-tiff"]:
            return header.startswith(b"II*\x00") or header.startswith(b"MM\x00*")

        # Unknown type, assume valid
        return True

    except Exception as e:
        logger.error("Failed to check file integrity", file_path=file_path, error=str(e))
        return False
