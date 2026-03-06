# Deeds Web App — Codebase Map

## Last Updated: February 26, 2026 (Session 93r28)

---

## Grand Totals

| Metric | Count |
|--------|-------|
| **Total files (excl node_modules, .git)** | 296,713 |
| **Total directories** | 45,653 |
| **SvelteKit src/ files** | 2,728 |
| **SvelteKit src/ directories** | 705 |
| **Root directories** | 145 |
| **Markdown files (.md)** | 5,477 |
| **Go files (.go)** | 12,523 |
| **CUDA files (.cu/.cuh)** | 562 |
| **Proto files (.proto)** | 345 |
| **Python files (.py)** | 45,384 |
| **WGSL shaders (.wgsl)** | 4 |
| **Dockerfiles** | 88 |
| **Executables (.exe)** | 497 |
| **deeds_labs/ files** | ~12,860 |

---

## SvelteKit Frontend (src/ — 2,728 files, 705 dirs)



### src/routes/ (367 files) — Pages + API

#### App Routes — src/routes/(app)/ (23 pages)

| Route | Files | Purpose | Status |
|-------|-------|---------|--------|
| `cases/` | ~20 | Case management (CRUD, AI, board, persons, notes) | ACTIVE |
| `evidence/` | ~8 | Evidence upload + search | ACTIVE |
| `evidence-library/` | ~4 | Evidence gallery | ACTIVE |
| `dashboard/` | ~4 | Main dashboard with stats | ACTIVE |
| `citations/` | ~6 | Legal citations + KB search | ACTIVE |
| `persons-of-interest/` | ~8 | POI profiles + associates | ACTIVE |
| `terminal/` | ~4 | 9S AI Chat Interface | ACTIVE |
| `ai-dashboard/` | ~6 | AI components dashboard | ACTIVE |
| `command-center/` | ~4 | Codebase command center | ACTIVE |
| `global-search/` | ~4 | GPU-accelerated search | ACTIVE |
| `active-cases/` | ~3 | Active case listing | ACTIVE |
| `analysis-center/` | ~3 | Analysis tools | ACTIVE |
| `admin/` | ~4 | Admin panels (users, system) | ACTIVE |
| `all-routes/` | ~3 | Route health monitoring (SSE) | ACTIVE |
| `error-brain/` | ~3 | Error analysis dashboard | ACTIVE |
| `gpu-evidence-graph/` | ~3 | GPU evidence visualization | ACTIVE |
| `system-configuration/` | ~3 | System config panel | ACTIVE |
| `indexing/` | ~3 | Codebase indexing | ACTIVE |
| `dev-tools/` | ~6 | Dev tools (cache, demos) | ACTIVE |
| `demos/` | ~4 | Component demos | ACTIVE |
| `memory-palace/` | ~3 | NES memory palace | ACTIVE |
| `analytics/` | ~3 | Analytics dashboard | ACTIVE |
| `phase78/` | ~2 | Legacy phase route | LEGACY |

#### API Routes — src/routes/api/ (55 directories, ~170 endpoints)

| API Group | Endpoints | Purpose | Status |
|-----------|-----------|---------|--------|
| `phase89/` | 20 | Phase 89 migration endpoints | LEGACY |
| `routes/` | 10 | Route health SSE | ACTIVE |
| `auth/` | 10 | Authentication (login, register, session) | ACTIVE |
| `health/` | 9 | Health checks + capabilities | ACTIVE |
| `cases/` | 9 | Case CRUD + notes + AI | ACTIVE |
| `codebase-index/` | 8 | Codebase search + indexing | ACTIVE |
| `ai/` | 8 | AI chat, feedback, predictions, scoring | ACTIVE |
| `system/` | 6 | System config + status | ACTIVE |
| `admin/` | 6 | Admin operations | ACTIVE |
| `knowledge/` | 5 | Knowledge base queries | ACTIVE |
| `evidence/` | 5 | Evidence upload, search, analysis, realtime | ACTIVE |
| `reports/` | 4 | Report generation | ACTIVE |
| `codebase/` | 4 | Codebase utilities | ACTIVE |
| `cache/` | 4 | Cache operations | ACTIVE |
| `tags/` | 3 | Tag search + sync | ACTIVE |
| `rag/` | 3 | RAG search/validate/answer | ACTIVE |
| `graph/` | 3 | Neo4j graph queries | ACTIVE |
| `chat/` | 3 | Chat POST + stream | ACTIVE |
| `analytics/` | 3 | Analytics events/summary/patterns | ACTIVE |
| `gpu/` | 2 | GPU lease management | ACTIVE |
| `sse/` | 2 | SSE streaming | ACTIVE |
| `persons-of-interest/` | 2 | POI + associates | ACTIVE |
| `nlp/` | 2 | NLP classify | ACTIVE |
| `internal/` | 2 | Internal error-brain | ACTIVE |
| 30+ more | 1 each | Various single endpoints | MIXED |

---

## Root Project Directory (145+ directories)

### Active Infrastructure

| Directory | Purpose | Status |
|-----------|---------|--------|
| `sveltekit-frontend/` | Main application | ACTIVE |
| `deeds_labs/` | Archive of experimental code | ARCHIVE |
| `scripts/` | Build/test scripts | ACTIVE |
| `drizzle/` | DB migration files | ACTIVE |
| `docker/` | Docker configurations | ACTIVE |
| `config/` | Configuration files | ACTIVE |
| `proto/` + `protos/` + `proto-backup/` | Protocol Buffer definitions | LEGACY — 345 files |
| `sql/` | SQL scripts | ACTIVE |
| `migrations/` | DB migration history | ACTIVE |

### Go Microservices (12,523 .go files — ABANDONED)

| Directory | Purpose | Status |
|-----------|---------|--------|
| `go-microservice/` | Main Go microservices | ABANDONED — SvelteKit handles it |
| `go-trt-service/` | Go TensorRT service | ABANDONED |
| `langextract-go/` | Go LangExtract variant | ABANDONED — Python version running |
| `microservices/` | Additional microservices | ABANDONED |
| `services/` | Service implementations | ABANDONED |
| `temp-services/` | Temporary service code | ABANDONED |
| `test-services/` | Test services | ABANDONED |

### CUDA/GPU Infrastructure (562 .cu/.cuh files)

| Directory | Purpose | Status |
|-----------|---------|--------|
| `legal-ai-cuda/` | CUDA kernels for legal AI | ARCHIVE — WebGPU replaced |
| `gpu-inference-worker/` | GPU inference workers | ARCHIVE |
| `gpu-orchestrator/` | GPU orchestration | ARCHIVE |
| `tensor_services/` | Tensor processing | ARCHIVE |
| `tensorrt_build/` | TensorRT build artifacts | ARCHIVE |
| `trt_engines/` + `trt_models/` + `trt_runner/` + `trt_server/` | TensorRT runtime | STOPPED — 2mo |
| `triton_models/` + `triton-models/` | Triton model configs | ARCHIVE |

### Python Infrastructure (3,576 .py files)

| Directory | Purpose | Status |
|-----------|---------|--------|
| `ingestion-phase66/` | Phase 66 ingestion workers | PARTIAL — langextract running |
| `python-microservice/` | Python microservice | ARCHIVE |
| `python/` | Python utilities | ARCHIVE |
| `ocr_pipeline/` + `ocr-service/` | OCR processing | REPLACED — tesseract.js |
| `hmm-topic-service/` | HMM topic modeling | ARCHIVE |
| `embedding-service/` | Embedding service | REPLACED — Ollama |
| `reranker-service/` | Reranking service | REPLACED — GPU pipeline |

### ML Models & Data

| Directory | Purpose | Status |
|-----------|---------|--------|
| `gemma3Q4_K_M/` | Gemma3 quantized model | ACTIVE — Ollama uses it |
| `granite-docling-258M/` | IBM Granite DocLing model | AVAILABLE — not wired |
| `granite-docling-worker/` | DocLing worker | AVAILABLE — not wired |
| `model_unsloth_hf_f16/` | Unsloth fine-tuned model | AVAILABLE |
| `ollama_models/` | Ollama model cache | ACTIVE |
| `onnx/` | ONNX model files | ACTIVE — client inference |
| `lawpdfs/` | Legal PDF documents | DATA |
| `datasets/` | Training datasets | DATA |
| `sample-data/` | Sample data for testing | DATA |

### Archive/Backup/Legacy

| Directory | Purpose | Status |
|-----------|---------|--------|
| `_archive/` + `archive/` + `archives/` | Multiple archive dirs | CLEANUP NEEDED |
| `backup/` + `backups/` | Backup files | CLEANUP NEEDED |
| `old-scripts/` | Old scripts | ARCHIVE |
| `quarantined-routes/` | Quarantined broken routes | ARCHIVE |
| `weekly-cleanup/` | Cleanup logs | ARCHIVE |
| `checkpoints/` | Model checkpoints | ARCHIVE |
| `snapshots/` | State snapshots | ARCHIVE |

### Tools & Infrastructure

| Directory | Purpose | Status |
|-----------|---------|--------|
| `neo4j-community-5.23.0/` + `neo4j-community-5.23.0-windows/` | Neo4j binaries | ACTIVE — graph DB |
| `qdrant/` + `qdrant-windows/` | Qdrant binaries | ACTIVE — vector DB |
| `redis/` | Redis config | ACTIVE |
| `minio/` + `minio-data/` | MinIO object storage | ACTIVE |
| `pgvector-install/` + `pgvector-precompiled/` | pgvector extension | ACTIVE |
| `nats-server/` | NATS messaging | UNUSED — RabbitMQ used |
| `elk-stack/` | Elasticsearch/Logstash/Kibana | UNUSED |
| `nginx/` | Reverse proxy config | AVAILABLE |
| `ssl/` | SSL certificates | AVAILABLE |

### Misc

| Directory | Purpose | Status |
|-----------|---------|--------|
| `context7/` + `context7-docs/` | Context7 system | UNCLEAR |
| `unocss-main/` | UnoCSS source (for reference) | REFERENCE |
| `webgpu/` | WebGPU examples | REFERENCE |
| `xstate/` | XState examples | REFERENCE |
| `New folder/` | Empty folder | DELETE |
| `__pycache__/` | Python cache | DELETE |

---

## deeds_labs/ (12,860 files — Intentional Archive)

| Directory | Files | Size | Purpose |
|-----------|-------|------|---------|
| `evidence-service/` | 7,443 | 342MB | Evidence processing (has node_modules) |
| `python-middleware/` | 4,005 | 133MB | 27 FastAPI routers for RAG/KAG/DAG |
| `cuda-binaries/` | 616 | 153MB | Compiled CUDA binaries |
| `svelte4-archive/` | 486 | — | Archived Svelte 4 components |
| `development-tools/` | 163 | — | Dev tool archives |
| `archived-dead-files/` | 67 | — | Known dead code |
| `features-archive/` | 38 | — | Archived feature dirs |
| `orphaned-components/` | 30 | — | Components with 0 importers |
| `archived-machines/` | 7 | — | Archived XState machines |
| `archived-unreachable/` | 4 | — | Unreachable code |
| `archived-apis/` | 3 | — | Archived API routes |
| `wasm-archive/` | 2 | — | WASM experiments |
| `proto/` | 1 | — | Proto archive |

---
Updated Overview
The 00-OVERVIEW.md now includes this database migration guide in the summary.

Total work across all categories: ~158 hours (6 categories, 77+ TODO items)

All database changes are production-ready after dev/staging testing. No data will b
## Language Breakdown

| Language | Files | Location | Status |
|----------|-------|----------|--------|
| TypeScript (.ts) | ~1,800 | sveltekit-frontend/src/ | ACTIVE |
| Svelte (.svelte) | ~800 | sveltekit-frontend/src/ | ACTIVE |
| Go (.go) | 12,523 | root dirs (go-microservice/, microservices/, etc.) | ABANDONED |
| Python (.py) | 3,576 | ingestion-phase66/, deeds_labs/, root dirs | PARTIAL |
| CUDA (.cu/.cuh) | 562 | legal-ai-cuda/, deeds_labs/ | ARCHIVE |
| Proto (.proto) | 345 | proto/, protos/, src/proto/ | LEGACY |
| Markdown (.md) | 2,751+ | Everywhere | NEEDS CLEANUP |
| WGSL (.wgsl) | 4 | sveltekit-frontend/src/ | ACTIVE |
---
## Key Server Infrastructure Files
| File | Lines | Purpose |
|------|-------|---------|
| `lib/server/db/schema-postgres.ts` | 2000+ | 70+ tables, 14 enums |
| `lib/server/vector/qdrant-manager.ts` | 400+ | 6 Qdrant collections, hybrid search |
| `lib/server/queue/rabbitmq-manager-fixed.ts` | 350+ | 7 queues, 7 consumers |
| `lib/server/cache.ts` | 200+ | Dual-tier memory + Redis cache |
| `lib/server/redis.ts` | 100+ | ioredis singleton |
| `lib/server/grpc/embedding-client.ts` | 200+ | gRPC→HTTP fallback embeddings |
| `lib/server/rag-pipeline.ts` | 300+ | End-to-end RAG pipeline |
| `lib/server/indexer/legal-chunker.ts` | 200+ | Structure-aware legal chunking |
| `lib/server/analysis/entity-extraction.ts` | 250+ | LLM + regex entity extraction |
| `lib/server/analysis/forensics.ts` | 200+ | PII/legal pattern detection |
| `lib/server/ace/context-assembler.ts` | 250 | ACE parallel data fetching |
| `lib/server/neo4j-schema.ts` | 100+ | Neo4j constraints + indexes |
| `lib/server/pg-neo4j-sync.ts` | 150 | Postgres → Neo4j MERGE pipeline |

## Key Client Infrastructure Files

| File | Lines | Purpose |
|------|-------|---------|
| `lib/ai/client-router.ts` | 200+ | Local vs server inference routing |
| `lib/ai/client-cache.ts` | 300+ | LokiJS + IndexedDB dual-tier |
| `lib/ai/client-embed.ts` | 200+ | 768-dim ONNX embeddings |
| `lib/ai/onnx/session.ts` | 150+ | WebGPU → WASM → CPU factory |
| `lib/models/ChatSession.svelte.ts` | 429 | Central chat hub |
| `lib/gpu/gpu-compute-pipeline.ts` | 709 | 3 WGSL shaders, WebGPU compute |
| `lib/gpu/gpu-search-reranker.ts` | 148 | Client-side GPU reranking |
| `lib/machines/retrieval-machine.ts` | 200+ | XState v5 2-stage retrieval |
---
## Database Tables (Postgres + pgvector)
**70+ tables across these groups:**
- Auth: users, sessions
- Cases: cases, caseNotes, caseStatuteLinks
- Evidence: evidence, evidenceRelationships
- Documents: documents, legalDocuments, documentChunks
- Legal: citations, statutes, statuteChunks, legalPrecedents
- RAG: ragSessions, ragMessages
- Embeddings: 6 vector tables (768-dim)
- Analytics: analyticsEvents
- Error Tracking: phase72_error, phase72_patch
- Workspaces, Route Health, and more
**Qdrant Collections (768-dim):**
- evidence_items, legal_documents, legal_cases
- codebase_chunks_768, chat_messages, embedding_cache
- document_tags
**Redis Keys:** Session cache, L3 cache tier, GPU arbiter VRAM mutex, analytics sorted sets
---
## Kiro Spec Features — Implementation Gap

**Last Updated: March 5, 2026 (Session 93r28c+++++++++++)**

| # | Feature | Planned | Built | Gap |
|---|---------|---------|-------|-----|
| 1 | Multi-Source Retrieval (Google+Wiki+RAG+KAG+Graph) | 15 reqs, 31 tasks | 15% | RAG+KAG+DAG wired, no Google/Wiki/external sources |
| 2 | YoRHa Detective Screens | 3 screens | 40% | Terminal done, Board partial, Command Center codebase-only |
| 3 | VLM Legal Vision | 5 subsystems | 35% | YOLO + Gemma3 VLM + LangExtract OCR wired, POI photos pipeline ✅, no fusion/TensorRT |
| 4 | Self-Healing Error Agent | Auto-patch loop | 5% | Error Brain exists, no auto-patch |
| 5 | Unified Reasoning Engine | C++ gRPC + CUDA | 0% | DEFERRED — Ollama + batch embedder covers same ground |
| 6 | ACE Web Ingestion | Crawl→chunk→embed→KAG | 75% | POST /api/ace/ingest ✅, context-assembler dual-search ✅, Analysis Center UI ✅, no KAG graph nodes yet |
| 7 | Citation Intelligence | Collections, tags, export | 100% | Collections API ✅, tags ✅, export ✅, CitationCollections + CollectionDetail wired to /citations ✅ |
| 8 | Agentic Alignment Router | Intent classify + KAG | 75% | 3-tier routing (LOCAL/RETRIEVAL/SERVER) ✅, health-aware ✅, 6 scoring rules ✅, no KAG intent |
| 9 | Knowledge Search Engine | IDF + HMM + external docs | 60% | 4-source parallel search (Qdrant+glossary+statutes+precedents) ✅, TF-IDF reranking ✅, no HMM/external docs |
| 10 | Case Notes Enhancements | Versioning, FTS, PDF export | 100% | Versioning ✅, CRUD ✅, diff view ✅, case packet export ✅, FTS ✅, evidence linking ✅, notes tab route ✅ |
| 11 | Person of Interest | Vector search UI + photos | 95% | Schema ✅, photos API ✅, VLM pipeline ✅, poi_profiles Qdrant ✅, load function ✅, upload/delete/view UI ✅ |
| 12 | Error Brain DB Wiring | History + patches | 100% | phase72_error table ✅, status API ✅, runs API ✅, /all-routes panel ✅ |
| 13 | Infrastructure & Docker | Full stack | 85% | TensorRT/fastmcp/postgres DOWN |
| 14 | Svelte 5 Migration | Runes + bits-ui | 100% | COMPLETE |
| 15 | Evidence Pipeline Scaling | Batch embed + summary + tags | 100% | pLimit(3) ✅, batch /api/embed ✅, summary→Qdrant ✅, auto-tag ✅ |
| 16 | Report Caching | Templates + warmup + exports | 100% | Redis template cache ✅, startup warmup ✅, export cache ✅ |
| 17 | Cache Infrastructure | Invalidation + monitoring | 100% | Multi-tier invalidation ✅, admin dashboard ✅, Qdrant health ✅ |

---

## Quick Wins Status

| # | Quick Win | Was | Now | Status |
|---|-----------|-----|-----|--------|
| 1 | Error Brain History UI | 90% | 100% | ✅ DONE — toggle panel + status stats + run history on /all-routes |
| 2 | POI Vector Search UI | 70% | 95% | ✅ DONE — photos load + upload/delete/view UI wired |
| 3 | Case Notes Versioning + FTS | 60% | 100% | ✅ DONE — DB tables + API + diff view + restore + FTS search + evidence linking + notes tab route |
| 4 | Citation Tags | 20% | 40% | ✅ DONE — citation_tag_links M2M + CRUD API |
| 5 | Infrastructure Restart | 85% | 85% | Pending — postgres/TensorRT/fastmcp DOWN |
| 6 | Case Packet PDF Export | 60% | 90% | ✅ DONE — HTML export + citations section + download |
| 7 | NES Modal for Notes | 60% | 60% | Pending — bits-ui Dialog SSR TDZ workaround |
---
## What's Left to Implement
### Client ↔ Server RAG Integration (~4h total)
The client has all the pieces (ONNX models, embedding, cache, router) but they aren't connected into a working local RAG loop. The server RAG is production-grade.
**Current state:**
```
Client: gemma270m ONNX (292MB) + embeddinggemma ONNX (329MB) + LokiJS/IndexedDB cache
        → Router ALWAYS escalates to server (threshold too aggressive)
Server: gemma3-legal (7.3GB) + embeddinggemma Ollama + Qdrant + pgvector + Redis
        → Full RAG+KAG+DAG pipeline, 6 routes calling it
```
**Target architecture:**
```
User Query
  ↓
Client Router (client-router.ts)
  ├── SIMPLE (score < 0.3): gemma270m ONNX — instant, no network
  │   ├── Greetings, UI help, "what is X" lookups
  │   ├── Client embedding → IndexedDB semantic search
  │   └── <200ms response, works offline
  │
  ├── RETRIEVAL (0.3-0.6): Hybrid client+server
  │   ├── Client embeds query (ONNX 768-dim, cached)
  │   ├── Server searches Qdrant+pgvector (returns top-K chunks)
  │   ├── Client GPU reranks with cosine similarity
  │   ├── Client gemma270m generates short answer from top-3 chunks
  │   └── Falls back to server if local answer < confidence threshold
  │
  └── COMPLEX (score > 0.6): gemma3-legal server — full pipeline
      ├── RAG+KAG+DAG (dual search, graph-hop, doc context)
      ├── Entity extraction + forensic detection
      ├── Citation-grounded answers
      └── SSE streaming to client
```
#### Task A: Tune Client Router Thresholds — ✅ DONE
- 3 routing tiers: LOCAL (<0.3) / RETRIEVAL (0.3-0.6) / SERVER (>0.6)
- 6 scoring rules + health-aware escalation via `/api/health/capabilities`

#### Task B: Wire Client Embedding to RAG Search — ✅ DONE
- `/api/rag/search` accepts `precomputedEmbedding` (768-dim validation)
- ChatSession pre-computes ONNX embedding → GPU rerank → context-augmented local generation

#### Task C: Wire 3-Step RAG Pipeline UI — ✅ DONE
- Wired in `/ai-dashboard`: Search → SourceValidator → AnswerWithCitations
- Redis context handoff (`rag:context:{id}`, 10min TTL) between validate → answer

#### Task D: Wire XState Retrieval Machine — ✅ DONE
- `CodebaseSearch.svelte` uses `useMachine(retrievalMachine)` with timing display
- Wired to `/global-search`, `/command-center`, app layout (Ctrl+K)
- XState v5 `setup().createMachine()` with recall → rerank → assemble actors

#### Task E: Client-Side Answer Generation — ✅ DONE
- Local ONNX fires for simple queries (128 tokens, greedy decode)
- Retrieval-hybrid prepends top-3 RAG chunks as context
- Escalation chain: local → retrieval → server → error (<50 char threshold)

### Remaining Feature Gaps

#### Multi-Source Retrieval — Feature #1 (~3h)
- Currently searches 3 Qdrant collections only
- **Add:** Google Custom Search API → chunk → embed → merge with Qdrant results
- **Add:** Wikipedia API → chunk → embed → merge
- **Add:** Cross-source deduplication + unified reranking
- **Files:** New `src/lib/server/external-search.ts`, modify `/api/rag/search`

#### ACE Web Ingestion — Feature #6 (75% done)
- ✅ POST /api/ace/ingest (186L) — URL fetch → stripHtml → legal-chunker → batch embed → Qdrant `legal_documents`
- ✅ context-assembler.ts — fetchRAGChunks now searches `evidence_items` + `legal_documents` in parallel
- ✅ Analysis Center UI — paste URL + optional case ID → ingest → shows chunks/tokens/timing
- **Remaining:** KAG graph node creation for web sources (Neo4j integration)
- **Files:** `src/routes/api/ace/ingest/+server.ts` (186L), `context-assembler.ts` (+20L), `analysis-center/+page.svelte` (+60L)

#### VLM Legal Vision — Feature #3 (~2h remaining)
- YOLO + Gemma3 VLM + LangExtract OCR + POI photos pipeline done
- **Missing:** DocLing layout-aware analysis for complex legal documents
- **Missing:** Multi-modal fusion (combine VLM + OCR + entity extraction)
- **Missing:** POI photo gallery UI + face similarity search UI
- **Files:** Wire `src/lib/server/docling.ts`, new `PoiPhotoGallery.svelte`

#### Citation Intelligence UI — Feature #7 (~1h remaining)
- Collections API (8 endpoints) ✅, tags ✅, export (HTML/MD/JSON) ✅
- **Missing:** Wire `CitationCollections.svelte` + `CollectionDetail.svelte` to `/citations` page
- Already API-wired with fetch() calls — just need route integration

#### Knowledge Search — Feature #9 (~2h)
- Codebase search works, no external document search
- **Add:** `/api/knowledge/search` → parallel query (glossary + statutes + precedents + Qdrant)
- **Add:** TF-IDF scoring across all sources
- **Add:** HMM-based query expansion for legal terminology

#### Self-Healing Error Agent — Feature #4 (~3h)
- Error Brain DB + UI exists, no auto-patch
- **Add:** Error pattern → LLM suggests fix → apply patch → re-check
- **Add:** Patch history table + rollback capability
- Requires careful guardrails (LLM-generated patches are risky)

---

## Architecture Decisions (Confirmed)

| Decision | Status | Rationale |
|----------|--------|-----------|
| **SvelteKit-only backend** | CONFIRMED | 170+ API endpoints handle everything |
| **HTTP + SSE streaming** | CONFIRMED | Works for all use cases |
| **Go microservices** | ABANDONED | 12,523 files, 2 running — SvelteKit replaced |
| **gRPC** | ABANDONED | HTTP fallback active, proto files legacy |
| **QUIC protocol** | ABANDONED | Design-only, never implemented |
| **Ollama for LLM** | ACTIVE | gemma3-legal + embeddinggemma |
| **ONNX for client AI** | ACTIVE | WebGPU → WASM → CPU fallback |
| **WebGPU compute** | ACTIVE | 3 WGSL shaders, wired to /global-search |
| **Redis + Postgres + Qdrant** | ACTIVE | Multi-tier architecture |
| **RabbitMQ queues** | ACTIVE | 7 queues, 7 consumers |

---

## What's Salvageable from Go/CUDA

### Worth Investigating
- **granite-docling-258M/** — IBM DocLing model for legal OCR (superior to tesseract.js)
- **granite-docling-worker/** — Worker to run DocLing
- **CUDA clustering kernels** — Could accelerate Qdrant operations
- **Proto schemas** — Could define internal API contracts (without gRPC)

### Replace with SvelteKit/JS
- Go microservices → SvelteKit API routes (already done)
- Go gRPC services → HTTP endpoints (already done)
- CUDA embedding service → Ollama embeddinggemma (already done)
- Python RAG service → SvelteKit rag-pipeline.ts (already done)

### Future: After Unsloth Training
- Custom gemma3-legal fine-tuned → Ollama serve
- ONNX export of fine-tuned model → client inference
- VLM version → /api/vision/analyze enhancement
