"""
Docling + VLM FastAPI Service
Exposes HTTP endpoints for document analysis, audio transcription, and vision tasks.

Pipeline: YOLO detection → Ornith llama.cpp VLM OCR (:8090, mmproj) → extracted text.
PDFs are parsed with docling-parse.

This service does NOT embed and does NOT write to any vector store. Embedding is owned
by the central EmbeddingGemma path (semantic_768 → Postgres pgvector → Qdrant projection).
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
LLAMA_SERVER_URL = os.environ.get("LLAMA_SERVER_URL", "http://host.docker.internal:8090").rstrip("/")
VLM_MODEL = os.environ.get("VLM_MODEL", "ornith-1.5-9b")
ORNITH_MMPROJ_PATH = os.environ.get("ORNITH_MMPROJ_PATH", "")
# Detector: YOLOX (Apache-2.0). Replaces Ultralytics YOLOv8 (AGPL-3.0).
# Primary GPU weights — official YOLOX-X checkpoint (COCO classes, same label set as YOLOv8)
YOLO_MODEL_PATH = os.environ.get("YOLO_MODEL_PATH", "/models/yolox_x.pth")
YOLOX_GPU_EXP = os.environ.get("YOLOX_GPU_EXP", "yolox-x")
# CPU fallback — YOLOX-Tiny
YOLO_CPU_FALLBACK_PATH = os.environ.get("YOLO_CPU_FALLBACK_PATH", "/models/yolox_tiny.pth")
YOLOX_CPU_EXP = os.environ.get("YOLOX_CPU_EXP", "yolox-tiny")
MAX_IMAGE_LONG_EDGE = int(os.environ.get("MAX_IMAGE_LONG_EDGE", "1536"))
OCR_TEMPERATURE = float(os.environ.get("OCR_TEMPERATURE", "0.1"))
OCR_NUM_CTX = int(os.environ.get("OCR_NUM_CTX", "8192"))

# ── Lazy singletons ───────────────────────────────────────────────────────────
docling_parser = None
whisper_model = None
yolo_model = None
yolo_model_name = None  # tracks which model is loaded


def _resolve_vlm_model(requested: str = "") -> str:
    """Keep the active VLM owner on Ornith; reject legacy Gemma/Ollama names."""
    candidate = (requested or VLM_MODEL).strip()
    if not candidate.lower().startswith("ornith-"):
        raise ValueError("VLM_MODEL_MUST_BE_ORNITH")
    return candidate


app = FastAPI(
    title="Docling + VLM Service",
    description="Document analysis, audio transcription, and Ornith VLM OCR",
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


class YoloxDetector:
    """YOLOX (Apache-2.0) detector. detect() returns plain dicts:
    {"class": str, "confidence": float, "bbox": [x1, y1, x2, y2]} in input-image pixels."""

    def __init__(self, exp_name: str, weights_path: str, device: str):
        import torch
        from yolox.exp import get_exp
        from yolox.data.data_augment import ValTransform
        from yolox.data.datasets.coco_classes import COCO_CLASSES

        self.exp = get_exp(exp_name=exp_name)
        self.model = self.exp.get_model()
        ckpt = torch.load(weights_path, map_location="cpu")
        self.model.load_state_dict(ckpt["model"])
        self.device = device
        self.model.eval().to(device)
        self.test_size = tuple(self.exp.test_size)
        self.num_classes = self.exp.num_classes
        self.nms_thre = self.exp.nmsthre
        self.names = dict(enumerate(COCO_CLASSES))
        self._preproc = ValTransform(legacy=False)

    def detect(self, image, conf: float):
        import numpy as np
        import torch
        from yolox.utils import postprocess

        bgr = np.asarray(image.convert("RGB"))[:, :, ::-1].copy()  # YOLOX expects BGR
        ratio = min(self.test_size[0] / bgr.shape[0], self.test_size[1] / bgr.shape[1])
        img, _ = self._preproc(bgr, None, self.test_size)
        tensor = torch.from_numpy(img).unsqueeze(0).float().to(self.device)
        with torch.no_grad():
            out = postprocess(self.model(tensor), self.num_classes, conf, self.nms_thre, class_agnostic=False)[0]
        if out is None:
            return []
        out = out.cpu().numpy()
        dets = []
        for row in out:
            x1, y1, x2, y2 = (row[0:4] / ratio).tolist()
            cls_id = int(row[6])
            dets.append({
                "class": self.names.get(cls_id, str(cls_id)),
                "confidence": float(row[4] * row[5]),
                "bbox": [x1, y1, x2, y2],
            })
        return dets


def get_yolo_model():
    """
    Lazy load YOLOX detector with GPU → CPU-fallback tier:

    Tier 1: YOLO_MODEL_PATH (default: yolox_x.pth, exp YOLOX_GPU_EXP) — GPU
    Tier 2: YOLO_CPU_FALLBACK_PATH (default: yolox_tiny.pth, exp YOLOX_CPU_EXP) — CPU
    """
    global yolo_model, yolo_model_name
    if yolo_model is None:
        try:
            import torch

            cuda_available = torch.cuda.is_available()

            if cuda_available:
                # Tier 1: full GPU model
                try:
                    yolo_model = YoloxDetector(YOLOX_GPU_EXP, YOLO_MODEL_PATH, "cuda")
                    yolo_model_name = YOLO_MODEL_PATH
                    print(f"✅ YOLOX GPU model loaded: {YOLO_MODEL_PATH}")
                    return yolo_model
                except Exception as e:
                    print(f"⚠️ GPU YOLOX load failed ({YOLO_MODEL_PATH}): {e} — trying CPU fallback")

            # Tier 2: tiny CPU fallback
            yolo_model = YoloxDetector(YOLOX_CPU_EXP, YOLO_CPU_FALLBACK_PATH, "cpu")
            yolo_model_name = YOLO_CPU_FALLBACK_PATH
            print(f"✅ YOLOX CPU fallback loaded: {YOLO_CPU_FALLBACK_PATH} (cuda={cuda_available})")

        except ImportError as e:
            print(f"⚠️ YOLOX not available: {e}")
        except Exception as e:
            print(f"⚠️ YOLOX model load failed: {e}")
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


def _call_ornith_vlm_sync(
    prompt: str,
    image_b64: str,
    model: str = VLM_MODEL,
) -> dict:
    """
    Call llama.cpp's OpenAI-compatible multimodal endpoint.
    Returns { text, model, tokens }.
    """
    payload = {
        "model": model,
        "messages": [{"role": "user", "content": [
            {"type": "text", "text": prompt},
            {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{image_b64}"}},
        ]}],
        "stream": False,
        "temperature": OCR_TEMPERATURE,
        "max_tokens": OCR_NUM_CTX,
    }

    resp = requests.post(
        f"{LLAMA_SERVER_URL}/v1/chat/completions",
        json=payload,
        timeout=(30, 180),
    )
    resp.raise_for_status()
    data = resp.json()
    message = data.get("choices", [{}])[0].get("message", {})
    content = message.get("content", "")
    if isinstance(content, list):
        content = "".join(part.get("text", "") for part in content if isinstance(part, dict))

    return {
        "text": content,
        "model": data.get("model", model),
        "tokens": data.get("usage", {}).get("completion_tokens", 0),
    }


async def _call_ornith_vlm_stream(
    prompt: str,
    image_b64: str,
    model: str = VLM_MODEL,
) -> AsyncGenerator[str, None]:
    """
    Async generator — converts llama.cpp OpenAI SSE chunks to the service SSE shape.
    Each line: `data: {"token": "...", "done": false}\n\n`
    """
    payload = {
        "model": model,
        "messages": [{"role": "user", "content": [
            {"type": "text", "text": prompt},
            {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{image_b64}"}},
        ]}],
        "stream": True,
        "temperature": OCR_TEMPERATURE,
        "max_tokens": OCR_NUM_CTX,
    }

    async with httpx.AsyncClient(timeout=httpx.Timeout(30.0, read=None)) as client:
        async with client.stream(
            "POST", f"{LLAMA_SERVER_URL}/v1/chat/completions", json=payload
        ) as resp:
            resp.raise_for_status()
            async for line in resp.aiter_lines():
                if not line.strip():
                    continue
                data = json.loads(line)
                if line.startswith("data:"):
                    line = line[5:].strip()
                if line == "[DONE]":
                    yield f"data: {json.dumps({'token': '', 'done': True})}\n\n"
                    break
                data = json.loads(line)
                token = data.get("choices", [{}])[0].get("delta", {}).get("content", "")
                done = False
                yield f"data: {json.dumps({'token': token, 'done': done})}\n\n"
                if done:
                    break


def _detect_doc_type(image_b64: str, model: str = VLM_MODEL) -> str:
    """Auto-detect document category via one-shot VLM classification."""
    try:
        result = _call_ornith_vlm_sync(_AUTO_DETECT_PROMPT, image_b64, model=model)
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
    vlm_ok = False
    vlm_vision = False
    try:
        r = requests.get(f"{LLAMA_SERVER_URL}/props", timeout=3)
        props = r.json() if r.ok else {}
        vlm_ok = r.ok
        vlm_vision = props.get("modalities", {}).get("vision", False) is True
    except Exception:
        pass

    return HealthResponse(
        status="healthy",
        services={
            "docling": get_docling_parser() is not None,
            "whisper": get_whisper_model() is not None,
            "yolo": get_yolo_model() is not None,
            "vlm_ocr": vlm_ok and vlm_vision,
        },
        config={
            "vlm_model": VLM_MODEL,
            "yolo_model_active": yolo_model_name or "not_loaded",
            "yolo_model_gpu": YOLO_MODEL_PATH,
            "yolo_model_cpu_fallback": YOLO_CPU_FALLBACK_PATH,
            "vlm_provider": "llama.cpp",
            "vlm_url": f"{LLAMA_SERVER_URL}/v1",
            "vlm_vision": vlm_vision,
            "ornith_mmproj_path": ORNITH_MMPROJ_PATH or "not_declared",
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
    Model loaded from YOLO_MODEL_PATH env (default: yolox_x.pth, YOLOX-X).
    Supports: PNG, JPG, BMP, WEBP.
    """
    start_time = time.time()
    model = get_yolo_model()

    if model is None:
        raise HTTPException(status_code=503, detail="YOLO model not available")

    content = await file.read()
    image = Image.open(io.BytesIO(content))

    detections = model.detect(image, confidence)
    classes = {d["class"] for d in detections}

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
    VLM-powered OCR using Ornith via llama.cpp.

    doc_type options: auto, general, table, handwriting, scan, legal
    model: optional Ornith model override; non-Ornith models are rejected.

    Optimal for: handwritten deeds, scanned court filings, mixed tables.
    Fails closed when the revision-qualified Ornith VLM is unavailable.
    """
    start_time = time.time()
    effective_model = _resolve_vlm_model(model)

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
            None, _call_ornith_vlm_sync, prompt, image_b64, effective_model
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
            detail=f"Cannot reach Ornith llama.cpp at {LLAMA_SERVER_URL}. Is the VLM server running with its projector?",
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
    effective_model = _resolve_vlm_model(model)
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
            _call_ornith_vlm_stream(prompt, image_b64, effective_model),
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
    Two-stage pipeline: YOLO region detection → Ornith VLM OCR per region.

    1. YOLO finds regions of interest (text blocks, tables, stamps)
    2. Each region is cropped and sent to Ornith VLM for precise OCR
    3. Results are merged in spatial order (top-left → bottom-right)

    Best for: complex documents with mixed layouts (evidence packets, court filings).
    """
    start_time = time.time()
    effective_model = _resolve_vlm_model(model)

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
            None, _call_ornith_vlm_sync, prompt, image_b64, effective_model
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
    boxes = []
    for det in yolo.detect(image, confidence):
        x1, y1, x2, y2 = [int(v) for v in det["bbox"]]
        boxes.append({"bbox": (x1, y1, x2, y2), "class": det["class"], "conf": det["confidence"]})

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
                None, _call_ornith_vlm_sync, prompt, region_b64, effective_model
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
