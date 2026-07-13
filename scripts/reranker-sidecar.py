#!/usr/bin/env python3
"""
CrossEncoder reranker HTTP sidecar.
Runs on port 8092, independent of SvelteKit and Gemma4.
Model: mixedbread-ai/mxbai-rerank-base-v2 (0.5B params, 384-dim output)
"""

from __future__ import annotations

import time
import os
from dataclasses import dataclass
from typing import Optional

import torch
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from sentence_transformers import CrossEncoder
import uvicorn

app = FastAPI(title="CrossEncoder Reranker", version="1.0.0")

# Model configuration
MODEL_ID = "mixedbread-ai/mxbai-rerank-base-v2"
MAX_LENGTH = 512
BATCH_SIZE = 8
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"

# Global model state
_model: Optional[CrossEncoder] = None
_model_loaded = False


def load_model() -> CrossEncoder:
    """Load or cache the reranker model from Hugging Face Hub using sentence-transformers."""
    global _model, _model_loaded

    if _model_loaded and _model:
        return _model

    print(f"[Reranker] Loading model {MODEL_ID}...")

    try:
        _model = CrossEncoder(MODEL_ID, default_activation_function=None)
        if DEVICE == "cuda":
            _model = _model.to("cuda")

        _model_loaded = True
        print(f"[Reranker] Model loaded successfully on {DEVICE}")
        return _model
    except Exception as e:
        print(f"[Reranker] Failed to load model: {e}")
        raise


@app.on_event("startup")
async def startup():
    """Load model on server startup."""
    try:
        load_model()
    except Exception as e:
        print(f"[Reranker] Startup error: {e}")
        # Non-fatal; sidecar can still respond with error


class Candidate(BaseModel):
    """A candidate packet to rerank."""
    packet_key: str = Field(..., min_length=1)
    text: str = Field(..., min_length=1)


class RerankRequest(BaseModel):
    """Rerank request."""
    query: str = Field(..., min_length=1)
    candidates: list[Candidate] = Field(..., min_items=1, max_items=1024)
    batch_size: int = Field(default=8, ge=1, le=64)


class RankedResult(BaseModel):
    """A reranked candidate with score."""
    packet_key: str
    score: float


class RerankResponse(BaseModel):
    """Rerank response."""
    ranked: list[RankedResult]
    latency_ms: float
    vram_peak_mb: float
    vram_current_mb: float
    model_loaded: bool
    batch_count: int


@app.post("/rerank", response_model=RerankResponse)
async def rerank(req: RerankRequest) -> RerankResponse:
    """
    Rerank candidates by query relevance using CrossEncoder.

    Returns top-ranked candidates with scores.
    """
    try:
        model = load_model()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Model load failed: {e}")

    if DEVICE == "cuda":
        torch.cuda.reset_peak_memory_stats()
        torch.cuda.synchronize()

    started = time.perf_counter()
    scored: list[tuple[str, float]] = []
    batch_count = 0

    # Process candidates in batches
    for start in range(0, len(req.candidates), req.batch_size):
        batch = req.candidates[start : start + req.batch_size]
        batch_count += 1

        # Pair each candidate with the query
        pairs = [[req.query, candidate.text] for candidate in batch]

        # Score using sentence-transformers CrossEncoder
        scores = model.predict(pairs, show_progress_bar=False)

        # Collect results with candidate IDs
        for candidate, score in zip(batch, scores, strict=True):
            scored.append((candidate.packet_key, float(score)))

    if DEVICE == "cuda":
        torch.cuda.synchronize()
    elapsed_ms = (time.perf_counter() - started) * 1_000

    # Memory stats
    if DEVICE == "cuda":
        peak_mb = torch.cuda.max_memory_allocated() / (1024 * 1024)
        current_mb = torch.cuda.memory_allocated() / (1024 * 1024)
    else:
        peak_mb = 0.0
        current_mb = 0.0

    # Sort by score (descending)
    ranked_results = [
        RankedResult(packet_key=pk, score=score)
        for pk, score in sorted(scored, key=lambda x: x[1], reverse=True)
    ]

    return RerankResponse(
        ranked=ranked_results,
        latency_ms=elapsed_ms,
        vram_peak_mb=peak_mb,
        vram_current_mb=current_mb,
        model_loaded=_model_loaded,
        batch_count=batch_count,
    )


@app.get("/health")
async def health() -> dict:
    """Health check."""
    return {
        "status": "healthy",
        "model_loaded": _model_loaded,
        "device": DEVICE,
        "model_id": MODEL_ID,
    }


if __name__ == "__main__":
    port = int(os.getenv("RERANKER_PORT", "8092"))
    host = os.getenv("RERANKER_HOST", "127.0.0.1")

    print(f"[Reranker] Starting on {host}:{port}")
    print(f"[Reranker] Model: {MODEL_ID}")
    print(f"[Reranker] Device: {DEVICE}")

    uvicorn.run(app, host=host, port=port, log_level="info")
