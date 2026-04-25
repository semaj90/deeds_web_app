# Native Autoencoder — Archive Analysis

## Date: March 9, 2026
## Verdict: ARCHIVE to deeds_labs/legacy-projects/native/

---

## What This Was

A stub FastAPI service (`scripts/server.py`) that provided `/health` and `/encode` endpoints. The `/encode` endpoint returned **random 768-dim vectors** — it was never connected to a real model.

```python
vectors = [np.random.randn(768).tolist() for _ in texts]
return {"vectors": vectors, "model": "stub-autoencoder", "dim": 768}
```

The intent was a future fine-tuning service for custom legal document encoders, but it never materialized.

---

## Why It's Being Archived

All Docker references in `docker-compose.yml` are **commented out** (lines 5-8, 245-395). No active code imports or calls this service.

---

## What Replaced It — Active Encoding Stack

| Layer | Component | Dims | Location |
|-------|-----------|------|----------|
| **Server Primary** | Ollama `embeddinggemma:latest` | 768 | Port 11434, GPU-accelerated |
| **Server Batch** | Go gRPC embedding server | 768 | Port 50051, goroutine batch + Redis cache |
| **Server Fallback** | `nomic-embed-text` via Ollama | 768 | Same port, automatic fallback |
| **Client (WebGPU)** | ONNX `embeddinggemma_300m` | 768 | `static/embeddinggemma_300m_onnx/` |
| **Client (WASM)** | Same ONNX model, SIMD backend | 768 | Fallback when WebGPU unavailable |
| **Vector Storage** | Qdrant (6 collections) + pgvector | 768 | Ports 6333 / 5432 |

The autoencoder stub was a placeholder for a future fine-tuning service that never materialized. The production stack (Ollama + gRPC + ONNX) provides real embeddings at every tier.

---

## Files in This Directory

```
native/autoencoder/
├── scripts/
│   └── server.py          # Stub FastAPI (random vectors)
├── Dockerfile             # Python container config
├── requirements.txt       # FastAPI + numpy deps
└── ARCHIVE_ANALYSIS.md    # This file
```
