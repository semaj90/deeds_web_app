# Pipeline Gaps & Consolidated TODO — April 19, 2026

**Created**: April 19, 2026 (consolidated from 4 source files)
**Status**: ACTIVE — P0 all closed, P1 in progress
**Baseline**: svelte-check 0 errors | Playwright 20/20 | 47-gate audit system

---

## Architecture Summary

```
CLIENT (Browser)                    SERVER (SvelteKit + Docker)
├─ Gemma4 E2B 2.3B (WebGPU)       ├─ Ollama gemma4-legal-vlm (5.3GB GPU)
├─ Gemma3 270M ONNX (WASM)        ├─ Ollama embeddinggemma (300MB shared)
├─ EmbeddingGemma 300M ONNX       ├─ LibTorch N-API (CUDA direct, 7 GPU functions)
│                                   ├─ Worker Threads (compute-pool.ts)
│                                   └─ RabbitMQ (10 async queues)
├─ 7-Layer Cache: L0 LokiJS → L1 IndexedDB → L2 Server Map →
│  L3 Redis exact → L4 Bifrost semantic → L5 Embedding Redis → L6 CouchDB DAG
└─ Feedback Loop: Wiki → Timeline → RL Weights → QLoRA → Cache Warm → Hypergraph4D
```

---

## LangGraph Status

LangGraph is now a live runtime dependency with **both** in-process TypeScript and Docker service paths:

**In-process (TypeScript `@langchain/langgraph`):**
- `src/lib/server/agent/supervisor.ts` builds a `StateGraph` supervisor over 5 routed subagents.
- `src/routes/api/agent/investigate/+server.ts` defaults to supervisor mode and can stream supervisor-node updates over SSE.
- `src/routes/api/research/concurrent-deep/+server.ts` runs the concurrent research DAG (supervisor → parallel workers → synthesis).
- `src/lib/server/analytics/research-graph-rl.ts` uses a `StateGraph` loop for Retrieve → Rerank → Generate → Evaluate → Update.

**Docker service (`docker/langgraph-synthesis/app.py` — port 8091):** WIRED (Apr 20, 2026)
- `LANGGRAPH_ENABLED=true` + `LANGGRAPH_URL=http://localhost:8091` in `.env`
- Client: `src/lib/server/ai/langgraph-client.ts` — health check, JSON synthesis, SSE streaming, HMM stats/adapt
- Wired into `/api/synthesis/generate` (JSON + SSE) with automatic fallback to in-process pipeline
- Unique features: HMM Baum-Welch adaptation, Redis KAG neighbor cache, PyTorch GRPO reward scoring
- Start: `docker compose --profile gpu up -d langgraph-synthesis`
- Test: `node scripts/tests/test-langgraph-wiring.mjs`

---

## Quick Wins (runtime-only, need dev server)

- [ ] **Seed research_summaries** — VS Code task `P6-B` (5 legal corpus topics → Postgres)
- [ ] **Build research graph** — VS Code task `P6-C` (needs ≥40 rows in research_summaries)
- [ ] **Pre-upload Playwright suite** — `test-screenshots.mjs --all --html`

---

## P1 — Important Gaps (improves quality significantly)

### ~~GAP-4: simdjson Not Wired to Hot Paths~~ CLOSED
`fastJsonParse()` already used in `ollama.ts` (lines 52, 309, 422, 498, 539) and `qdrant-manager.ts` (lines 7, 228).

### ~~GAP-5: Granite-Docling Not in Evidence Pipeline~~ CLOSED (Apr 20, 2026)
Granite-Docling promoted from fallback to **PRIMARY structural enrichment** on ALL PDF + image uploads.
Full pipeline: Granite-Docling DocTags → LangExtract sections → Gemma4 VLM reranking (quality score + section types) → embeddinggemma → Qdrant tagged vector indexing (`docling_enriched`, `docling_quality_score`, `docling_vlm_sections`, `section:*` tags) → evidence metadata JSONB → ACE contextual chat.
**Implementation**: `api/evidence/upload/+server.ts` — 2 new pipeline stages (`docling_enrichment`, `docling_vlm_rerank`), ~100 lines added.

### GAP-6: VLM LoRA Merge (Colab)
**See**: [GPU_MODEL_VLM_DEPLOYMENT.md](GPU_MODEL_VLM_DEPLOYMENT.md) — full VLM merge plan. **Effort**: Medium.

### ~~GAP-7: Langfuse Trace Wiring~~ CLOSED (Apr 20, 2026)
`LANGFUSE_ENABLED=true` already set in `.env` with real public/secret keys and `LANGFUSE_HOST=http://localhost:3030`. Lazy singleton auto-connects on first inference call. 42 files instrumented and firing.

---

## P2 — Valuable Gaps (professional features)

### ~~GAP-8: Canonical Legal Document Corpus~~ CLOSED (Apr 20, 2026)
Tables exist in Drizzle schema (`schema-postgres.ts` lines 3211+) and in DB: 54 docs (24 statute, 18 opinion, 12 rule), 59 chunks, 10 legal_terms. Full ingest pipeline at `GET /api/canon/ingest` (chunk → embed → pgvector + Qdrant `legal_canon_chunks`). Hybrid search at `POST /api/canon/search` (Qdrant dense+BM42 RRF → pgvector fallback). Gap was written before implementation existed.

### ~~GAP-9: User Interaction Graph~~ CLOSED (Apr 20, 2026)
Neo4j seeded from PostgreSQL via `scripts/seed-neo4j.mjs`. Fixed schema mismatch (`citation_text` → `quoted_text` in citations query). Full seed run: **343 cases, 61 evidence, 21 glossary, 0 errors** (10.6s). Final graph: 568 Case nodes, 296 Evidence nodes, 21 GlossaryTerm nodes, BELONGS_TO/RELATED_TO/CHUNK_OF relationships. Script is idempotent (MERGE) — safe to re-run on any machine restart.

### ~~GAP-10: D3 Graph Visualization~~ CLOSED (Apr 20, 2026)
New `/admin/case-graph` route with full D3 force-directed layout: nodes for Case/Evidence/Person/GlossaryTerm/Statute, per-label color+radius, label filter chips with counts, title search filter, node click → side panel with properties and deep-link. API: `GET /api/graph/cases?limit=600` queries Neo4j for nodes+edges. Drag-to-pin nodes, zoom/pan, edge type labels. Added "Case Graph" link to `/admin` dashboard.

### ~~GAP-11: POI Face Recognition~~ CLOSED (Apr 20, 2026) ✅
3-pass GRPO face reranker + gemma4 VLM tool + QLoRA synths + admin gallery.
- `POST /api/persons-of-interest/[id]/face-rerank` — GRPO 3-pass (pgvector cosine → gemma4 VLM → reward fusion 0.25/0.75)
- `face_identify` agentic tool wired in `CONTEXTUAL_TOOLS` (90s timeout, inline executor)
- `proto/active/tool_router.proto` — `legal.agent.v1.ToolRouter` MCP JSON-RPC ↔ gRPC bridge
- `src/lib/server/grpc/tool-router-client.ts` — JSON-RPC adapter + `executeContextualTool` fallback
- `POST /api/persons/face-synth` — QLoRA llm_synths (description/compare/adversarial modes, admin-only)
- `/admin/face-gallery` — POI photo grid + GRPO reranker UI + QLoRA synth controls
- `face:identify` + `poi:face_synth` tools registered in MCP `server.ts`

### ~~GAP-17: gRPC Embedding Service~~ CLOSED (Apr 20, 2026) ⚡
`embedding-server.exe` confirmed running: `:50051` gRPC + `:8097` HTTP health → `{"status":"healthy"}`. `EMBEDDING_GRPC_ENABLED=true` in `.env`. Full call chain verified: `/api/embed` → `embedText()` → `generateSingleEmbedding()` → `generateEmbeddings()` → gRPC tier 1. 768-dim vectors returned.

### ~~GAP-18: gRPC Retrieval Service~~ CLOSED (Apr 20, 2026)
Built `services/go-retrieval-service/retrieval-server.exe` (33MB). Health check: `{"status":"healthy","qdrantConnected":true,"pgvectorConnected":true,"redisConnected":true,"embeddingServiceUp":true}`. Port `:50053` gRPC + `:8100` HTTP. Set `RETRIEVAL_GRPC_ENABLED=true` in `.env`. TypeScript client `retrieval-client.ts` auto-routes through gRPC → HTTP → inline fallback.

---

## P3 — Deferred Gaps

| Gap | Description | Effort |
|-----|-------------|--------|
| ~~GAP-12~~ CLOSED (Apr 20, 2026) | HMM Legal Section Tagger — Docker LangGraph service (`app.py`) has full HMM Viterbi + Baum-Welch adaptation. Client `langgraph-client.ts` wired into `/api/synthesis/generate` (JSON + SSE) with fallback. `LANGGRAPH_ENABLED=true` in `.env`. | Medium |
| ~~GAP-13~~ CLOSED (Apr 20, 2026) | Redis Rate Limiting — already fully implemented: `rate-limiter.ts` (tiered hooks middleware: auth 5–10/5min, gpu 15/min, ai 30/min, chat 40/min, generic GET 200/min), `rate-limit.ts` (sliding window ZADD helper + `rateLimitOrRespond()` + presets), `redis-rate-limit.ts` (atomic Lua INCR, in-memory fallback). Wired in hooks.server.ts for all `/api/` routes. | Medium |
| GAP-14 | ~~.env.example reconciliation~~ CLOSED (Apr 20, 2026) — added `FFMPEG_PATH`, `PYTHON_PATH`, `GEMINI_API_KEY`, `GRAPH_ML_GRPC_*`, `ACE_EMBED_BATCH_TIMEOUT_MS`; added `GRAPH_ML_GRPC_*` to `env.server.ts` + removed `(ENV as any)` casts in `graph-ml-client.ts` | Small |
| GAP-15 | ~~Obsidian Export UI~~ CLOSED (Apr 20, 2026) — button already live in `/admin/kag-notebook`, calls `/api/codebase-index/kag-notebook` `export-obsidian` action | Small |
| GAP-16 | ~~CHR97 operator stats + route-level observability~~ CLOSED (Apr 20, 2026) — added `traceCartridge()` to `langfuse.ts`; wired into `/api/cartridge/export` (cache-hit + build traces) and `/api/cartridge/search` (tensor search trace); added CHR97 Cartridge section to `/admin/cache` dashboard (live stats + invalidate button) | Small |

---

## Production Hardening TODO

- [ ] Reconcile Drizzle schema docs with real DB/runtime contracts (schema drift audit)
- [ ] Publish single canonical April 2026 production-readiness snapshot
- [ ] Redis-backed rate limiting — DEFERRED until horizontal scaling
- [ ] Audit logging expansion (all DELETE operations) — DEFERRED

---

## Infrastructure Decisions (Resolved)

- **gRPC + N-API SIMD** over Python middleware for RAG/KAG/DAG hot path (0ms serialization via TypedArray)
- **FastMCP stays** for agentic tool calling (34 tools, stdio transport)
- **Triton/TRT-LLM**: DEFERRED (see GPU_MODEL_VLM_DEPLOYMENT.md Phase 2)
- **Go gRPC embedding server**: `services/go-embedding-service/embedding-server.exe` COMPILED — see GAP-17. (Previous note saying "archived to deeds_labs" was incorrect.)
- **Go gRPC retrieval server**: `services/go-retrieval-service/` source present, needs `go build` — see GAP-18.
- **generation-client.ts** (port 50052): ORPHANED — zero consumers in codebase. Remove or wire.
- **GRAPH_ML_GRPC_URL/GRAPH_ML_GRPC_ENABLED**: missing from `env.server.ts` — add when GraphML service is ready.
- **ToolCalling gRPC** (port 50057): client exists but no server. DEFERRED.
- **CHR97 gRPC** (port 50055): client exists, port claimed by go-search HTTP (8096) — no real collision. DEFERRED.

---

## Pipeline Health (April 19, 2026)

| Component | Score | Notes |
|-----------|-------|-------|
| Evidence upload (9-stage) | 95% | processAndEmbed fire-and-forget |
| SSE streaming chat | 97% | 14-step pipeline |
| ACE context assembly | 95% | RAG + KAG + DAG + topology + web |
| Qdrant vector search | 95% | INT8 quantized, BM42 hybrid |
| Redis cache | 95% | Dual-tier memory+Redis |
| GPU utilization | 60% | LibTorch CUDA active, no Triton |
| Langfuse observability | 70% | 42 files instrumented, not enabled |

---

## Completed Items (April 17-19, 2026)

<details>
<summary>28 completed items (click to expand)</summary>

- [x] Fix pgvector schema drift — searchCodebasePgVector column refs
- [x] Wire Karpathy tags into ACE — applyKarpathyBoost()
- [x] Directory consolidation Tier 1-3 — 14 dead dirs eliminated
- [x] Float32Array pool + OOM guards — libtorch-bridge.ts
- [x] Batch parallel report export — POST /api/reports/batch-export
- [x] Granite-Docling Phase 3 — Ollama-native
- [x] Wire /api/workflow-events — SSE endpoint
- [x] .env.example vars verified
- [x] Admin auth guards verified
- [x] Case creation Superforms verified
- [x] Analytics pipeline verified
- [x] LangGraph pipeline test script
- [x] Fix VLM model defaults
- [x] Chat feedback loop verified
- [x] GAP-1: Agentic chat wired to main user flow
- [x] GAP-2: GPU recomputation from full pipeline
- [x] GAP-3: Batch PyTorch orchestrator
- [x] Architecture backlog P1-P5 (14/14 items)
- [x] P6 research-graph RL pipeline (24/24 code items)
- [x] 3 VS Code tasks added
- [x] Fix tasks.json malformed structure
</details>

---

## Consolidated From

- `2026-04-19_PIPELINE_STATUS_AND_GAPS.md`
- `2026-04-18_consolidated-todo.md`
- `2026-04-17_architecture-backlog.md`
- `2026-04-06_deep-review-pipeline-gaps-roadmap.md`
- `UNSLOTH_VLM_CHR97_NEXT_STEPS_2026-04-02.md`
