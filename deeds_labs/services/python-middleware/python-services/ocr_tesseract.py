#!/usr/bin/env python3
"""
Phase 70 OCR Service - Multi-Modal Document Processing
Supports PDF, images with PyTorch/Ollama/TensorRT-LLM fallback
Integrates with MinIO for storage and MCP server for orchestration
Python 3.12 + small dependencies only
"""

import os
import sys
import asyncio
import logging
from typing import Dict, List, Optional, Tuple, Any
from pathlib import Path
import tempfile
import base64
import json
from datetime import datetime

# FastAPI and related
from fastapi import FastAPI, UploadFile, File, HTTPException, BackgroundTasks
from fastapi.responses import JSONResponse
from pydantic import BaseModel
import uvicorn

# OCR and image processing
import pytesseract
from PIL import Image
import fitz  # PyMuPDF for PDF processing
import cv2
import numpy as np

# HTTP client
import httpx
import aiofiles

# Configuration
from dotenv import load_dotenv
load_dotenv()

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Phase 70 OCR Service", version="1.0.0")

# Configuration from environment
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434")
TENSORRT_URL = os.getenv("TENSORRT_LLM_URL", "http://localhost:8099")
MINIO_URL = os.getenv("MINIO_URL", "http://localhost:9000")
MCP_SERVER_URL = os.getenv("MCP_SERVER_URL", "http://localhost:3003")

# OCR Models configuration
OCR_MODELS = {
    "tesseract": {
        "enabled": True,
        "languages": ["eng", "fra", "deu", "spa"],  # English, French, German, Spanish
    },
    "ollama_vision": {
        "enabled": True,
        "models": ["llava", "bakllava", "moondream"],
        "fallback_model": "llava:latest"
    },
    "tensorrt_vision": {
        "enabled": True,
        "endpoint": "/vision/ocr",
        "model": "gemma3-legal-vision"
    }
}

class OCRRequest(BaseModel):
    image_data: str  # base64 encoded
    mime_type: str = "image/jpeg"
    languages: List[str] = ["eng"]
    enhance_image: bool = True
    use_gpu: bool = True

class OCRResponse(BaseModel):
    text: str
    confidence: float
    language: str
    processing_time: float
    method: str
    metadata: Dict[str, Any]

class DocumentOCRRequest(BaseModel):
    document_url: str
    mime_type: str
    languages: List[str] = ["eng"]
    extract_tables: bool = False
    enhance_quality: bool = True

class DocumentOCRResponse(BaseModel):
    pages: List[Dict[str, Any]]
    full_text: str
    total_pages: int
    processing_time: float
    method: str
    metadata: Dict[str, Any]

def preprocess_image(image: Image.Image) -> Image.Image:
    """Enhance image quality for better OCR results"""
    # Convert to grayscale
    if image.mode != 'L':
        image = image.convert('L')

    # Enhance contrast
    image_array = np.array(image)
    image_array = cv2.convertScaleAbs(image_array, alpha=1.5, beta=0)
    image = Image.fromarray(image_array)

    # Apply sharpening
    from PIL import ImageFilter, ImageEnhance
    image = image.filter(ImageFilter.UnsharpMask(radius=1, percent=150, threshold=3))

    # Enhance contrast further
    enhancer = ImageEnhance.Contrast(image)
    image = enhancer.enhance(2.0)

    return image

async def ocr_with_tesseract(image: Image.Image, languages: List[str] = ["eng"]) -> Tuple[str, float]:
    """Perform OCR using Tesseract"""
    try:
        # Preprocess image
        processed_image = preprocess_image(image)

        # Configure Tesseract
        custom_config = r'--oem 3 --psm 6 -c tessedit_char_whitelist=0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz .,-:;()[]{}'

        # Perform OCR
        text = pytesseract.image_to_string(
            processed_image,
            lang='+'.join(languages),
            config=custom_config
        )

        # Get confidence scores
        data = pytesseract.image_to_data(processed_image, output_type=pytesseract.Output.DICT)
        confidences = [conf for conf in data['conf'] if conf != -1]
        avg_confidence = sum(confidences) / len(confidences) if confidences else 0.0

        return text.strip(), avg_confidence / 100.0

    except Exception as e:
        logger.error(f"Tesseract OCR failed: {e}")
        return "", 0.0

async def ocr_with_ollama(image_data: str, mime_type: str, languages: List[str] = ["eng"]) -> Tuple[str, float]:
    """Perform OCR using Ollama vision models"""
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            # Try each available vision model
            for model in OCR_MODELS["ollama_vision"]["models"]:
                try:
                    response = await client.post(
                        f"{OLLAMA_URL}/api/generate",
                        json={
                            "model": f"{model}:latest",
                            "prompt": f"Extract all text from this image. Focus on legal documents, contracts, and official text. Return only the extracted text without any additional commentary: {image_data}",
                            "images": [image_data],
                            "stream": False,
                            "options": {
                                "temperature": 0.1,
                                "num_predict": 1000
                            }
                        }
                    )

                    if response.status_code == 200:
                        result = response.json()
                        text = result.get("response", "").strip()
                        if text:
                            return text, 0.85  # Ollama doesn't provide confidence scores

                except Exception as e:
                    logger.warning(f"Ollama model {model} failed: {e}")
                    continue

            # Fallback to default model
            response = await client.post(
                f"{OLLAMA_URL}/api/generate",
                json={
                    "model": OCR_MODELS["ollama_vision"]["fallback_model"],
                    "prompt": f"Extract text from this {mime_type} image. Return only the text content:",
                    "images": [image_data],
                    "stream": False
                }
            )

            if response.status_code == 200:
                result = response.json()
                return result.get("response", "").strip(), 0.75

    except Exception as e:
        logger.error(f"Ollama OCR failed: {e}")

    return "", 0.0

async def ocr_with_tensorrt(image_data: str, mime_type: str) -> Tuple[str, float]:
    """Perform OCR using TensorRT-LLM vision model"""
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                f"{TENSORRT_URL}{OCR_MODELS['tensorrt_vision']['endpoint']}",
                json={
                    "image": image_data,
                    "mime_type": mime_type,
                    "task": "ocr",
                    "model": OCR_MODELS["tensorrt_vision"]["model"]
                }
            )

            if response.status_code == 200:
                result = response.json()
                return result.get("text", "").strip(), result.get("confidence", 0.9)

    except Exception as e:
        logger.error(f"TensorRT OCR failed: {e}")

    return "", 0.0

async def perform_ocr(image_data: str, mime_type: str, languages: List[str] = ["eng"], enhance_image: bool = True) -> OCRResponse:
    """Main OCR function with fallback chain"""
    start_time = datetime.now()

    # Decode base64 image
    try:
        image_bytes = base64.b64decode(image_data)
        image = Image.open(io.BytesIO(image_bytes))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid image data: {e}")

    results = []

    # Method 1: TensorRT-LLM (fastest, most accurate)
    if OCR_MODELS["tensorrt_vision"]["enabled"]:
        text, confidence = await ocr_with_tensorrt(image_data, mime_type)
        if text and confidence > 0.7:
            results.append({
                "method": "tensorrt",
                "text": text,
                "confidence": confidence
            })

    # Method 2: Ollama Vision Models
    if OCR_MODELS["ollama_vision"]["enabled"]:
        text, confidence = await ocr_with_ollama(image_data, mime_type, languages)
        if text and confidence > 0.6:
            results.append({
                "method": "ollama",
                "text": text,
                "confidence": confidence
            })

    # Method 3: Tesseract (fallback, always available)
    if OCR_MODELS["tesseract"]["enabled"]:
        text, confidence = await ocr_with_tesseract(image, languages)
        if text:
            results.append({
                "method": "tesseract",
                "text": text,
                "confidence": confidence
            })

    # Select best result
    if not results:
        raise HTTPException(status_code=500, detail="All OCR methods failed")

    # Sort by confidence and select best
    results.sort(key=lambda x: x["confidence"], reverse=True)
    best_result = results[0]

    processing_time = (datetime.now() - start_time).total_seconds()

    return OCRResponse(
        text=best_result["text"],
        confidence=best_result["confidence"],
        language=languages[0],
        processing_time=processing_time,
        method=best_result["method"],
        metadata={
            "all_methods": [r["method"] for r in results],
            "method_count": len(results),
            "image_size": f"{image.width}x{image.height}",
            "mime_type": mime_type
        }
    )

async def process_pdf_pages(pdf_path: str, languages: List[str] = ["eng"]) -> List[Dict[str, Any]]:
    """Process all pages in a PDF document"""
    pages = []

    try:
        doc = fitz.open(pdf_path)

        for page_num in range(len(doc)):
            page = doc.load_page(page_num)

            # Convert page to image
            pix = page.get_pixmap(matrix=fitz.Matrix(2, 2))  # 2x scaling for better quality
            img_data = pix.tobytes("png")

            # Convert to base64
            img_base64 = base64.b64encode(img_data).decode()

            # OCR the page
            ocr_result = await perform_ocr(img_base64, "image/png", languages)

            pages.append({
                "page_number": page_num + 1,
                "text": ocr_result.text,
                "confidence": ocr_result.confidence,
                "method": ocr_result.method,
                "processing_time": ocr_result.processing_time
            })

    except Exception as e:
        logger.error(f"PDF processing failed: {e}")
        raise HTTPException(status_code=500, detail=f"PDF processing failed: {e}")

    return pages

@app.post("/ocr/image", response_model=OCRResponse)
async def ocr_image(request: OCRRequest):
    """OCR endpoint for single images"""
    return await perform_ocr(
        request.image_data,
        request.mime_type,
        request.languages,
        request.enhance_image
    )

@app.post("/ocr/document", response_model=DocumentOCRResponse)
async def ocr_document(request: DocumentOCRRequest):
    """OCR endpoint for documents (PDF, multi-page TIFF, etc.)"""
    start_time = datetime.now()

    try:
        # Download document from MinIO or URL
        async with httpx.AsyncClient() as client:
            response = await client.get(request.document_url)
            if response.status_code != 200:
                raise HTTPException(status_code=404, detail="Document not found")

            content = response.content

        # Save to temporary file
        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp_file:
            tmp_file.write(content)
            tmp_path = tmp_file.name

        try:
            # Process document
            if request.mime_type == "application/pdf":
                pages = await process_pdf_pages(tmp_path, request.languages)
            else:
                # For other formats, treat as single image
                img_base64 = base64.b64encode(content).decode()
                ocr_result = await perform_ocr(img_base64, request.mime_type, request.languages)
                pages = [{
                    "page_number": 1,
                    "text": ocr_result.text,
                    "confidence": ocr_result.confidence,
                    "method": ocr_result.method,
                    "processing_time": ocr_result.processing_time
                }]

            full_text = "\n\n".join([page["text"] for page in pages])
            processing_time = (datetime.now() - start_time).total_seconds()

            return DocumentOCRResponse(
                pages=pages,
                full_text=full_text,
                total_pages=len(pages),
                processing_time=processing_time,
                method="multi-modal-fallback",
                metadata={
                    "document_url": request.document_url,
                    "mime_type": request.mime_type,
                    "languages": request.languages,
                    "enhance_quality": request.enhance_quality
                }
            )

        finally:
            # Clean up temporary file
            os.unlink(tmp_path)

    except Exception as e:
        logger.error(f"Document OCR failed: {e}")
        raise HTTPException(status_code=500, detail=f"Document OCR failed: {e}")

@app.post("/ocr/upload")
async def upload_and_ocr(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    languages: str = "eng",
    callback_url: Optional[str] = None
):
    """Upload file and perform OCR asynchronously"""
    try:
        # Validate file type
        allowed_types = [
            "application/pdf",
            "image/jpeg",
            "image/png",
            "image/tiff",
            "image/webp"
        ]

        if file.content_type not in allowed_types:
            raise HTTPException(status_code=400, detail="Unsupported file type")

        # Read file content
        content = await file.read()

        # Generate document ID
        doc_id = f"ocr_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{hash(content) % 10000}"

        # Process document asynchronously
        background_tasks.add_task(
            process_document_async,
            content,
            file.content_type,
            languages.split(","),
            doc_id,
            callback_url
        )

        return JSONResponse({
            "doc_id": doc_id,
            "status": "processing",
            "message": "Document uploaded and OCR processing started"
        })

    except Exception as e:
        logger.error(f"Upload failed: {e}")
        raise HTTPException(status_code=500, detail=f"Upload failed: {e}")

async def process_document_async(
    content: bytes,
    mime_type: str,
    languages: List[str],
    doc_id: str,
    callback_url: Optional[str] = None
):
    """Process document asynchronously and send results to MCP server"""
    try:
        # Save to temporary file
        with tempfile.NamedTemporaryFile(delete=False) as tmp_file:
            tmp_file.write(content)
            tmp_path = tmp_file.name

        try:
            # Perform OCR
            if mime_type == "application/pdf":
                pages = await process_pdf_pages(tmp_path, languages)
            else:
                # Single image
                img_base64 = base64.b64encode(content).decode()
                ocr_result = await perform_ocr(img_base64, mime_type, languages)
                pages = [{
                    "page_number": 1,
                    "text": ocr_result.text,
                    "confidence": ocr_result.confidence,
                    "method": ocr_result.method,
                    "processing_time": ocr_result.processing_time
                }]

            full_text = "\n\n".join([page["text"] for page in pages])

            # Prepare result for MCP server
            result = {
                "doc_id": doc_id,
                "full_text": full_text,
                "pages": pages,
                "total_pages": len(pages),
                "mime_type": mime_type,
                "languages": languages,
                "processing_time": sum(page["processing_time"] for page in pages),
                "timestamp": datetime.now().isoformat()
            }

            # Send to MCP server
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    f"{MCP_SERVER_URL}/rag/ocr-result",
                    json=result
                )

                if response.status_code != 200:
                    logger.error(f"Failed to send OCR result to MCP server: {response.status_code}")

            # Send callback if provided
            if callback_url:
                try:
                    async with httpx.AsyncClient(timeout=10.0) as client:
                        await client.post(callback_url, json=result)
                except Exception as e:
                    logger.warning(f"Callback failed: {e}")

        finally:
            os.unlink(tmp_path)

    except Exception as e:
        logger.error(f"Async OCR processing failed for {doc_id}: {e}")

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "service": "Phase 66 OCR Service",
        "status": "healthy",
        "models": OCR_MODELS,
        "timestamp": datetime.now().isoformat()
    }

if __name__ == "__main__":
    import io  # Import here to avoid circular import
    uvicorn.run(
        "ocr_tesseract:app",
        host="0.0.0.0",
        port=int(os.getenv("OCR_PORT", "8095")),
        reload=True
    )