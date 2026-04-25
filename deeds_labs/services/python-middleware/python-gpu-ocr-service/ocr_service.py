#!/usr/bin/env python3
"""
GPU-Accelerated OCR Service using Surya OCR
Integrates with: langextract-go, Ollama embeddings, SvelteKit
CUDA 13.0 + TensorRT optimization
"""

import os
import asyncio
import subprocess
import json
from typing import Dict, List, Optional
from pathlib import Path
import tempfile

from fastapi import FastAPI, File, UploadFile, HTTPException, BackgroundTasks
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
from pydantic import BaseModel

# Surya OCR imports (GPU-accelerated)
try:
    from surya.ocr import OCRProcessor
    from surya.model.detection.model import load_model as load_detection_model
    from surya.model.recognition.model import load_model as load_recognition_model
    from PIL import Image
    import torch
    SURYA_AVAILABLE = True
    DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
except ImportError:
    SURYA_AVAILABLE = False
    DEVICE = "cpu"
    print("⚠️  Surya OCR not installed. Install with: pip install surya-ocr")

# PDF processing
try:
    from pdf2image import convert_from_path
    from PyPDF2 import PdfReader
    import pypdfium2 as pdfium
    PDF_AVAILABLE = True
except ImportError:
    PDF_AVAILABLE = False
    print("⚠️  PDF libraries not installed. Install with: pip install PyPDF2 pdf2image pypdfium2")

# Configuration
LANGEXTRACT_BINARY = os.environ.get("LANGEXTRACT_BINARY", "../langextract-go/langextract.exe")
OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://localhost:11434")
REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379")
CUDA_VISIBLE_DEVICES = os.environ.get("CUDA_VISIBLE_DEVICES", "0")

# FastAPI app
app = FastAPI(
    title="GPU OCR Service",
    description="Surya OCR + langextract-go + Ollama embeddings",
    version="1.0.0"
)

# CORS for SvelteKit
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:5178"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global OCR processor (loaded once for GPU efficiency)
ocr_processor: Optional[OCRProcessor] = None


class OCRResponse(BaseModel):
    success: bool
    text: str
    entities: Optional[Dict] = None
    embedding: Optional[List[float]] = None
    metadata: Dict
    processingTime: str


async def initialize_ocr():
    """Initialize Surya OCR models on GPU"""
    global ocr_processor

    if not SURYA_AVAILABLE:
        print("⚠️  Surya OCR not available, OCR will be disabled")
        return

    print(f"🔧 Initializing Surya OCR on {DEVICE}...")
    try:
        # Load detection and recognition models
        det_model = load_detection_model(device=DEVICE)
        rec_model = load_recognition_model(device=DEVICE)
        ocr_processor = OCRProcessor(det_model, rec_model, device=DEVICE)
        print(f"✅ Surya OCR initialized on {DEVICE}")
    except Exception as e:
        print(f"❌ Failed to initialize Surya OCR: {e}")
        ocr_processor = None


@app.on_event("startup")
async def startup_event():
    """Initialize GPU models on startup"""
    await initialize_ocr()

    # Verify langextract-go binary
    langextract_path = Path(LANGEXTRACT_BINARY)
    if langextract_path.exists():
        print(f"✅ Found langextract-go at: {langextract_path}")
    else:
        print(f"⚠️  langextract-go not found at: {langextract_path}")
        print(f"   Build it with: cd langextract-go && go build -o langextract.exe ./cmd/langextract")


async def extract_text_from_pdf(pdf_path: str) -> str:
    """Extract text from PDF using multiple strategies"""
    if not PDF_AVAILABLE:
        raise HTTPException(500, "PDF processing libraries not installed")

    text_parts = []

    # Strategy 1: Try PyPDF2 for text-based PDFs
    try:
        reader = PdfReader(pdf_path)
        for page in reader.pages:
            page_text = page.extract_text()
            if page_text.strip():
                text_parts.append(page_text)
    except Exception as e:
        print(f"PyPDF2 extraction failed: {e}")

    # Strategy 2: If no text, use OCR on images
    if not text_parts and ocr_processor:
        try:
            images = convert_from_path(pdf_path, dpi=200)
            for idx, img in enumerate(images):
                print(f"📄 OCR processing page {idx + 1}/{len(images)}...")
                result = ocr_processor.process_image(img)
                page_text = " ".join([line["text"] for line in result["text_lines"]])
                text_parts.append(page_text)
        except Exception as e:
            print(f"OCR extraction failed: {e}")

    return "\n\n".join(text_parts)


async def extract_text_from_image(image_path: str) -> str:
    """Extract text from image using Surya OCR"""
    if not ocr_processor:
        raise HTTPException(500, "OCR processor not initialized")

    try:
        img = Image.open(image_path)
        result = ocr_processor.process_image(img)
        text = " ".join([line["text"] for line in result["text_lines"]])
        return text
    except Exception as e:
        raise HTTPException(500, f"OCR failed: {str(e)}")


async def extract_entities_with_langextract(text: str) -> Dict:
    """Extract legal entities using langextract-go"""
    langextract_path = Path(LANGEXTRACT_BINARY)
    if not langextract_path.exists():
        print(f"⚠️  langextract-go not found, skipping entity extraction")
        return {"entities": [], "source": "skipped"}

    try:
        # Create temporary file for text input
        with tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False) as f:
            f.write(text)
            temp_input = f.name

        # Run langextract-go
        # Example: langextract extract --input file.txt --schema legal-entities --output json
        result = subprocess.run(
            [str(langextract_path), "extract", "--input", temp_input, "--schema", "legal-entities", "--output", "json"],
            capture_output=True,
            text=True,
            timeout=30
        )

        # Clean up temp file
        os.unlink(temp_input)

        if result.returncode == 0:
            entities = json.loads(result.stdout)
            return {"entities": entities, "source": "langextract-go"}
        else:
            print(f"langextract-go error: {result.stderr}")
            return {"entities": [], "source": "error", "error": result.stderr}

    except Exception as e:
        print(f"Entity extraction failed: {e}")
        return {"entities": [], "source": "error", "error": str(e)}


async def generate_embedding_ollama(text: str) -> Optional[List[float]]:
    """Generate embedding using Ollama embeddinggemma"""
    try:
        import aiohttp
        async with aiohttp.ClientSession() as session:
            async with session.post(
                f"{OLLAMA_URL}/api/embeddings",
                json={"model": "embeddinggemma:latest", "prompt": text},
                timeout=aiohttp.ClientTimeout(total=30)
            ) as response:
                if response.status == 200:
                    data = await response.json()
                    return data.get("embedding")
                else:
                    error_text = await response.text()
                    print(f"Ollama embedding error: {error_text}")
                    return None
    except Exception as e:
        print(f"Embedding generation failed: {e}")
        return None


@app.post("/ocr", response_model=OCRResponse)
async def process_document(
    file: UploadFile = File(...),
    extract_entities: bool = True,
    generate_embedding: bool = True
):
    """
    Process document: Extract text, entities, and embeddings
    Supports: PDF, PNG, JPG, JPEG
    """
    import time
    start_time = time.time()

    # Validate file type
    allowed_types = ["application/pdf", "image/png", "image/jpeg", "image/jpg"]
    if file.content_type not in allowed_types:
        raise HTTPException(400, f"Unsupported file type: {file.content_type}")

    # Save uploaded file temporarily
    suffix = Path(file.filename).suffix
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp_file:
        content = await file.read()
        temp_file.write(content)
        temp_path = temp_file.name

    try:
        # Step 1: Extract text
        print(f"📝 Extracting text from {file.filename} ({file.content_type})...")
        if file.content_type == "application/pdf":
            extracted_text = await extract_text_from_pdf(temp_path)
        else:
            extracted_text = await extract_text_from_image(temp_path)

        if not extracted_text.strip():
            raise HTTPException(500, "No text extracted from document")

        # Step 2: Extract entities (optional)
        entities_result = None
        if extract_entities:
            print("🔍 Extracting legal entities...")
            entities_result = await extract_entities_with_langextract(extracted_text)

        # Step 3: Generate embedding (optional)
        embedding = None
        if generate_embedding:
            print("🧠 Generating embedding with Ollama...")
            embedding = await generate_embedding_ollama(extracted_text)

        processing_time = time.time() - start_time

        return OCRResponse(
            success=True,
            text=extracted_text,
            entities=entities_result,
            embedding=embedding,
            metadata={
                "filename": file.filename,
                "fileType": file.content_type,
                "textLength": len(extracted_text),
                "device": DEVICE,
                "ocrEngine": "surya" if SURYA_AVAILABLE else "pypdf2"
            },
            processingTime=f"{processing_time:.2f}s"
        )

    finally:
        # Clean up temp file
        os.unlink(temp_path)


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "success": True,
        "services": {
            "surya_ocr": SURYA_AVAILABLE,
            "pdf_processing": PDF_AVAILABLE,
            "gpu_available": DEVICE == "cuda",
            "langextract_go": Path(LANGEXTRACT_BINARY).exists(),
            "ollama_url": OLLAMA_URL
        },
        "device": DEVICE
    }


if __name__ == "__main__":
    print("=" * 60)
    print("  GPU OCR Service")
    print("  Surya OCR + langextract-go + Ollama")
    print("=" * 60)
    print(f"  Device: {DEVICE}")
    print(f"  Ollama: {OLLAMA_URL}")
    print(f"  langextract: {LANGEXTRACT_BINARY}")
    print("=" * 60)

    uvicorn.run(
        app,
        host="0.0.0.0",
        port=int(os.environ.get("PORT", 8090)),
        log_level="info"
    )
