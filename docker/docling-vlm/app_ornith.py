"""Ornith-owned runtime wrapper for the legacy Docling VLM service.

The underlying `app.py` still contains historical Ollama/Gemma4 helpers for
source compatibility, but this entrypoint replaces every VLM call surface at
module runtime before FastAPI starts serving requests. The container therefore
uses the workstation llama.cpp Ornith 1.5 VLM on :8090 and does not require
Ollama for vision inference.
"""

from __future__ import annotations

import asyncio

import app as legacy
from ornith_vlm_client import (
    ORNITH_VLM_BASE_URL,
    ORNITH_VLM_MODEL,
    call_ornith_vlm_stream,
    call_ornith_vlm_sync,
    get_ornith_vlm_health,
)


# Override the legacy model identity and dynamic helper lookups used by every
# /ocr/vlm* endpoint. Python resolves these module globals when each endpoint
# executes, so existing route handlers call Ornith after this wrapper imports.
legacy.VLM_MODEL = ORNITH_VLM_MODEL
legacy._call_ollama_vlm_sync = call_ornith_vlm_sync
legacy._call_ollama_vlm_stream = call_ornith_vlm_stream


def _detect_doc_type_ornith(image_b64: str, model: str = ORNITH_VLM_MODEL) -> str:
    try:
        result = call_ornith_vlm_sync(legacy._AUTO_DETECT_PROMPT, image_b64, model=model)
        detected = result["text"].strip().lower()
        for category in legacy._OCR_PROMPTS:
            if category in detected:
                return category
    except Exception:
        pass
    return "general"


legacy._detect_doc_type = _detect_doc_type_ornith


# Remove the legacy /health route because it probes Ollama /api/tags. Replace
# it with an authority check against llama.cpp /props requiring both the
# Ornith-1.5 model family and modalities.vision=true.
legacy.app.router.routes[:] = [
    route
    for route in legacy.app.router.routes
    if getattr(route, "path", None) != "/health"
]


@legacy.app.get("/health", response_model=legacy.HealthResponse)
async def health_check():
    vlm = await asyncio.get_event_loop().run_in_executor(None, get_ornith_vlm_health)
    return legacy.HealthResponse(
        status="healthy" if vlm.get("healthy") else "degraded",
        services={
            "docling": legacy.get_docling_parser() is not None,
            "whisper": legacy.get_whisper_model() is not None,
            "yolo": legacy.get_yolo_model() is not None,
            "vlm_ocr": bool(vlm.get("healthy")),
        },
        config={
            "vlm_model": ORNITH_VLM_MODEL,
            "vlm_provider": "llama.cpp",
            "vlm_url": ORNITH_VLM_BASE_URL,
            "vlm_vision": str(bool(vlm.get("vision"))).lower(),
            "yolo_model_active": legacy.yolo_model_name or "not_loaded",
            "yolo_model_gpu": legacy.YOLO_MODEL_PATH,
            "yolo_model_cpu_fallback": legacy.YOLO_CPU_FALLBACK_PATH,
        },
    )


app = legacy.app
