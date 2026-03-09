# Phase 43→47 GPU Pipeline (Redis ➜ CUDA Store ➜ Graph Analyzer)

This document captures the current end-to-end flow across the GPU-heavy phases and how the VS Code tasks stitch them together. Use it as the authoritative reference before triggering the “Phase43→47: Full GPU Pipeline” compound task.

## High-Level Flow

```
svelte-check logs
        │
        ▼
Phase 43 (Node) ──► Redis (ai:embedding:*) ──► Phase 44 (Python) ──► CUDA Tensor Store (.pt)
        │                                            │                     │
        └─► Qdrant (optional) ◄──────────────────────┘                     └─► Phase 47 (FastAPI/TensorRT + Go QUIC bridge)
```

- **Redis** (docker-compose-vector-384.yml) is the shared cache for embeddings and live event channels.
- **Qdrant/Postgres** run from the same compose stack but are used only when enabled in Phase 43/47 configs.
- **Phase 44** now persists a GPU-ready tensor snapshot (`logs/phase44-cache.pt`) alongside CUDA graph benchmark metrics for later reuse (Faiss, TensorRT-LLM, cuML, etc.).

## Phase Responsibilities

| Phase | Runtime | Responsibilities | Key Inputs | Outputs / Side Effects |
|-------|---------|------------------|------------|------------------------|
| 43 – GPU Embedding Pipeline | Node 20+ | Parse `svelte-check-fronten1d.log`, batch embeddings via `embeddinggemma:latest`, push into Redis + (optional) Qdrant | `svelte-check-fronten1d.log`, Redis (`REDIS_URL`) | `ai:embedding:*` hashes, Redis pub/sub events, Qdrant vectors |
| 44 – CUDA Tensor Aggregation | Python 3.11 (venv) | Pull embeddings once, build `CUDATensorStore`, run clustering/similarity, optionally persist tensors + benchmark CUDA graphs | Redis cache from Phase 43 | `logs/phase44-batch.pt`, `logs/phase44-cache.pt`, summary/bench metrics |
| 47 – Graph Analyzer + QUIC Bridge | Python FastAPI + Go | Consume persisted tensors/Redis updates, serve graph insights, publish over QUIC to downstream consumers | Tensor store snapshot, Redis channel, `PHASE47_GRAPH_URL` | Analyzer API on :8093, QUIC stream tied to Redis events |

## VS Code Tasks (Pipeline Section)

1. **🚀 Phase43: GPU Embedding Pipeline**  
   `node scripts/phase43-ai-analyzer.mjs svelte-check-fronten1d.log --batch-size 5000`  
   Env: `REDIS_URL=redis://:redis@localhost:6379`, `CONCURRENCY=8`, `QDRANT_URL`, `OLLAMA_URL`.

2. **🎯 Phase44: CUDA Tensor Aggregation**  
   `.venv/Scripts/python.exe scripts/phase44-tensor-aggregator.py --limit 10000 --cluster 20 --compute-similarity --store-dtype fp16 --persist-store --store-path logs/phase44-cache.pt --capture-graph --graph-batch-size 256 --benchmark-batch-size 256 --benchmark-graph --benchmark-iters 50`  
   Env: `REDIS_URL=redis://:redis@localhost:6379`, `TORCH_CUDA_DEVICE=0`.

3. **Phase47: Start Graph Analyzer**  
   `uvicorn phase47_graph_analyzer:app --host 0.0.0.0 --port 8093` (cwd `python-services`) with Ollama fallback vars.

4. **Phase47: Run QUIC Bridge**  
   `go run ./cmd/quic-bridge` (cwd `go-microservice`) with `REDIS_URL` + analyzer URL.

5. **Phase43→47: Full GPU Pipeline** (compound)  
   Sequenced dependency chain: Analyzer ➜ Bridge ➜ Phase43 ➜ Phase44. It does **not** shell out to `docker compose`; start containers manually beforehand.

## Operational Checklist

1. **Docker stack** (only run manually):  
   `docker compose -f docker-compose-vector-384.yml up -d redis postgres qdrant`  
   *None* of the VS Code tasks attempt to start/stop containers.

2. **Phase43 run**: let it finish at least once after a fresh Redis start so the cache is populated. It resumes safely thanks to Redis TTL + dedupe, but Phase44 needs enough `ai:embedding:*` keys before it can build tensors.

3. **Phase44 run**: verifies CUDA availability, loads tensors into GPU, saves `logs/phase44-cache.pt`, and prints CUDA graph replay timings (ms) to confirm Tensor Core utilization.

4. **Phase47 services**: remain background tasks; stop them manually or via the VS Code task panel when finished.

5. **Validation**:
   - `redis-cli -a redis --scan | head` to confirm embeddings exist.
   - `python - <<'PY' ... torch.load('logs/phase44-cache.pt', map_location='cuda')` to inspect stored tensor shapes.

## FAQ

- **Do I need to wait for Phase43 to finish?**  
  Yes. Phase44 fails with “No valid embeddings” if the Redis cache is empty. Interrupting Phase43 mid-run is fine (cache entries remain), but you need at least one completed pass after a cache flush.

- **Will the VS Code tasks restart Docker?**  
  No. They assume Redis/Qdrant/Postgres are already running. Keep using your existing compose command; nothing in the tasks file touches containers.

- **Does Phase44 reuse cached embeddings automatically?**  
  Yes. The aggregator reads whatever is currently in Redis; if Phase43 already wrote a key, it skips regenerating that embedding due to Redis TTL + dedupe logic.

- **Where do CUDA graph benchmarks live?**  
  They print to stdout (task terminal) each run. Future TODO: export to `logs/phase44-benchmark.json`.

---

_Last updated: 2025-02-14_
