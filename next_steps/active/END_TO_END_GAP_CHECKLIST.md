# End-To-End Gap Checklist

**Status**: ACTIVE  
**Updated**: July 10, 2026  
**Scope**: current pipeline health, missing orchestration links, and concrete next implementation steps

---

## Current Health Snapshot

- SSE streaming chat: `97%` | `14-step pipeline`
- ACE context assembly: `95%` | `RAG + KAG + DAG + topology + web`
- Qdrant vector search: `95%` | `INT8 quantized, BM42 hybrid`
- Redis cache: `95%` | `Dual-tier memory+Redis`
- GPU utilization: `60%` | `LibTorch CUDA active, no Triton`
- Langfuse observability: `70%` | `42 files instrumented, not enabled`

---

## Architecture Summary

```text
CLIENT (Browser)                    SERVER (SvelteKit + Docker)
├─ Gemma4 E2B 2.3B (WebGPU)       ├─ Ollama gemma4-rotorquant:latest (5.3GB GPU)
├─ Gemma3 270M ONNX (WASM)        ├─ Ollama embeddinggemma (300MB shared)
├─ EmbeddingGemma 300M ONNX       ├─ LibTorch N-API (CUDA direct, 7 GPU functions)
│                                   ├─ Worker Threads (compute-pool.ts)
│                                   └─ RabbitMQ (10 async queues)
├─ 7-Layer Cache: L0 LokiJS → L1 IndexedDB → L2 Server Map →
│  L3 Redis exact → L4 Bifrost semantic → L5 Embedding Redis → L6 CouchDB DAG
└─ Feedback Loop: Wiki → Timeline → RL Weights → QLoRA → Cache Warm → Hypergraph4D
```

---

## What Is Already Wired

- runtime-cache contracts exist
- SOM neighbor lookup exists
- packet LOD manifest code exists
- promotion policy code exists
- JEPA experiment lane exists
- Langfuse tracing exists
- phase plans exist in `next_steps/active`

---

## What Still Blocks End-To-End Completion

### 1. Runtime-cache orchestration gap

- runtime-cache helpers exist, but the route wiring is still thin
- the smoke test is still mostly contract-level, not full route integration
- promotion decisions are not yet persisted
- exact-hit vs near-hit vs rejected semantics need a single route-level contract

### 2. OTel runtime gap

- `@opentelemetry/*` is not installed
- no bootstrap module exists yet
- retrieval / ACP / materializer spans are not emitted through a shared OTel pipeline

### 3. JEPA promotion gap

- `packet_jepa_similarity` exists as an experiment signal
- canonical 384d embedding coverage is still the gating issue
- JEPA is not yet allowed into XGBoost/MLP reranking

### 4. Persistence gap

- decision records are logged, but not written to the canonical promotion table
- the cache promotion path still needs durable records for later replay and audit

### 5. GPU topology gap

- the PyTorch / LibTorch lane is not yet pinned to a concrete topology training contract
- SOM 20x20 and KMeans still need a single derived-metrics writeback path
- Neo4j classification support should consume derived topology, not raw runtime packets

### 6. Plugin boundary gap

- Headroom is currently only a plugin integration concept, not a control-plane authority
- no thin adapter exists yet to isolate plugin inputs, outputs, and failures
- plugin telemetry is not explicitly defined as execution evidence
- plugin calls must stay side-effect free with respect to canonical truth

---

## Concrete Execution Order

1. Wire runtime-cache helpers into the route layer.
2. Turn the runtime-cache smoke test into a real integration test.
3. Persist promotion decisions to Postgres.
4. Add OpenTelemetry bootstrap and spans.
5. Raise canonical packet embedding coverage.
6. Re-run JEPA on the real 384d cohort.
7. Promote JEPA only if it beats baseline `MRR` and `NDCG@10`.
8. Add the optional plugin adapter after retrieval and cache wiring are stable.

---

## File Targets

- `sveltekit-frontend/src/lib/runtime-cache/contracts.ts`
- `sveltekit-frontend/src/lib/runtime-cache/som-neighbor-lookup.ts`
- `sveltekit-frontend/src/lib/server/atlas/packet-lod-manifest.ts`
- `sveltekit-frontend/src/lib/server/atlas/retrieval-promotion-policy.ts`
- `sveltekit-frontend/tests/integration/runtime-cache-promotion.test.ts`
- `sveltekit-frontend/src/lib/server/telemetry/`
- `sveltekit-frontend/src/lib/server/observability/langfuse.ts`
- `scripts/atlas/export-packet-jepa-training-pairs.mjs`
- `scripts/atlas/train-packet-jepa.py`
- `scripts/atlas/score-packet-jepa-similarity.mjs`
- `sveltekit-frontend/src/lib/server/plugins/`

---

## End-State Rules

- Postgres stays canonical truth.
- Runtime cache stays deterministic and side-effect free on health checks.
- OTel stays execution evidence only.
- JEPA stays experimental until it clears the baseline gate.
- DSPy stays above retrieval, not in the identity layer.
- The architecture summary is now tracked as a file-by-file implementation board.

---

## Recommendation

Treat this as the working board for the next implementation slice.

The remaining work is not broad architecture redesign. It is finishing the route wiring, persistence, and promotion contracts that connect the already-existing modules into one end-to-end path.
