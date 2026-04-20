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

## Quick Wins (runtime-only, need dev server)

- [ ] **Seed research_summaries** — VS Code task `P6-B` (5 legal corpus topics → Postgres)
- [ ] **Build research graph** — VS Code task `P6-C` (needs ≥40 rows in research_summaries)
- [ ] **Pre-upload Playwright suite** — `test-screenshots.mjs --all --html`

---

## P1 — Important Gaps (improves quality significantly)

### ~~GAP-4: simdjson Not Wired to Hot Paths~~ CLOSED
`fastJsonParse()` already used in `ollama.ts` (lines 52, 309, 422, 498, 539) and `qdrant-manager.ts` (lines 7, 228).

### GAP-5: Granite-Docling Not in Evidence Pipeline
`granite-docling.ts` wrapper + `/api/evidence/extract-docling` exist but NOT called from main upload pipeline.
**Fix**: Wire as Stage 2 fallback (before OCR Tesseract). **Effort**: Small.

### GAP-6: VLM LoRA Merge (Colab)
**See**: [GPU_MODEL_VLM_DEPLOYMENT.md](GPU_MODEL_VLM_DEPLOYMENT.md) — full VLM merge plan. **Effort**: Medium.

### GAP-7: Langfuse Trace Wiring
42 files instrumented but `LANGFUSE_ENABLED=false`. **Fix**: Enable + verify at `:3030`. **Effort**: Small.

---

## P2 — Valuable Gaps (professional features)

### GAP-8: Canonical Legal Document Corpus
3D Prosecutor roadmap describes `canonical_documents` + `canonical_chunks` + `terms` tables. None exist in Drizzle schema.
**Fix**: Drizzle schema + ingestion pipeline for FRE rules/federal statutes/SCOTUS chunks. **Effort**: Large.

### GAP-9: User Interaction Graph
Neo4j schema exists but not populated. Need: record VIEWED/SEARCHED/ANALYZED edges, PageRank for suggestions.
**See**: [FEATURE_ROADMAPS.md](FEATURE_ROADMAPS.md) — Neo4j activation details. **Effort**: Medium.

### GAP-10: D3 Graph Visualization
Route exists but may be incomplete. Need D3 force-directed layout with filters. **Effort**: Medium.

### GAP-11: POI Face Recognition
Schema has `faceEmbedding`. Pipeline designed but not implemented.
**See**: [FEATURE_ROADMAPS.md](FEATURE_ROADMAPS.md). **Effort**: Large.

---

## P3 — Deferred Gaps

| Gap | Description | Effort |
|-----|-------------|--------|
| GAP-12 | HMM Legal Section Tagger (port from Python Viterbi) | Medium |
| GAP-13 | Redis Rate Limiting (generalized middleware) | Medium |
| GAP-14 | .env.example reconciliation (21 vars vs 50+ used) | Small |
| GAP-15 | Obsidian Export UI (Karpathy wiki `exportToObsidian()`) | Small |

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
- **Go gRPC embedding server**: DEFERRED (archived in deeds_labs/)
- **Proto services** (ToolCalling, Retrieval, Whisper gRPC): DEFERRED

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
