"""
Docling + VLM FastAPI Service
Exposes HTTP endpoints for document analysis, audio transcription, and vision tasks.
"""

import asyncio
import io
import json
import os
import tempfile
import time
import traceback
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# Lazy imports for optional dependencies
docling_parser = None
whisper_model = None
yolo_model = None


app = FastAPI(
    title="Docling + VLM Service",
    description="Document analysis, audio transcription, and vision tasks",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# === Response Models ===
class DoclingBlock(BaseModel):
    type: str  # paragraph, heading, table, list, equation, image, transcription
    text: str
    page: int
    bbox: Optional[list[float]] = None
    timestamp_ms: Optional[int] = None


class DoclingResult(BaseModel):
    full_text: str
    blocks: list[DoclingBlock]
    page_count: int = 1
    processing_time_ms: int = 0


class TranscriptionResult(BaseModel):
    text: str
    language: str = "en"
    word_count: int
    duration_seconds: float
    segments: list[dict] = []
    processing_time_ms: int = 0


class VisionResult(BaseModel):
    detections: list[dict]
    num_objects: int
    classes: list[str]
    processing_time_ms: int = 0


class HealthResponse(BaseModel):
    status: str
    services: dict[str, bool]
    version: str = "1.0.0"


# === Service Initialization ===
def get_docling_parser():
    """Lazy load docling parser"""
    global docling_parser
    if docling_parser is None:
        try:
            from docling_parse.pdf_parser import DoclingPdfParser
            docling_parser = DoclingPdfParser(loglevel='error')
            print("✅ Docling parser loaded")
        except ImportError as e:
            print(f"⚠️ docling-parse not available: {e}")
    return docling_parser


def get_whisper_model():
    """Lazy load whisper model (small for speed)"""
    global whisper_model
    if whisper_model is None:
        try:
            import whisper
            whisper_model = whisper.load_model("small")
            print("✅ Whisper model loaded (small)")
        except ImportError as e:
            print(f"⚠️ Whisper not available: {e}")
    return whisper_model


def get_yolo_model():
    """Lazy load YOLO model"""
    global yolo_model
    if yolo_model is None:
        try:
            from ultralytics import YOLO
            yolo_model = YOLO("yolov8n.pt")  # Nano model for speed
            print("✅ YOLO model loaded (yolov8n)")
        except ImportError as e:
            print(f"⚠️ YOLO not available: {e}")
    return yolo_model


# === Endpoints ===

@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Check service health and available models"""
    return HealthResponse(
        status="healthy",
        services={
            "docling": get_docling_parser() is not None,
            "whisper": get_whisper_model() is not None,
            "yolo": get_yolo_model() is not None,
        }
    )


@app.post("/analyze", response_model=DoclingResult)
async def analyze_document(
    file: UploadFile = File(...),
    mime_type: str = Form(default="application/pdf"),
):
    """
    Analyze document using docling-parse.
    Supports: PDF, images (PNG, JPG), plain text.
    """
    start_time = time.time()
    content = await file.read()

    parser = get_docling_parser()

    # Non-PDF: basic text extraction
    if mime_type != "application/pdf":
        try:
            text_content = content.decode("utf-8", errors="ignore")
        except Exception:
            text_content = str(content)

        return DoclingResult(
            full_text=text_content,
            blocks=[DoclingBlock(type="paragraph", text=text_content, page=1)],
            page_count=1,
            processing_time_ms=int((time.time() - start_time) * 1000),
        )

    # PDF: use docling-parse
    if parser is None:
        raise HTTPException(status_code=503, detail="Docling parser not available")

    # Write to temp file (docling needs file path)
    with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
        tmp.write(content)
        tmp_path = tmp.name

    try:
        doc = parser.load(tmp_path)
        blocks = []
        full_text_parts = []

        for page_idx, page in enumerate(doc.pages):
            page_text = page.get_text()
            if page_text.strip():
                full_text_parts.append(page_text)
                blocks.append(DoclingBlock(
                    type="paragraph",
                    text=page_text.strip(),
                    page=page_idx + 1,
                ))

        return DoclingResult(
            full_text="\n\n".join(full_text_parts),
            blocks=blocks,
            page_count=len(doc.pages),
            processing_time_ms=int((time.time() - start_time) * 1000),
        )
    finally:
        os.unlink(tmp_path)


@app.post("/transcribe", response_model=TranscriptionResult)
async def transcribe_audio(
    file: UploadFile = File(...),
    language: str = Form(default="en"),
):
    """
    Transcribe audio using Whisper.
    Supports: WAV, MP3, M4A, FLAC, OGG.
    """
    start_time = time.time()
    model = get_whisper_model()

    if model is None:
        raise HTTPException(status_code=503, detail="Whisper model not available")

    content = await file.read()

    # Write to temp file
    suffix = Path(file.filename or "audio.wav").suffix or ".wav"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(content)
        tmp_path = tmp.name

    try:
        # Run transcription (in thread pool for async)
        result = await asyncio.get_event_loop().run_in_executor(
            None, lambda: model.transcribe(tmp_path, language=language)
        )

        text = result.get("text", "").strip()
        segments = result.get("segments", [])
        duration = segments[-1]["end"] if segments else 0.0

        return TranscriptionResult(
            text=text,
            language=result.get("language", language),
            word_count=len(text.split()),
            duration_seconds=duration,
            segments=[{"start": s["start"], "end": s["end"], "text": s["text"]} for s in segments],
            processing_time_ms=int((time.time() - start_time) * 1000),
        )
    finally:
        os.unlink(tmp_path)


@app.post("/detect", response_model=VisionResult)
async def detect_objects(
    file: UploadFile = File(...),
    confidence: float = Form(default=0.25),
):
    """
    Detect objects in image using YOLO.
    Supports: PNG, JPG, BMP, WEBP.
    """
    start_time = time.time()
    model = get_yolo_model()

    if model is None:
        raise HTTPException(status_code=503, detail="YOLO model not available")

    content = await file.read()

    # Load image
    from PIL import Image
    image = Image.open(io.BytesIO(content))

    # Run detection
    results = model(image, conf=confidence)[0]

    detections = []
    classes = set()
    for box in results.boxes:
        cls_id = int(box.cls[0])
        cls_name = model.names[cls_id]
        classes.add(cls_name)
        detections.append({
            "class": cls_name,
            "confidence": float(box.conf[0]),
            "bbox": box.xyxy[0].tolist(),
        })

    return VisionResult(
        detections=detections,
        num_objects=len(detections),
        classes=list(classes),
        processing_time_ms=int((time.time() - start_time) * 1000),
    )


@app.post("/extract-text")
async def extract_text(
    file: UploadFile = File(...),
    mime_type: str = Form(default="application/pdf"),
):
    """Simple text extraction endpoint (returns plain text)"""
    result = await analyze_document(file, mime_type)
    return {"text": result.full_text, "page_count": result.page_count}


# === Startup ===
@app.on_event("startup")
async def startup():
    """Pre-load models on startup (optional)"""
    preload = os.environ.get("PRELOAD_MODELS", "false").lower() == "true"
    if preload:
        print("🔄 Pre-loading models...")
        get_docling_parser()
        get_whisper_model()
        get_yolo_model()
        print("✅ All models loaded")
    else:
        print("⚡ Models will load on first request (lazy loading)")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8085)
