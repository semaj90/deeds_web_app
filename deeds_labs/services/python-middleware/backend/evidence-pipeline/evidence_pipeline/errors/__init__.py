"""Error handling module."""

from evidence_pipeline.errors.handlers import (
    InvalidDocumentError,
    FileSizeExceededError,
    CorruptedFileError,
    ProcessingError,
)

__all__ = [
    "InvalidDocumentError",
    "FileSizeExceededError",
    "CorruptedFileError",
    "ProcessingError",
]
