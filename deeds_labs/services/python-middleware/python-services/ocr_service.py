#!/usr/bin/env python3
"""
Phase 70: OCR Service
Extracts text from legal documents using Tesseract OCR
"""

import os
import sys
import asyncio
import logging
from typing import Dict, List, Optional, Any
from pathlib import Path
from fastapi import FastAPI, HTTPException, UploadFile, File
from pydantic import BaseModel
import uvicorn
import tempfile

# OCR libraries
try:
    import pytesseract
    from PIL import Image
    import pdf2image
    TESSERACT_AVAILABLE = True
except ImportError:
    TESSERACT_AVAILABLE = False

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Phase 70 OCR Service", version="1.0.0")

class OCRRequest(BaseModel):
    image_path: Optional[str] = None
    pdf_path: Optional[str] = None
    language: str = "eng"
    config: str = "--psm 6"

class OCRResponse(BaseModel):
    text: str
    confidence: float
    language: str
    processing_time: float

@app.on_event("startup")
async def startup_event():
    """Initialize OCR service"""
    if not TESSERACT_AVAILABLE:
        logger.warning("Tesseract OCR not available - install with: pip install pytesseract pillow pdf2image")
        logger.warning("Also install system packages: tesseract-ocr tesseract-ocr-eng poppler-utils")
    else:
        logger.info("✅ OCR service initialized")

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy" if TESSERACT_AVAILABLE else "degraded",
        "service": "Phase 70 OCR Service",
        "tesseract_available": TESSERACT_AVAILABLE,
        "tesseract_version": pytesseract.get_tesseract_version().base_version if TESSERACT_AVAILABLE else None
    }

@app.post("/ocr", response_model=OCRResponse)
async def perform_ocr(request: OCRRequest):
    """Perform OCR on image or PDF"""
    import time
    start_time = time.time()

    if not TESSERACT_AVAILABLE:
        raise HTTPException(status_code=503, detail="OCR service not available")

    try:
        text = ""
        confidence = 0.0

        if request.image_path:
            # Process image file
            if not os.path.exists(request.image_path):
                raise HTTPException(status_code=404, detail=f"Image file not found: {request.image_path}")

            image = Image.open(request.image_path)
            text = pytesseract.image_to_string(image, lang=request.language, config=request.config)
            confidence_data = pytesseract.image_to_data(image, lang=request.language, config=request.config, output_type=pytesseract.Output.DICT)
            confidence = sum(confidence_data['conf']) / len(confidence_data['conf']) if confidence_data['conf'] else 0

        elif request.pdf_path:
            # Process PDF file
            if not os.path.exists(request.pdf_path):
                raise HTTPException(status_code=404, detail=f"PDF file not found: {request.pdf_path}")

            # Convert PDF to images
            images = pdf2image.convert_from_path(request.pdf_path)
            text_parts = []
            confidences = []

            for image in images:
                page_text = pytesseract.image_to_string(image, lang=request.language, config=request.config)
                text_parts.append(page_text)

                confidence_data = pytesseract.image_to_data(image, lang=request.language, config=request.config, output_type=pytesseract.Output.DICT)
                if confidence_data['conf']:
                    page_conf = sum(confidence_data['conf']) / len(confidence_data['conf'])
                    confidences.append(page_conf)

            text = "\n\n".join(text_parts)
            confidence = sum(confidences) / len(confidences) if confidences else 0
        else:
            raise HTTPException(status_code=400, detail="Either image_path or pdf_path must be provided")

        processing_time = time.time() - start_time

        return OCRResponse(
            text=text.strip(),
            confidence=round(confidence, 2),
            language=request.language,
            processing_time=round(processing_time, 2)
        )

    except Exception as e:
        logger.error(f"OCR processing failed: {e}")
        raise HTTPException(status_code=500, detail=f"OCR processing failed: {e}")

@app.post("/ocr/upload")
async def ocr_upload_file(
    file: UploadFile = File(...),
    language: str = "eng",
    config: str = "--psm 6"
):
    """Upload and OCR a file"""
    import time
    start_time = time.time()

    if not TESSERACT_AVAILABLE:
        raise HTTPException(status_code=503, detail="OCR service not available")

    # Validate file type
    allowed_extensions = {'.png', '.jpg', '.jpeg', '.tiff', '.bmp', '.pdf'}
    file_extension = Path(file.filename).suffix.lower()

    if file_extension not in allowed_extensions:
        raise HTTPException(status_code=400, detail=f"Unsupported file type: {file_extension}")

    try:
        # Save uploaded file temporarily
        with tempfile.NamedTemporaryFile(delete=False, suffix=file_extension) as temp_file:
            content = await file.read()
            temp_file.write(content)
            temp_file_path = temp_file.name

        # Perform OCR
        ocr_request = OCRRequest(
            image_path=temp_file_path if file_extension != '.pdf' else None,
            pdf_path=temp_file_path if file_extension == '.pdf' else None,
            language=language,
            config=config
        )

        result = await perform_ocr(ocr_request)

        # Clean up temp file
        os.unlink(temp_file_path)

        processing_time = time.time() - start_time
        result.processing_time = round(processing_time, 2)

        return result

    except Exception as e:
        logger.error(f"Upload OCR failed: {e}")
        raise HTTPException(status_code=500, detail=f"Upload OCR failed: {e}")

@app.get("/languages")
async def get_available_languages():
    """Get available OCR languages"""
    if not TESSERACT_AVAILABLE:
        raise HTTPException(status_code=503, detail="OCR service not available")

    try:
        languages = pytesseract.get_languages()
        return {
            "available_languages": languages,
            "default": "eng"
        }
    except Exception as e:
        logger.error(f"Failed to get languages: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get languages: {e}")

if __name__ == "__main__":
    port = int(os.getenv("OCR_PORT", "8101"))
    host = os.getenv("OCR_HOST", "0.0.0.0")

    logger.info(f"🚀 Starting OCR service on {host}:{port}")
    uvicorn.run(
        "ocr_service:app",
        host=host,
        port=port,
        reload=False,
        log_level="info"
    )