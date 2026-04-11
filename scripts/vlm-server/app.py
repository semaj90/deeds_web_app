#!/usr/bin/env python3
"""
Gemma 4 E4B Legal VLM Server — FastAPI + HF Transformers + NF4 quantization.

Serves the merged legal VLM checkpoint via OpenAI-compatible endpoints:
  POST /v1/chat/completions   — text chat (OpenAI format)
  POST /analyze-document      — image + text analysis (multipart upload)
  GET  /health                — model status + VRAM usage

Architecture:
  gemma4-legal-vlm-merged/ (HF safetensors) + bitsandbytes NF4
  → ~4 GB VRAM on RTX 3060 Ti (8 GB total)
  → Full VLM: vision_tower + audio_tower + embed_vision + embed_audio

Usage:
  pip install -r requirements.txt
  python app.py --model ./gemma4-legal-vlm-merged --port 8085

  # Or with HuggingFace Hub:
  python app.py --model Semaj90/gemma4-e4b-legal-vlm-merged --port 8085

Port 8085 is chosen to avoid conflicts with:
  :8070 — LiteRT-LM (CPU sidecar)
  :8090 — TurboQuant llama-server (GGUF text-only)
  :8099 — TensorRT-LLM
  :11434 — Ollama
"""

import argparse
import base64
import gc
import io
import json
import logging
import os
import sys
import time
import uuid
from contextlib import asynccontextmanager
from typing import Optional

import torch
from PIL import Image

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("vlm-server")

# ── Config ────────────────────────────────────────────────────────────────
MODEL_ID = os.environ.get("VLM_MODEL", "google/gemma-4-E4B-it")
ADAPTER_PATH = os.environ.get("VLM_ADAPTER", "")
MAX_NEW_TOKENS = int(os.environ.get("VLM_MAX_TOKENS", "512"))

# ── Global state ──────────────────────────────────────────────────────────
_model = None
_processor = None
_device = None
_stats = {"requests": 0, "errors": 0, "total_ms": 0, "vision_requests": 0}


def _load_model(model_id: str, adapter_path: str = ""):
    """Load Gemma 4 E4B with NF4 quantization (bitsandbytes), optionally with PEFT LoRA adapter."""
    global _model, _processor, _device

    from transformers import AutoModelForCausalLM, AutoProcessor, BitsAndBytesConfig

    # Unsloth pre-quantized models don't ship processor files — load from Google base
    processor_id = "google/gemma-4-E4B-it" if "unsloth/" in model_id else model_id
    logger.info("Loading processor from: %s", processor_id)
    _processor = AutoProcessor.from_pretrained(processor_id, trust_remote_code=True)

    # NF4 quantization config — fits E4B in ~4 GB VRAM on RTX 3060 Ti
    bnb_config = BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_quant_type="nf4",
        bnb_4bit_compute_dtype=torch.bfloat16,
        bnb_4bit_use_double_quant=True,  # nested quantization for extra savings
    )

    # Set max GPU memory to leave headroom for KV cache + inference
    vram_total = torch.cuda.get_device_properties(0).total_memory // (1024**2) if torch.cuda.is_available() else 0
    max_gpu_mb = max(vram_total - 1500, 4000)  # reserve 1.5 GB for KV cache + OS
    logger.info("Loading model with NF4 quantization: %s (max GPU: %d MB)", model_id, max_gpu_mb)

    _model = AutoModelForCausalLM.from_pretrained(
        model_id,
        quantization_config=bnb_config,
        device_map="auto",
        max_memory={0: f"{max_gpu_mb}MB", "cpu": "8GB"},
        trust_remote_code=True,
        dtype=torch.bfloat16,
    )

    # Apply PEFT LoRA adapter if provided
    if adapter_path:
        from peft import PeftModel
        logger.info("Applying LoRA adapter from: %s", adapter_path)
        _model = PeftModel.from_pretrained(_model, adapter_path)
        _model = _model.merge_and_unload()
        logger.info("LoRA adapter merged and unloaded.")

    _model.eval()

    _device = next(_model.parameters()).device
    vram_mb = torch.cuda.memory_allocated() / 1024**2
    vram_total = torch.cuda.get_device_properties(0).total_memory / 1024**2 if torch.cuda.is_available() else 0

    # Audit multimodal components
    vision_params = sum(p.numel() for n, p in _model.named_parameters() if "vision_tower" in n)
    audio_params = sum(p.numel() for n, p in _model.named_parameters() if "audio_tower" in n)
    embedder_params = sum(p.numel() for n, p in _model.named_parameters() if "embed_vision" in n or "embed_audio" in n)
    total_params = sum(p.numel() for p in _model.parameters())

    logger.info("Model loaded:")
    logger.info("  Total params:     %s", f"{total_params:,}")
    logger.info("  vision_tower:     %s", f"{vision_params:,}")
    logger.info("  audio_tower:      %s", f"{audio_params:,}")
    logger.info("  embed_vision/audio: %s", f"{embedder_params:,}")
    logger.info("  VRAM used:        %.0f / %.0f MB", vram_mb, vram_total)
    logger.info("  VLM capable:      %s", "YES" if vision_params > 0 else "NO (text-only)")


def _unload_model():
    global _model, _processor, _device
    del _model, _processor
    _model = None
    _processor = None
    _device = None
    gc.collect()
    if torch.cuda.is_available():
        torch.cuda.empty_cache()
    logger.info("Model unloaded.")


# ── FastAPI ───────────────────────────────────────────────────────────────
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

import asyncio


@asynccontextmanager
async def lifespan(app: FastAPI):
    _load_model(MODEL_ID, ADAPTER_PATH)
    yield
    _unload_model()


app = FastAPI(
    title="Gemma 4 Legal VLM Server",
    version="0.1.0",
    description="Multimodal legal inference — text + vision + audio via HF Transformers + NF4",
    lifespan=lifespan,
)


# ── Request/response models ──────────────────────────────────────────────
class ChatMessage(BaseModel):
    role: str
    content: str | list = ""


class ChatRequest(BaseModel):
    model: str = Field(default="gemma4-legal-vlm")
    messages: list[ChatMessage]
    max_tokens: int = Field(default=512, ge=1, le=4096)
    temperature: float = Field(default=0.3, ge=0.0, le=2.0)
    stream: bool = False


# ── Inference helpers ─────────────────────────────────────────────────────
def _extract_images_from_messages(messages: list[ChatMessage]) -> tuple[list[Image.Image], str]:
    """Extract images and build text prompt from OpenAI-style messages."""
    images = []
    text_parts = []

    for msg in messages:
        if isinstance(msg.content, str):
            text_parts.append(f"{msg.role}: {msg.content}")
        elif isinstance(msg.content, list):
            for part in msg.content:
                if isinstance(part, dict):
                    if part.get("type") == "text":
                        text_parts.append(part["text"])
                    elif part.get("type") == "image_url":
                        url = part.get("image_url", {}).get("url", "")
                        if url.startswith("data:"):
                            # base64 data URI
                            _, b64data = url.split(",", 1)
                            img_bytes = base64.b64decode(b64data)
                            images.append(Image.open(io.BytesIO(img_bytes)).convert("RGB"))
                    elif part.get("type") == "image":
                        # Direct PIL image reference (internal use)
                        if "image" in part and isinstance(part["image"], Image.Image):
                            images.append(part["image"].convert("RGB"))

    return images, "\n".join(text_parts)


def _generate_text(prompt: str, max_tokens: int, temperature: float) -> tuple[str, int, int]:
    """Text-only generation."""
    inputs = _processor(text=prompt, return_tensors="pt").to(_device)
    prompt_len = inputs["input_ids"].shape[-1]

    with torch.inference_mode():
        outputs = _model.generate(
            **inputs,
            max_new_tokens=max_tokens,
            temperature=max(temperature, 0.01),
            do_sample=temperature > 0,
        )

    response_ids = outputs[0][prompt_len:]
    text = _processor.decode(response_ids, skip_special_tokens=True)
    return text, prompt_len, len(response_ids)


def _generate_vlm(images: list[Image.Image], prompt: str, max_tokens: int, temperature: float) -> tuple[str, int, int]:
    """Vision+text generation using Gemma 4's native multimodal pipeline."""
    # Build Gemma 4 multimodal message format
    content_parts = []
    for img in images:
        content_parts.append({"type": "image", "image": img})
    content_parts.append({"type": "text", "text": prompt})

    messages = [{"role": "user", "content": content_parts}]
    text_input = _processor.apply_chat_template(messages, add_generation_prompt=True, tokenize=False)

    inputs = _processor(
        text=text_input,
        images=images if images else None,
        return_tensors="pt",
    ).to(_device)

    prompt_len = inputs["input_ids"].shape[-1]

    with torch.inference_mode():
        outputs = _model.generate(
            **inputs,
            max_new_tokens=max_tokens,
            temperature=max(temperature, 0.01),
            do_sample=temperature > 0,
        )

    response_ids = outputs[0][prompt_len:]
    text = _processor.decode(response_ids, skip_special_tokens=True)
    return text, prompt_len, len(response_ids)


# ── Endpoints ─────────────────────────────────────────────────────────────
@app.get("/health")
async def health():
    vram_used = torch.cuda.memory_allocated() / 1024**2 if torch.cuda.is_available() else 0
    vram_total = torch.cuda.get_device_properties(0).total_memory / 1024**2 if torch.cuda.is_available() else 0
    return {
        "status": "ok" if _model else "degraded",
        "model": MODEL_ID,
        "backend": "hf-transformers-nf4",
        "vlm_capable": _model is not None and any("vision_tower" in n for n, _ in _model.named_parameters()),
        "vram_mb": round(vram_used),
        "vram_total_mb": round(vram_total),
        "stats": _stats,
    }


@app.get("/v1/models")
async def list_models():
    return {
        "object": "list",
        "data": [{"id": "gemma4-legal-vlm", "object": "model", "owned_by": "local"}],
    }


@app.post("/v1/chat/completions")
async def chat_completions(req: ChatRequest):
    """OpenAI-compatible chat endpoint. Supports text and base64 image inputs."""
    if _model is None:
        raise HTTPException(503, "Model not loaded")

    _stats["requests"] += 1
    t0 = time.time()

    try:
        images, prompt = _extract_images_from_messages(req.messages)

        if images:
            _stats["vision_requests"] += 1
            response_text, prompt_tokens, completion_tokens = await asyncio.to_thread(
                _generate_vlm, images, prompt, req.max_tokens, req.temperature
            )
        else:
            response_text, prompt_tokens, completion_tokens = await asyncio.to_thread(
                _generate_text, prompt, req.max_tokens, req.temperature
            )
    except Exception as e:
        _stats["errors"] += 1
        logger.exception("Inference error")
        raise HTTPException(500, str(e))

    elapsed_ms = round((time.time() - t0) * 1000, 1)
    _stats["total_ms"] += elapsed_ms

    return {
        "id": f"chatcmpl-{uuid.uuid4().hex[:12]}",
        "object": "chat.completion",
        "created": int(time.time()),
        "model": "gemma4-legal-vlm",
        "choices": [{
            "index": 0,
            "message": {"role": "assistant", "content": response_text},
            "finish_reason": "stop",
        }],
        "usage": {
            "prompt_tokens": prompt_tokens,
            "completion_tokens": completion_tokens,
            "total_tokens": prompt_tokens + completion_tokens,
        },
        "timings": {"total_ms": elapsed_ms, "is_vlm": bool(images)},
    }


@app.post("/analyze-document")
async def analyze_document(
    file: UploadFile = File(...),
    prompt: str = Form(default="Analyze this legal document. Identify the document type, key parties, dates, and any legally significant details."),
    max_tokens: int = Form(default=1024),
    temperature: float = Form(default=0.2),
):
    """Upload an image and get legal VLM analysis. Convenience endpoint for document analysis."""
    if _model is None:
        raise HTTPException(503, "Model not loaded")

    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(400, f"Expected image file, got {file.content_type}")

    _stats["requests"] += 1
    _stats["vision_requests"] += 1
    t0 = time.time()

    try:
        image_bytes = await file.read()
        image = Image.open(io.BytesIO(image_bytes)).convert("RGB")

        # Resize large images to save VRAM (max 1024px on longest side)
        max_dim = 1024
        if max(image.size) > max_dim:
            ratio = max_dim / max(image.size)
            new_size = (int(image.width * ratio), int(image.height * ratio))
            image = image.resize(new_size, Image.LANCZOS)

        response_text, prompt_tokens, completion_tokens = await asyncio.to_thread(
            _generate_vlm, [image], prompt, max_tokens, temperature
        )
    except Exception as e:
        _stats["errors"] += 1
        logger.exception("Document analysis error")
        raise HTTPException(500, str(e))

    elapsed_ms = round((time.time() - t0) * 1000, 1)
    _stats["total_ms"] += elapsed_ms

    return {
        "analysis": response_text,
        "document": {
            "filename": file.filename,
            "content_type": file.content_type,
            "image_size": list(image.size),
        },
        "usage": {
            "prompt_tokens": prompt_tokens,
            "completion_tokens": completion_tokens,
            "total_tokens": prompt_tokens + completion_tokens,
        },
        "timings": {"total_ms": elapsed_ms},
    }


# ── CLI entry point ──────────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn

    parser = argparse.ArgumentParser(description="Gemma 4 Legal VLM Server")
    parser.add_argument("--port", type=int, default=8085)
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--model", default=MODEL_ID, help="HF model ID or local checkpoint path")
    parser.add_argument("--adapter", default=ADAPTER_PATH, help="PEFT LoRA adapter path (optional)")
    args = parser.parse_args()

    MODEL_ID = args.model
    ADAPTER_PATH = args.adapter

    logger.info("Gemma 4 Legal VLM Server")
    logger.info("  Model:    %s", MODEL_ID)
    logger.info("  Adapter:  %s", ADAPTER_PATH or "(none)")
    logger.info("  Endpoint: http://%s:%d", args.host, args.port)
    logger.info("  Docs:     http://%s:%d/docs", args.host, args.port)
    logger.info("  Backend:  HF Transformers + NF4 (bitsandbytes)")

    uvicorn.run(
        "app:app",
        host=args.host,
        port=args.port,
        log_level="info",
    )