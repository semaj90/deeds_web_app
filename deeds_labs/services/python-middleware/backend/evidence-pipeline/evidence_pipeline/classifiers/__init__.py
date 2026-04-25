"""Document classification module."""

from evidence_pipeline.classifiers.document_classifier import (
    classify_document,
    DocumentType,
)

__all__ = ["classify_document", "DocumentType"]
