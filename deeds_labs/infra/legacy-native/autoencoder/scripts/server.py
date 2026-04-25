"""
Autoencoder Bridge Service — Stub
Optional ML training service for document representation learning.
Provides /health and /encode endpoints.

This is a stub — Ollama handles inference in production.
This service would be used for fine-tuning custom encoders on legal document corpora.
"""

from fastapi import FastAPI
import numpy as np
from typing import List

app = FastAPI(title="Autoencoder Bridge", version="0.1.0")


@app.get("/health")
async def health():
    return {"status": "ok", "service": "autoencoder-bridge", "mode": "stub"}


@app.post("/encode")
async def encode(texts: List[str]):
    """Generate embeddings (stub: returns random 768-dim vectors)."""
    vectors = [np.random.randn(768).tolist() for _ in texts]
    return {"vectors": vectors, "model": "stub-autoencoder", "dim": 768}
