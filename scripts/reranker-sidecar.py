#!/usr/bin/env python3
"""
Mixedbread CrossEncoder reranker HTTP sidecar.
Runs on port 8099 (default), independent of SvelteKit and Gemma4.

Model: mixedbread-ai/mxbai-rerank-base-v2
  - ~0.5B params, Qwen2 causal-LM backbone
  - Sentence Transformers CrossEncoder interface
  - Apache-2.0 license
  - 100+ human languages + code/SQL

Candidate text format (matches Atlas canonical shape):
  SOURCE: src/lib/server/auth.ts
  SYMBOL: validateSession
  KIND: function
  CALLS: getSession, lucia.validateSession
  <blank line>
  <first 300 chars of chunk content>

Endpoint: POST /rerank
  { query: str, candidates: [{packet_key, text}], batch_size?: int }
  → { ranked: [{packet_key, score}], latency_ms, vram_peak_mb, ... }

Endpoint: GET /health
  → { status, model_loaded, device, model_id }
"""

from __future__ import annotations

import os
import time
from typing import Annotated, Optional

import torch
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from sentence_transformers import CrossEncoder
import uvicorn

app = FastAPI(title="Mixedbread CrossEncoder Reranker", version="2.0.0")

MODEL_ID = os.getenv("RERANKER_MODEL", "mixedbread-ai/mxbai-rerank-base-v2")
MAX_LENGTH = int(os.getenv("RERANKER_MAX_LENGTH", "512"))
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"

_model: Optional[CrossEncoder] = None
_model_loaded = False


def load_model() -> CrossEncoder:
    global _model, _model_loaded
    if _model_loaded and _model is not None:
        return _model

    print(f"[Reranker] Loading {MODEL_ID} on {DEVICE} …")
    t0 = time.perf_counter()

    # mxbai-rerank-base-v2 uses a Qwen2 causal backbone; device goes in the
    # constructor (not .to()), and we must not pass default_activation_function.
    _model = CrossEncoder(
        MODEL_ID,
        max_length=MAX_LENGTH,
        device=DEVICE,
        automodel_args={"torch_dtype": torch.float16 if DEVICE == "cuda" else torch.float32},
        tokenizer_args={"use_fast": True},
    )

    _model_loaded = True
    elapsed = (time.perf_counter() - t0) * 1_000
    print(f"[Reranker] Ready in {elapsed:.0f} ms on {DEVICE}")
    return _model


@app.on_event("startup")
async def on_startup() -> None:
    try:
        load_model()
    except Exception as exc:
        # Non-fatal at startup — sidecar stays up, returns 503 on /rerank until fixed
        print(f"[Reranker] Model load failed at startup: {exc}")


# ── Request / Response models ────────────────────────────────────────────────

class Candidate(BaseModel):
    packet_key: str = Field(..., min_length=1)
    # Hydrated text in Atlas canonical format:
    #   SOURCE: <source_ref>
    #   SYMBOL: <function_symbol>
    #   KIND: <node_kind>
    #   CALLS: <comma-separated call list>
    #
    #   <content excerpt, first ~300 chars>
    text: str = Field(..., min_length=1)


class RerankRequest(BaseModel):
    query: str = Field(..., min_length=1)
    candidates: Annotated[list[Candidate], Field(min_length=1, max_length=1024)]
    batch_size: Annotated[int, Field(ge=1, le=64)] = 8


class RankedResult(BaseModel):
    packet_key: str
    score: float


class RerankResponse(BaseModel):
    ranked: list[RankedResult]
    latency_ms: float
    vram_peak_mb: float
    vram_current_mb: float
    model_loaded: bool
    batch_count: int


# ── Endpoints ────────────────────────────────────────────────────────────────

@app.post("/rerank", response_model=RerankResponse)
async def rerank(req: RerankRequest) -> RerankResponse:
    """Score and rank candidates against the query using CrossEncoder."""
    if not _model_loaded or _model is None:
        try:
            load_model()
        except Exception as exc:
            raise HTTPException(status_code=503, detail=f"Model unavailable: {exc}")

    model = _model

    if DEVICE == "cuda":
        torch.cuda.reset_peak_memory_stats()
        torch.cuda.synchronize()

    t0 = time.perf_counter()
    scored: list[tuple[str, float]] = []
    batch_count = 0

    for start in range(0, len(req.candidates), req.batch_size):
        batch = req.candidates[start : start + req.batch_size]
        batch_count += 1

        # CrossEncoder expects list of [query, document] string pairs
        pairs = [[req.query, c.text] for c in batch]

        # model.predict() returns a numpy array or list of floats
        raw_scores = model.predict(pairs, show_progress_bar=False)

        for candidate, score in zip(batch, raw_scores, strict=True):
            scored.append((candidate.packet_key, float(score)))

    if DEVICE == "cuda":
        torch.cuda.synchronize()

    elapsed_ms = (time.perf_counter() - t0) * 1_000

    if DEVICE == "cuda":
        peak_mb = torch.cuda.max_memory_allocated() / (1024 * 1024)
        current_mb = torch.cuda.memory_allocated() / (1024 * 1024)
    else:
        peak_mb = 0.0
        current_mb = 0.0

    ranked = [
        RankedResult(packet_key=pk, score=s)
        for pk, s in sorted(scored, key=lambda x: x[1], reverse=True)
    ]

    return RerankResponse(
        ranked=ranked,
        latency_ms=elapsed_ms,
        vram_peak_mb=peak_mb,
        vram_current_mb=current_mb,
        model_loaded=_model_loaded,
        batch_count=batch_count,
    )


@app.get("/health")
async def health() -> dict:
    vram_mb = 0.0
    if DEVICE == "cuda" and torch.cuda.is_available():
        vram_mb = torch.cuda.memory_allocated() / (1024 * 1024)
    return {
        "status": "healthy" if _model_loaded else "loading",
        "model_loaded": _model_loaded,
        "device": DEVICE,
        "model_id": MODEL_ID,
        "max_length": MAX_LENGTH,
        "vram_current_mb": vram_mb,
    }


# ── Entry point ──────────────────────────────────────────────────────────────

if __name__ == "__main__":
    port = int(os.getenv("RERANKER_PORT", "8099"))
    host = os.getenv("RERANKER_HOST", "127.0.0.1")

    print(f"[Reranker] {MODEL_ID}")
    print(f"[Reranker] Listening on {host}:{port}  device={DEVICE}  max_length={MAX_LENGTH}")

    uvicorn.run(app, host=host, port=port, log_level="info")
