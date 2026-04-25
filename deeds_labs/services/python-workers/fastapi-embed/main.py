"""
FastAPI Embedding Worker — Stub
Lightweight embedding service that proxies to Ollama or runs local ONNX models.

In production, Ollama (embeddinggemma:latest) handles all embeddings.
This worker would be used for batch processing or dedicated embedding pipelines.
"""

from fastapi import FastAPI
from typing import List
import httpx
import os

app = FastAPI(title="Embedding Worker", version="0.1.0")

OLLAMA_URL = os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434")
EMBED_MODEL = os.environ.get("EMBED_MODEL", "embeddinggemma:latest")


@app.get("/health")
async def health():
    """Health check — also verifies Ollama connectivity."""
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            res = await client.get(f"{OLLAMA_URL}/api/tags")
            ollama_ok = res.status_code == 200
    except Exception:
        ollama_ok = False

    return {
        "status": "ok",
        "service": "fastapi-embed",
        "ollama": "connected" if ollama_ok else "unavailable",
        "model": EMBED_MODEL,
    }


@app.post("/embed")
async def embed(texts: List[str]):
    """Generate embeddings by proxying to Ollama."""
    vectors = []
    async with httpx.AsyncClient(timeout=30.0) as client:
        for text in texts:
            res = await client.post(
                f"{OLLAMA_URL}/api/embeddings",
                json={"model": EMBED_MODEL, "prompt": text[:8000]},
            )
            if res.status_code == 200:
                data = res.json()
                vectors.append(data.get("embedding", []))
            else:
                vectors.append([0.0] * 768)

    return {"vectors": vectors, "model": EMBED_MODEL, "count": len(vectors)}
