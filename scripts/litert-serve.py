#!/usr/bin/env python3
"""
LiteRT-LM OpenAI-compatible HTTP server (FastAPI + uvicorn).

Wraps litert_lm.Engine in a FastAPI app exposing /v1/chat/completions.
Consistent with langextract (FastAPI on :8095).

Usage (from WSL):
    python3 scripts/litert-serve.py --port 8070 --model gemma-4-E2B-it.litertlm

Multi-worker (production):
    gunicorn scripts.litert-serve:app --workers 2 \
        --worker-class uvicorn.workers.UvicornWorker --bind 0.0.0.0:8070

Listens on 0.0.0.0 so Windows apps can reach it via localhost:8070.
"""

import argparse
import asyncio
import json
import logging
import os
import sys
import time
import uuid
from contextlib import asynccontextmanager
from typing import Optional

import litert_lm

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("litert-serve")

# ── Config from env or CLI ────────────────────────────────────────────────────
MODEL_ID = os.environ.get("LITERT_MODEL", "gemma-4-E2B-it.litertlm")
BACKEND = os.environ.get("LITERT_BACKEND", "cpu")

# ── Global state ──────────────────────────────────────────────────────────────
_engine: Optional[litert_lm.Engine] = None
_stats = {"requests": 0, "errors": 0, "total_ms": 0}


def _resolve_model_path(model_id: str) -> str:
    """Resolve model ID to full file path.

    litert-lm stores imported models under ~/.litert-lm/models/<id>/model.litertlm.
    The Python Engine API needs the full path, not just the ID.
    """
    # Already a full path?
    if os.path.isfile(model_id):
        return model_id

    # Check litert-lm local storage
    storage = os.path.join(os.path.expanduser("~"), ".litert-lm", "models", model_id, "model.litertlm")
    if os.path.isfile(storage):
        return storage

    # Maybe the user passed the directory name without the inner model.litertlm
    inner = os.path.join(model_id, "model.litertlm")
    if os.path.isfile(inner):
        return inner

    raise FileNotFoundError(
        f"Model not found: {model_id}\n"
        f"  Checked: {model_id}, {storage}, {inner}\n"
        f"  Import a model first: litert-lm import --from-huggingface-repo=<repo> <file>"
    )


def _load_engine():
    global _engine
    backend = litert_lm.Backend.CPU if BACKEND == "cpu" else litert_lm.Backend.GPU
    model_path = _resolve_model_path(MODEL_ID)
    logger.info("Loading model: %s → %s (backend=%s)", MODEL_ID, model_path, BACKEND)
    _engine = litert_lm.Engine(model_path, backend=backend)
    _engine.__enter__()
    logger.info("Engine ready.")


def _close_engine():
    global _engine
    if _engine is not None:
        _engine.__exit__(None, None, None)
        _engine = None
        logger.info("Engine closed.")


# ── FastAPI app ───────────────────────────────────────────────────────────────
from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

@asynccontextmanager
async def lifespan(app: FastAPI):
    _load_engine()
    yield
    _close_engine()


app = FastAPI(
    title="LiteRT-LM Server",
    version="0.1.0",
    description="OpenAI-compatible LiteRT-LM inference (Gemma 4 E2B)",
    lifespan=lifespan,
)


# ── Request / response models ────────────────────────────────────────────────
class ChatMessage(BaseModel):
    role: str
    content: str | list = ""

class ChatRequest(BaseModel):
    model: str = Field(default="litert-lm")
    messages: list[ChatMessage]
    max_tokens: int = Field(default=512, ge=1, le=8192)
    temperature: float = Field(default=0.3, ge=0.0, le=2.0)
    stream: bool = False


# ── Endpoints ─────────────────────────────────────────────────────────────────
@app.get("/health")
async def health():
    return {
        "status": "ok" if _engine else "degraded",
        "model": MODEL_ID,
        "backend": BACKEND,
        "stats": _stats,
    }


@app.get("/v1/models")
async def list_models():
    return {
        "object": "list",
        "data": [{"id": MODEL_ID, "object": "model", "owned_by": "litert-community"}],
    }


@app.post("/v1/chat/completions")
async def chat_completions(req: ChatRequest):
    if _engine is None:
        raise HTTPException(503, "Model not loaded")

    # Extract last user message text
    last_user = ""
    for msg in reversed(req.messages):
        if msg.role == "user":
            if isinstance(msg.content, list):
                last_user = " ".join(
                    p.get("text", "") for p in msg.content if isinstance(p, dict) and p.get("type") == "text"
                )
            else:
                last_user = msg.content
            break

    if not last_user:
        raise HTTPException(400, "No user message found")

    _stats["requests"] += 1
    t0 = time.time()

    try:
        # Run blocking litert_lm call in thread pool (keeps event loop free)
        response_text = await asyncio.to_thread(_generate, last_user)
    except Exception as e:
        _stats["errors"] += 1
        logger.exception("Inference error")
        raise HTTPException(500, str(e))

    elapsed_ms = round((time.time() - t0) * 1000, 1)
    _stats["total_ms"] += elapsed_ms

    # Rough token estimates (1 token ~ 4 chars)
    prompt_tokens = max(1, len(last_user) // 4)
    completion_tokens = max(1, len(response_text) // 4)

    if req.stream:
        return StreamingResponse(
            _sse_chunks(response_text, prompt_tokens, completion_tokens),
            media_type="text/event-stream",
        )

    return {
        "id": f"chatcmpl-{uuid.uuid4().hex[:12]}",
        "object": "chat.completion",
        "created": int(time.time()),
        "model": MODEL_ID,
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
        "timings": {"total_ms": elapsed_ms},
    }


def _extract_text(response) -> str:
    """Extract plain text from litert_lm response.

    send_message() returns a dict like:
        {"content": [{"text": "...", "type": "text"}], "role": "assistant"}
    or sometimes a plain string. Handle both.
    """
    if isinstance(response, str):
        return response
    if isinstance(response, dict):
        content = response.get("content", "")
        if isinstance(content, list):
            return " ".join(
                part.get("text", "") for part in content
                if isinstance(part, dict) and part.get("type") == "text"
            )
        if isinstance(content, str):
            return content
    return str(response)


def _generate(prompt: str) -> str:
    """Blocking call — runs in thread pool via asyncio.to_thread."""
    conversation = _engine.create_conversation()
    conversation.__enter__()
    try:
        raw = conversation.send_message(prompt)
        return _extract_text(raw)
    finally:
        conversation.__exit__(None, None, None)


async def _sse_chunks(text: str, prompt_tokens: int, completion_tokens: int):
    """SSE streaming — sends full response in one data chunk then DONE."""
    chunk_id = f"chatcmpl-{uuid.uuid4().hex[:12]}"
    chunk = {
        "id": chunk_id,
        "object": "chat.completion.chunk",
        "created": int(time.time()),
        "model": MODEL_ID,
        "choices": [{"index": 0, "delta": {"role": "assistant", "content": text}, "finish_reason": None}],
    }
    yield f"data: {json.dumps(chunk)}\n\n"
    stop = {
        "id": chunk_id,
        "object": "chat.completion.chunk",
        "created": int(time.time()),
        "model": MODEL_ID,
        "choices": [{"index": 0, "delta": {}, "finish_reason": "stop"}],
    }
    yield f"data: {json.dumps(stop)}\n\n"
    yield "data: [DONE]\n\n"


# ── CLI entry point ───────────────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn

    parser = argparse.ArgumentParser(description="LiteRT-LM OpenAI-compatible server")
    parser.add_argument("--port", type=int, default=8070)
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--model", default=MODEL_ID)
    parser.add_argument("--backend", default=BACKEND, choices=["cpu", "gpu"])
    args = parser.parse_args()

    MODEL_ID = args.model
    BACKEND = args.backend

    logger.info("LiteRT-LM server → %s:%d", args.host, args.port)
    logger.info("Model: %s | Backend: %s", MODEL_ID, BACKEND)
    logger.info("Docs: http://%s:%d/docs", args.host, args.port)

    uvicorn.run(
        "litert-serve:app",
        host=args.host,
        port=args.port,
        log_level="info",
        # Single worker for shared Engine instance; use gunicorn for multi-worker
    )
