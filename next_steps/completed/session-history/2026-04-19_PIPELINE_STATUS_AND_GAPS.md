# Pipeline Status & Feature Gaps — April 19, 2026

**Purpose**: Single source of truth for what's WIRED vs what's a GAP.
Replaces 44 scattered next_steps docs. Updated by auditing live code, not aspirational roadmaps.

---

## Architecture Summary

```
CLIENT (Browser)                    SERVER (SvelteKit + Docker)
├─ Gemma4 E2B 2.3B (WebGPU)       ├─ Ollama gemma4-rotorquant:latest (5.3GB GPU)
├─ LiteRT-LM E2B (CPU :8070)      ├─ Ollama embeddinggemma (300MB shared)
├─ Gemma3 270M ONNX (WASM)        ├─ Ollama granite-docling-258m (on-demand)
├─ EmbeddingGemma 300M ONNX       ├─ TurboQuant llama.cpp (:8090 turbo3 KV)
│                                   ├─ LangExtract spaCy NER (:8095 Docker)
│                                   ├─ Whisper ASR (:8085 Docker)
│                                   ├─ LibTorch N-API (CUDA direct)
│                                   │   ├─ kmeansWithCentroids
│                                   │   ├─ trainSOM
│                                   │   ├─ pageRankGPU
│                                   │   ├─ attentionScoreGPU
│                                   │   ├─ rewardScoreGPU
│                                   │   ├─ batchCosineSimilarity
│                                   │   └─ simdJsonParse (AVX2 CPU)
│                                   ├─ Worker Threads (compute-pool.ts)
│                                   └─ RabbitMQ (10 async queues)
│
├─ 7-Layer Cache: L0 LokiJS → L1 IndexedDB → L2 Server Map →
│  L3 Redis exact → L4 Bifrost semantic → L5 Embedding Redis → L6 CouchDB DAG
│
└─ Feedback Loop: Wiki → Timeline → RL Weights → QLoRA → Cache Warm → Hypergraph4D
```

---

## WIRED (Working End-to-End)

### AI/LLM Pipeline
- [x] 7-tier server inference cascade (TRT → Triton → Bifrost → TurboQuant → VLM → LiteRT → Ollama)
- [x] 3-tier client inference cascade (E2B WebGPU → LiteRT CPU → ONNX WASM)
- [x] GPU arbiter (Redis lease, VRAM contention management)
- [x] Bifrost L2 semantic cache (90% hit rate on legal queries)
- [x] Redis L0 exact-match cache (SHA-256, 3ms)
- [x] SSE streaming chat with 9 contextual tools (glossary, rag, web, graph, authority, case, crawl_web, crawl_legal, glyph)
- [x] Gemma4 agent with 4 tools (rag_search, case_search, memory_recall, hyperedge_stats)
- [x] LangGraph TS in-process (supervisor → parallel workers → merge)
- [x] Karpathy wiki (4 note types: cluster, retrieval, playbook, research)
- [x] Context timeline RL audit trail (context_timeline Postgres table)
- [x] RL policy weight adaptation (adaptFromAnalytics on feedback signals)
- [x] QLoRA distillation pipeline (chunk_hit_log → qlora_examples → tier promotion)

### Codebase Intelligence
- [x] ts-morph AST parsing → CodeChunk with tags
- [x] Dual-vector embedding (content + signature, 768-dim)
- [x] Qdrant codebase_chunks_768 collection (keyword indexes fixed)
- [x] Neo4j dependency graph (3140 nodes, IMPORTS/REFERENCES edges)
- [x] GPU k-means clustering (LibTorch N-API)
- [x] SOM topology pipeline (trainSOM → som_cluster → SIMILAR_TOPOLOGY edges)
- [x] PageRank (GPU + CPU fallback)
- [x] 4D hypergraph (som_x, som_y, semantic_z, grpo_w → manifold4 column)
- [x] Cluster summaries (LLM narrative per cluster, Redis 6h cache)
- [x] Topology expansion in LangGraph workers (expandViaTopology)
- [x] Error vector embedding (phase90 error clusters → named vector 'error')
- [x] RRF-fused error+content ranking in gpu-pipeline
- [x] 8-stage gpu-pipeline endpoint (POST /api/codebase-index/gpu-pipeline)

### Legal Analysis
- [x] Evidence upload + 9-stage processing pipeline
- [x] ACE context assembly (RAG + KAG + DAG + topology + web)
- [x] Legal chunker (structure-aware ARTICLE/SECTION/paragraph)
- [x] Entity extraction (LLM + regex: EMAIL, PHONE, DATE, CITATION, STATUTE, MONEY)
- [x] Forensic pattern detection (SSN, CC, contact density)
- [x] Authority chain drill-down (2-hop statute/case expansion)
- [x] Citation search (Qdrant + pgvector + keyword)
- [x] Evidence/codebase unified in same ACE pipeline

### Infrastructure
- [x] 47-gate audit system (Tiers A-H in CLAUDE.md)
- [x] Production gate script (scripts/production-gate.ps1)
- [x] Playwright test suite (20/20 passing)
- [x] svelte-check: 0 errors, 0 warnings
- [x] Docker compose profiles (essential/full/gpu)
- [x] 14 GitHub agents (.github/agents/)

---

## GAPS (Described But Not Wired)

### P0 — Critical Path (blocks dev→testing→production flow)

#### ~~GAP-1: Agentic Chat Not in Main User Flow~~ ✅ CLOSED (April 19, 2026)
**Wired**: `client-router.ts` → `agenticScore()` detects multi-hop/compound queries → `shouldEscalateToServer()` routes to `'server-agentic'` source → `ChatSession.svelte.ts` `_handleAgenticInference()` calls `/api/ai/agent` with fallback to SSE on failure.
**Files changed**: `src/lib/ai/model-ids.ts` (+`server-agentic`), `src/lib/ai/client-router.ts` (+agentic detection), `src/lib/models/ChatSession.svelte.ts` (+handler+routing)

#### ~~GAP-2: GPU Recomputation Not Triggered from Full Pipeline~~ ✅ CLOSED (April 19, 2026)
**Wired**: `gpu-pipeline` POST accepts `recompute: true` → Stage 0 runs: ts-morph AST scan → `chunkFiles()` → `indexChunks()` (dual-embed → Qdrant upsert) → `analyzeGraph()` (GPU k-means + PageRank) → `runSOMTopologyPipeline()` (SOM topology → Neo4j edges) → invalidates Redis chunk cache → continues to normal pipeline stages.
**Files changed**: `src/routes/api/codebase-index/gpu-pipeline/+server.ts` (+recompute schema field, +Stage 0 block, dynamic imports for heavy modules)

#### ~~GAP-3: Batch PyTorch → Codebase Tasks Not Orchestrated~~ ✅ CLOSED (April 19, 2026)
**Wired**: `POST /api/codebase-index/batch-gpu` — single endpoint runs all 7 GPU ops over full corpus:
scroll all vectors → batchCosineSimilarity (optional query) → kmeansWithCentroids → trainSOM → pageRankGPU → attentionScoreGPU → rewardScoreGPU → Qdrant payload write-back.
Per-stage selection via `stages` array. Configurable k, SOM grid, maxChunks (up to 5000). All GPU ops have CPU fallback. Pooled Float32Arrays with drain.
**Files created**: `src/routes/api/codebase-index/batch-gpu/+server.ts` (~280 lines)

### P1 — Important (improves quality significantly)

#### GAP-4: simdjson Not Wired to Hot Paths
**Status**: `fastJsonParse()` exists in `simdjson-bridge.ts` but NOT used in: `ollama.ts` responses, Qdrant scroll results, RabbitMQ message parsing.
**What's missing**: Replace `JSON.parse()` with `fastJsonParse()` in the 5 hottest JSON paths.
**Files**: `src/lib/server/ollama.ts`, `src/lib/server/vector/qdrant-manager.ts`
**Effort**: Small

#### GAP-5: Granite-Docling Not in Evidence Pipeline
**Status**: `granite-docling.ts` wrapper exists, `/api/evidence/extract-docling` endpoint exists, but NOT called from main evidence upload pipeline.
**What's missing**: Wire Granite-Docling as Stage 2 fallback (before OCR Tesseract) in evidence processing.
**Files**: `src/lib/server/analysis/granite-docling.ts`, evidence pipeline workers
**Effort**: Small

#### GAP-6: VLM LoRA Merge (Colab)
**Status**: GRPO training complete (10,214 steps). LoRA adapter exists. Unsloth PR #4807 merged upstream. GGUF not yet generated.
**What's missing**: Run `Gemma4_E4B_Legal_VLM_Reattach.ipynb` on Colab G4 → merge adapter → export GGUF → `ollama create gemma4-rotorquant:latest`
**Files**: `scripts/unsloth-training/Gemma4_E4B_Legal_VLM_Reattach.ipynb`
**Effort**: Medium (Colab runtime, ~2hrs)

#### GAP-7: Langfuse Trace Wiring
**Status**: Langfuse clients exist in 42 files but `LANGFUSE_ENABLED=false` by default. Tracing decorators defined but not measuring real production latency.
**What's missing**: Enable `LANGFUSE_ENABLED=true`, verify traces appear at `:3030`, add latency dashboards.
**Effort**: Small (config change + verification)

### P2 — Valuable (professional legal analysis features)

#### GAP-8: Canonical Legal Document Corpus
**Status**: 3D Prosecutor roadmap describes `canonical_documents` + `canonical_chunks` + `terms` + `examples` tables. None exist in Drizzle schema.
**What's missing**: Drizzle schema for canonical legal corpus, ingestion pipeline for FRE rules/federal statutes/SCOTUS chunks.
**Files**: `src/lib/server/db/schema-postgres.ts`
**Effort**: Large

#### GAP-9: User Interaction Graph
**Status**: Described in USER_ANALYTICS doc: user→case interaction graph (VIEWED, SEARCHED, ANALYZED edges). Neo4j schema exists but not populated.
**What's missing**: Record user interactions as Neo4j edges, run PageRank for personalized suggestions, wire into dashboard "For You" section.
**Files**: `src/lib/server/graph/codebase-neo4j-sync.ts`
**Effort**: Medium

#### GAP-10: D3 Graph Visualization
**Status**: Described in CODEBASE_KG_PLAN. Route exists but visualization may be incomplete.
**What's missing**: D3 force-directed layout for codebase dependency graph with filters (by directory, type, language).
**Effort**: Medium

#### GAP-11: POI Face Recognition
**Status**: Schema has `faceEmbedding` field. Face recognition + similarity search pipeline designed but not implemented.
**What's missing**: Face embedding extraction, Qdrant face collection, similarity search endpoint.
**Effort**: Large

### P3 — Deferred (not blocking, nice to have)

#### GAP-12: HMM Legal Section Tagger (Port from Python)
**Status**: Python LangGraph container had HMM Viterbi tagger for 7 legal states. Container is dormant (zero callers).
**What's missing**: Port Viterbi to TypeScript or wire through LibTorch N-API for legal section auto-labeling.
**Effort**: Medium

#### GAP-13: Redis Rate Limiting
**Status**: Token bucket rate limiting exists for `/api/ai/agent` (20 req/user/min) and `/api/analytics/research-graph` (10 req/user/min). Other endpoints unprotected.
**What's missing**: Generalized rate limiting middleware for all API routes.
**Effort**: Medium (deferred until horizontal scaling)

#### GAP-14: .env.example Reconciliation
**Status**: `.env.example` has 21 vars but app uses 50+. Missing: SEARXNG_URL, DOCLING_SERVICE_URL, WHISPER_MODEL, etc.
**Effort**: Small

#### GAP-15: Obsidian Export (Karpathy Wiki)
**Status**: `exportToObsidian()` function exists in karpathy-wiki.ts. Never called from UI.
**What's missing**: Admin button to export wiki notes to Obsidian vault.
**Effort**: Small

---

## Priority Execution Order

```
P0 (this week):
  GAP-1 → ✅ DONE — Agentic chat wired to main user flow
  GAP-2 → ✅ DONE — Recompute flag wired to gpu-pipeline
  GAP-3 → ✅ DONE — Batch PyTorch orchestrator at /api/codebase-index/batch-gpu

P1 (next):
  GAP-4 → simdjson hot paths
  GAP-5 → Granite-Docling in evidence pipeline
  GAP-6 → VLM LoRA merge on Colab
  GAP-7 → Enable Langfuse

P2 (after P1):
  GAP-8 → Canonical legal corpus schema
  GAP-9 → User interaction graph
  GAP-10 → D3 visualization
  GAP-11 → POI face recognition

P3 (deferred):
  GAP-12 → HMM tagger port
  GAP-13 → Rate limiting
  GAP-14 → .env.example
  GAP-15 → Obsidian export UI
```

---

## .md Files to Archive (26 stale docs)

These next_steps/active/ docs are superseded by this consolidated doc:

```
2026-03-15_GPU_UPGRADE_COMPARISON.md
2026-03-15_TRITON_VLM_FULL_PIPELINE.md
2026-03-15_TRTLLM_EXECUTION_PIPELINE.md
2026-04-02_EVIDENCE_UPLOAD_VLM_NOTEBOOKS_TODO.md
2026-04-06_consolidated-todo.md
2026-04-06_gemma4-community-integration-checklist.md
2026-04-06_next-steps-triage.md
2026-04-18_ai-analysis-recommendations-buildout.md
ARCHITECTURE_ENHANCEMENT_ROADMAP_2026-04-02.md
COUCHDB_NEO4J_GPU_READINESS_AUDIT_2026-03-31.md
DEEDS_LABS_ARCHIVAL.md
DEEP_REVIEW_AUDIT_2026-04-01.md
ENHANCED_UX_PLAYWRIGHT_TESTING.md
gemma4-audio-capabilities.md
GEMMA4_INTEGRATION_PLAN_2026-04-03.md
MULTIMODAL_IMPLEMENTATION_ROADMAP.md
PERFORMANCE_TEST_PLAN.md
PRODUCTION_ENHANCEMENT_ROADMAP_2026-03-31.md
RUNTIME_PROOF_HANDOFF_2026-03-31.md
SESSION_TODO_2026-04-03.md
SETUP_WIZARD_ONBOARDING.md
TENSORRT_ENV_AND_ARCHIVED_SERVICES.md
TRT_DIRECTORY_CONSOLIDATION.md
TRT_ENGINE_BUILD_STEPS.md
UUID_VALIDATION_DRIZZLE_AUDIT.md
WSL2_TRTLLM_READINESS_CHECKLIST_2026-03-31.md
```

---

## Pipeline Flow (Dev → Testing → Production)

```
DEV TOOL (Codebase Intelligence):
  ts-morph AST → dual-embed → Qdrant → k-means → SOM → PageRank
  → error vectors → RRF ranking → ACE context → LLM fix suggestions
  → Karpathy wiki notes → topology expansion → cluster summaries

TESTING (Automated Verification):
  production-gate.ps1 → service health → app routes → SIMD bridge → svelte-check
  Playwright 20/20 → screenshot regression → console error detection
  47-gate audit (imports, auth, Zod, runes, graph, glyph, analytics)

PRODUCTION (Legal Analysis for Users):
  Evidence upload → 9-stage pipeline → legal chunking → entity extraction
  → forensic detection → RAG/KAG/DAG retrieval → ACE context assembly
  → 4D topology scoring → LLM synthesis → SSE streaming → feedback loop
  → RL adaptation → QLoRA distillation → wiki update → cache warming
```

The same infrastructure serves both: the dev tool uses codebase_chunks_768 + error vectors,
the legal tool uses evidence_items + legal_documents + citations. Both flow through ACE.