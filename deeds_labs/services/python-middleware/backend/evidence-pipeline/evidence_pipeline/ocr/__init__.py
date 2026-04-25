"""OCR processing module."""

from evidence_pipeline.ocr.tesseract_engine import extract_text_from_image
from evidence_pipeline.ocr.preprocessing import preprocess_image

__all__ = ["extract_text_from_image", "preprocess_image"]
