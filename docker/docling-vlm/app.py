"""
Docling + VLM FastAPI Service
Exposes HTTP endpoints for document analysis, audio transcription, and vision tasks.

Pipeline: YOLO detection → Gemma4 VLM OCR → Granite Docling chunking → Qdrant embedding
"""

import asyncio
import base64
import io
import json
import os
import tempfile
import time
import traceback
from io import BytesIO
from pathlib import Path
from typing import AsyncGenerator, Optional

import httpx
import requests
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from PIL import Image
from pydantic import BaseModel

# ── Config from env ───────────────────────────────────────────────────────────
OLLAMA_BASE_URL = os.environ.get("OLLAMA_BASE_URL", "http://host.docker.internal:11434")
VLM_MODEL = os.environ.get("VLM_MODEL", "gemma4:e4b")
# Primary GPU model — set to /models/yolov8x.pt for the full 131MB model
YOLO_MODEL_PATH = os.environ.get("YOLO_MODEL_PATH", "yolov8x.pt")
# CPU fallback — nano stays as TurboQuant / ONNX fallback path
YOLO_CPU_FALLBACK_PATH = os.environ.get("YOLO_CPU_FALLBACK_PATH", "yolov8n.pt")
MAX_IMAGE_LONG_EDGE = int(os.environ.get("MAX_IMAGE_LONG_EDGE", "1536"))
OCR_TEMPERATURE = float(os.environ.get("OCR_TEMPERATURE", "0.1"))
OCR_NUM_CTX = int(os.environ.get("OCR_NUM_CTX", "8192"))

# ── Lazy singletons ───────────────────────────────────────────────────────────
docling_parser = None
whisper_model = None
yolo_model = None
yolo_model_name = None  # tracks which model is loaded


app = FastAPI(
    title="Docling + VLM Service",
    description="Document analysis, audio transcription, and Gemma4 VLM OCR",
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Response Models ───────────────────────────────────────────────────────────

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


class VLMOCRResult(BaseModel):
    text: str
    doc_type: str
    model: str
    tokens: int
    confidence: Optional[float] = None
    processing_time_ms: int = 0


class HealthResponse(BaseModel):
    status: str
    services: dict[str, bool]
    config: dict[str, str]
    version: str = "2.0.0"


# ── VLM OCR Prompts ───────────────────────────────────────────────────────────

_OCR_PROMPTS = {
    "general": (
        "You are a precise OCR engine. Extract ALL text from this image.\n"
        "Rules:\n"
        "1. Preserve the original layout, paragraph breaks, and formatting.\n"
        "2. For tables, output in Markdown table format.\n"
        "3. Keep original languages — do NOT translate.\n"
        "4. If text is unclear, mark it as [unclear: best_guess].\n"
        "5. Output ONLY the extracted text, no commentary."
    ),
    "table": (
        "You are a precise OCR engine specialized in tables and structured data.\n"
        "Extract ALL content from this image.\n"
        "Rules:\n"
        "1. Output tables in Markdown table format with proper alignment.\n"
        "2. Preserve all numbers, currencies, and units exactly.\n"
        "3. For merged cells, repeat the content in each spanned position.\n"
        "4. Keep original languages — do NOT translate.\n"
        "5. Output ONLY the extracted content, no commentary."
    ),
    "handwriting": (
        "You are a precise OCR engine specialized in handwritten text.\n"
        "Extract ALL handwritten and printed text from this image.\n"
        "Rules:\n"
        "1. Do your best to decipher handwriting accurately.\n"
        "2. If a word is ambiguous, provide your best guess marked as [guess: word].\n"
        "3. Preserve line breaks and spatial layout.\n"
        "4. Keep original languages — do NOT translate.\n"
        "5. Output ONLY the extracted text, no commentary."
    ),
    "scan": (
        "You are a precise OCR engine for scanned legal documents.\n"
        "Extract ALL text from this scanned page image.\n"
        "Rules:\n"
        "1. Ignore scanning artifacts, watermarks, and background noise.\n"
        "2. Preserve headings, paragraphs, lists, and table structures.\n"
        "3. For tables, use Markdown table format.\n"
        "4. Keep original languages — do NOT translate.\n"
        "5. Output ONLY the extracted text, no commentary."
    ),
    "legal": (
        "You are a precise OCR engine specialized in legal documents (deeds, contracts, court filings).\n"
        "Extract ALL text from this image with legal precision.\n"
        "Rules:\n"
        "1. Preserve ALL formatting — paragraph numbers, section headers, indentation.\n"
        "2. For signature blocks, mark clearly as [SIGNATURE BLOCK: name/title if visible].\n"
        "3. For stamps/seals, mark as [STAMP: text if readable].\n"
        "4. Preserve all dates, dollar amounts, and legal citations exactly.\n"
        "5. If text is obscured or unclear, mark as [REDACTED] or [unclear: best_guess].\n"
        "6. Output ONLY the extracted text in document order, no commentary."
    ),
}

_AUTO_DETECT_PROMPT = (
    "Classify this image into exactly ONE category. "
    "Reply with ONLY the category name, nothing else.\n"
    "Categories: general, table, handwriting, scan, legal"
)


# ── Service Initialization ────────────────────────────────────────────────────

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
    """
    Lazy load YOLO model with GPU → CPU-fallback tier:

    Tier 1: YOLO_MODEL_PATH (default: yolov8x.pt) — GPU, 131MB, full accuracy
    Tier 2: YOLO_CPU_FALLBACK_PATH (default: yolov8n.pt) — CPU/TurboQuant ONNX fallback

    The nano fallback is intentionally kept lightweight so TurboQuant can also
    load it as an ONNX export without pulling the full 131MB weights.
    """
    global yolo_model, yolo_model_name
    if yolo_model is None:
        try:
            from ultralytics import YOLO
            import torch

            cuda_available = torch.cuda.is_available()

            if cuda_available:
                # Tier 1: full GPU model
                try:
                    yolo_model = YOLO(YOLO_MODEL_PATH)
                    yolo_model_name = YOLO_MODEL_PATH
                    print(f"✅ YOLO GPU model loaded: {YOLO_MODEL_PATH}")
                    return yolo_model
                except Exception as e:
                    print(f"⚠️ GPU YOLO load failed ({YOLO_MODEL_PATH}): {e} — trying CPU fallback")

            # Tier 2: nano CPU fallback (also used by TurboQuant ONNX path)
            yolo_model = YOLO(YOLO_CPU_FALLBACK_PATH)
            yolo_model_name = YOLO_CPU_FALLBACK_PATH
            print(f"✅ YOLO CPU fallback loaded: {YOLO_CPU_FALLBACK_PATH} (cuda={cuda_available})")

        except ImportError as e:
            print(f"⚠️ YOLO not available: {e}")
        except Exception as e:
            print(f"⚠️ YOLO model load failed: {e}")
    return yolo_model


# ── VLM OCR Helpers ───────────────────────────────────────────────────────────

def _resize_image(image: Image.Image, max_long_edge: int = MAX_IMAGE_LONG_EDGE) -> Image.Image:
    """Scale image so longest edge ≤ max_long_edge (preserves aspect ratio)."""
    w, h = image.size
    if max(w, h) <= max_long_edge:
        return image
    scale = max_long_edge / max(w, h)
    return image.resize((int(w * scale), int(h * scale)), Image.LANCZOS)


def _image_bytes_to_b64(image_bytes: bytes) -> str:
    """Convert raw image bytes to base64 PNG string (resizes if needed)."""
    img = Image.open(BytesIO(image_bytes)).convert("RGB")
    img = _resize_image(img)
    buf = BytesIO()
    img.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode("utf-8")


def _call_ollama_vlm_sync(
    prompt: str,
    image_b64: str,
    model: str = VLM_MODEL,
) -> dict:
    """
    Call Ollama /api/chat with image in streaming mode.
    Returns { text, model, tokens }.
    """
    payload = {
        "model": model,
        "messages": [{"role": "user", "content": prompt, "images": [image_b64]}],
        "stream": True,
        "options": {"num_ctx": OCR_NUM_CTX, "temperature": OCR_TEMPERATURE},
    }

    resp = requests.post(
        f"{OLLAMA_BASE_URL}/api/chat",
        json=payload,
        timeout=(30, None),
        stream=True,
    )
    resp.raise_for_status()

    chunks = []
    last_chunk: dict = {}
    for line in resp.iter_lines(decode_unicode=True):
        if not line:
            continue
        data = json.loads(line)
        token = data.get("message", {}).get("content", "")
        if token:
            chunks.append(token)
        if data.get("done"):
            last_chunk = data

    return {
        "text": "".join(chunks),
        "model": last_chunk.get("model", model),
        "tokens": last_chunk.get("eval_count", 0),
    }


async def _call_ollama_vlm_stream(
    prompt: str,
    image_b64: str,
    model: str = VLM_MODEL,
) -> AsyncGenerator[str, None]:
    """
    Async generator — yields SSE lines from Ollama VLM (streaming).
    Each line: `data: {"token": "...", "done": false}\n\n`
    """
    payload = {
        "model": model,
        "messages": [{"role": "user", "content": prompt, "images": [image_b64]}],
        "stream": True,
        "options": {"num_ctx": OCR_NUM_CTX, "temperature": OCR_TEMPERATURE},
    }

    async with httpx.AsyncClient(timeout=httpx.Timeout(30.0, read=None)) as client:
        async with client.stream(
            "POST", f"{OLLAMA_BASE_URL}/api/chat", json=payload
        ) as resp:
            resp.raise_for_status()
            async for line in resp.aiter_lines():
                if not line.strip():
                    continue
                data = json.loads(line)
                token = data.get("message", {}).get("content", "")
                done = data.get("done", False)
                yield f"data: {json.dumps({'token': token, 'done': done})}\n\n"
                if done:
                    break


def _detect_doc_type(image_b64: str, model: str = VLM_MODEL) -> str:
    """Auto-detect document category via one-shot VLM classification."""
    try:
        result = _call_ollama_vlm_sync(_AUTO_DETECT_PROMPT, image_b64, model=model)
        detected = result["text"].strip().lower()
        for cat in _OCR_PROMPTS:
            if cat in detected:
                return cat
    except Exception:
        pass
    return "general"


# ── Endpoints ─────────────────────────────────────────────────────────────────

@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Check service health and available models."""
    ollama_ok = False
    try:
        r = requests.get(f"{OLLAMA_BASE_URL}/api/tags", timeout=3)
        ollama_ok = r.status_code == 200
    except Exception:
        pass

    return HealthResponse(
        status="healthy",
        services={
            "docling": get_docling_parser() is not None,
            "whisper": get_whisper_model() is not None,
            "yolo": get_yolo_model() is not None,
            "vlm_ocr": ollama_ok,
        },
        config={
            "vlm_model": VLM_MODEL,
            "yolo_model_active": yolo_model_name or "not_loaded",
            "yolo_model_gpu": YOLO_MODEL_PATH,
            "yolo_model_cpu_fallback": YOLO_CPU_FALLBACK_PATH,
            "ollama_url": OLLAMA_BASE_URL,
        },
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

    suffix = Path(file.filename or "audio.wav").suffix or ".wav"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(content)
        tmp_path = tmp.name

    try:
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
    Model loaded from YOLO_MODEL_PATH env (default: yolov8n.pt).
    Supports: PNG, JPG, BMP, WEBP.
    """
    start_time = time.time()
    model = get_yolo_model()

    if model is None:
        raise HTTPException(status_code=503, detail="YOLO model not available")

    content = await file.read()
    image = Image.open(io.BytesIO(content))

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


@app.post("/ocr/vlm", response_model=VLMOCRResult)
async def ocr_vlm(
    file: UploadFile = File(...),
    doc_type: str = Form(default="auto"),
    model: str = Form(default=""),
):
    """
    VLM-powered OCR using Gemma4 via Ollama.

    doc_type options: auto, general, table, handwriting, scan, legal
    model: override VLM_MODEL env (default: gemma4:e4b)

    Optimal for: handwritten deeds, scanned court filings, mixed tables.
    Falls back gracefully when Ollama is unavailable.
    """
    start_time = time.time()
    effective_model = model.strip() or VLM_MODEL

    content = await file.read()

    try:
        image_b64 = await asyncio.get_event_loop().run_in_executor(
            None, _image_bytes_to_b64, content
        )

        # Auto-detect document type
        if doc_type == "auto":
            doc_type = await asyncio.get_event_loop().run_in_executor(
                None, _detect_doc_type, image_b64, effective_model
            )

        prompt = _OCR_PROMPTS.get(doc_type, _OCR_PROMPTS["general"])

        result = await asyncio.get_event_loop().run_in_executor(
            None, _call_ollama_vlm_sync, prompt, image_b64, effective_model
        )

        return VLMOCRResult(
            text=result["text"],
            doc_type=doc_type,
            model=result["model"],
            tokens=result["tokens"],
            processing_time_ms=int((time.time() - start_time) * 1000),
        )

    except requests.exceptions.ConnectionError:
        raise HTTPException(
            status_code=503,
            detail=f"Cannot reach Ollama at {OLLAMA_BASE_URL}. Is it running?",
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"VLM OCR failed: {e}")


@app.post("/ocr/vlm/stream")
async def ocr_vlm_stream(
    file: UploadFile = File(...),
    doc_type: str = Form(default="auto"),
    model: str = Form(default=""),
):
    """
    Streaming VLM OCR — returns SSE stream of tokens.

    Each event: `data: {"token": "...", "done": false}`
    Final event: `data: {"token": "", "done": true}`

    Use for long documents where you want incremental display.
    """
    effective_model = model.strip() or VLM_MODEL
    content = await file.read()

    try:
        image_b64 = await asyncio.get_event_loop().run_in_executor(
            None, _image_bytes_to_b64, content
        )

        if doc_type == "auto":
            doc_type = await asyncio.get_event_loop().run_in_executor(
                None, _detect_doc_type, image_b64, effective_model
            )

        prompt = _OCR_PROMPTS.get(doc_type, _OCR_PROMPTS["general"])

        return StreamingResponse(
            _call_ollama_vlm_stream(prompt, image_b64, effective_model),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "X-Accel-Buffering": "no",
                "X-Doc-Type": doc_type,
            },
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"VLM OCR stream failed: {e}")


@app.post("/ocr/yolo-vlm")
async def ocr_yolo_vlm(
    file: UploadFile = File(...),
    doc_type: str = Form(default="auto"),
    confidence: float = Form(default=0.25),
    model: str = Form(default=""),
):
    """
    Two-stage pipeline: YOLO region detection → Gemma4 VLM OCR per region.

    1. YOLO finds regions of interest (text blocks, tables, stamps)
    2. Each region is cropped and sent to Gemma4 VLM for precise OCR
    3. Results are merged in spatial order (top-left → bottom-right)

    Best for: complex documents with mixed layouts (evidence packets, court filings).
    """
    start_time = time.time()
    effective_model = model.strip() or VLM_MODEL

    yolo = get_yolo_model()
    content = await file.read()

    # Full-image VLM OCR if YOLO not available
    if yolo is None:
        image_b64 = await asyncio.get_event_loop().run_in_executor(
            None, _image_bytes_to_b64, content
        )
        if doc_type == "auto":
            doc_type = await asyncio.get_event_loop().run_in_executor(
                None, _detect_doc_type, image_b64, effective_model
            )
        prompt = _OCR_PROMPTS.get(doc_type, _OCR_PROMPTS["general"])
        result = await asyncio.get_event_loop().run_in_executor(
            None, _call_ollama_vlm_sync, prompt, image_b64, effective_model
        )
        return {
            "text": result["text"],
            "doc_type": doc_type,
            "model": result["model"],
            "regions": 0,
            "pipeline": "vlm-only",
            "processing_time_ms": int((time.time() - start_time) * 1000),
        }

    # Stage 1: YOLO detection
    image = Image.open(io.BytesIO(content)).convert("RGB")
    yolo_results = yolo(image, conf=confidence)[0]

    boxes = []
    for box in yolo_results.boxes:
        x1, y1, x2, y2 = [int(v) for v in box.xyxy[0].tolist()]
        cls_name = yolo.names[int(box.cls[0])]
        boxes.append({"bbox": (x1, y1, x2, y2), "class": cls_name, "conf": float(box.conf[0])})

    # Sort regions top-left → bottom-right (reading order)
    boxes.sort(key=lambda b: (b["bbox"][1] // 50, b["bbox"][0]))

    # Stage 2: VLM OCR per region (or full image if no regions found)
    if not boxes:
        boxes = [{"bbox": (0, 0, image.width, image.height), "class": "full_page", "conf": 1.0}]

    region_texts = []
    total_tokens = 0

    for region in boxes:
        x1, y1, x2, y2 = region["bbox"]
        # Add 8px padding
        x1 = max(0, x1 - 8)
        y1 = max(0, y1 - 8)
        x2 = min(image.width, x2 + 8)
        y2 = min(image.height, y2 + 8)

        crop = image.crop((x1, y1, x2, y2))
        buf = BytesIO()
        crop.save(buf, format="PNG")
        region_b64 = base64.b64encode(buf.getvalue()).decode("utf-8")

        # Determine prompt based on YOLO class or doc_type
        region_doc_type = doc_type
        if doc_type == "auto":
            cls = region["class"].lower()
            if "table" in cls:
                region_doc_type = "table"
            elif "hand" in cls or "sign" in cls:
                region_doc_type = "handwriting"
            else:
                region_doc_type = "general"

        prompt = _OCR_PROMPTS.get(region_doc_type, _OCR_PROMPTS["general"])

        try:
            ocr_result = await asyncio.get_event_loop().run_in_executor(
                None, _call_ollama_vlm_sync, prompt, region_b64, effective_model
            )
            region_texts.append(ocr_result["text"].strip())
            total_tokens += ocr_result["tokens"]
        except Exception as e:
            region_texts.append(f"[OCR failed for region: {e}]")

    full_text = "\n\n".join(t for t in region_texts if t)

    return {
        "text": full_text,
        "doc_type": doc_type,
        "model": effective_model,
        "regions": len(boxes),
        "pipeline": "yolo-vlm",
        "tokens": total_tokens,
        "processing_time_ms": int((time.time() - start_time) * 1000),
    }


@app.post("/extract-text")
async def extract_text(
    file: UploadFile = File(...),
    mime_type: str = Form(default="application/pdf"),
):
    """Simple text extraction endpoint (returns plain text)"""
    result = await analyze_document(file, mime_type)
    return {"text": result.full_text, "page_count": result.page_count}


# ── Startup ───────────────────────────────────────────────────────────────────

@app.on_event("startup")
async def startup():
    """Pre-load models on startup if PRELOAD_MODELS=true"""
    preload = os.environ.get("PRELOAD_MODELS", "false").lower() == "true"
    print(f"🚀 Docling+VLM service starting — model={VLM_MODEL}, yolo={YOLO_MODEL_PATH}")
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
