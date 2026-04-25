"""Document type classification."""

import magic
import structlog
from enum import Enum
from pathlib import Path
from typing import Optional

logger = structlog.get_logger(__name__)


class DocumentType(str, Enum):
    """Document type enumeration."""
    PDF = "pdf"
    IMAGE = "image"
    SCANNED = "scanned"
    MIXED = "mixed"
    UNKNOWN = "unknown"


# MIME type mappings
MIME_TO_TYPE = {
    "application/pdf": DocumentType.PDF,
    "image/jpeg": DocumentType.IMAGE,
    "image/png": DocumentType.IMAGE,
    "image/tiff": DocumentType.SCANNED,
    "image/x-tiff": DocumentType.SCANNED,
}

# File extension mappings
EXTENSION_TO_TYPE = {
    ".pdf": DocumentType.PDF,
    ".jpg": DocumentType.IMAGE,
    ".jpeg": DocumentType.IMAGE,
    ".png": DocumentType.IMAGE,
    ".tif": DocumentType.SCANNED,
    ".tiff": DocumentType.SCANNED,
}


def classify_document(file_path: str) -> DocumentType:
    """
    Classify a document by type.

    Supports:
    - PDF: application/pdf
    - Image: JPEG, PNG
    - Scanned: TIFF (multi-page)
    - Mixed: Multiple types

    Args:
        file_path: Path to the document file

    Returns:
        DocumentType: Classified document type
    """
    try:
        path = Path(file_path)

        # Check file exists
        if not path.exists():
            logger.error("File not found", file_path=file_path)
            return DocumentType.UNKNOWN

        # Get MIME type using magic bytes
        mime = magic.Magic(mime=True)
        mime_type = mime.from_file(file_path)

        logger.info("Detected MIME type", file_path=file_path, mime_type=mime_type)

        # Check MIME type mapping
        if mime_type in MIME_TO_TYPE:
            doc_type = MIME_TO_TYPE[mime_type]
            logger.info("Classified by MIME type", file_path=file_path, type=doc_type)
            return doc_type

        # Fallback to extension mapping
        extension = path.suffix.lower()
        if extension in EXTENSION_TO_TYPE:
            doc_type = EXTENSION_TO_TYPE[extension]
            logger.info("Classified by extension", file_path=file_path, type=doc_type)
            return doc_type

        # Unknown type
        logger.warning("Unknown document type", file_path=file_path, mime_type=mime_type)
        return DocumentType.UNKNOWN

    except Exception as e:
        logger.error("Failed to classify document", file_path=file_path, error=str(e))
        return DocumentType.UNKNOWN


def get_processing_pipeline(doc_type: DocumentType) -> Optional[str]:
    """
    Get the processing pipeline for a document type.

    Args:
        doc_type: Document type

    Returns:
        str: Pipeline name (ocr, parsing, or None for unknown)
    """
    if doc_type in [DocumentType.IMAGE, DocumentType.SCANNED]:
        return "ocr"
    elif doc_type == DocumentType.PDF:
        return "parsing"
    else:
        return None
