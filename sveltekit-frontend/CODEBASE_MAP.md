# Deeds Web App — Codebase Map
## Last Updated: April 8, 2026 (Gemini 10-Layer Audit Integration + API Route Recount)

## April 3, 2026 Audit Note

- This file is an inventory and architecture map, not a certification that every route, API contract, or SSR path is production-ready.
- Several newer docs and live checks have moved faster than this map, so counts and readiness statements may drift until the next full recount.
- Recent verified runtime work since this map was last updated includes: case/report SSR preload fixes, contextual chat cold-start stabilization, native CUDA runtime proof, and a broad route smoke validation pass.
- Still open as of April 3: a full cross-check of API validation coverage, GET degraded-shape consistency, Drizzle schema/runtime parity, and route-by-route SSR/render status.

---
## Grand Totals
| Metric | Count |
|--------|-------|
| **Root project directories** | 26 (+ 15 dotdirs) |
| **Root project loose files** | 38 (was 2,231 — bulk archived to deeds_labs/) |
| **SvelteKit src/ files** | 2,115 |
| **SvelteKit src/ directories** | 754 |
| **Svelte components (.svelte)** | 678 |
| **TypeScript files (.ts)** | 1,214 |
| **Server files (lib/server/*.ts)** | 362 |
| **Component files (lib/components/*.svelte)** | 541 |
| **App route groups** | 17 |
| **Page routes (+page.svelte)** | 86 |
| **API endpoints (+server.ts)** | 414 |
| **API route groups** | 80+ |
| **Server subdirectories (lib/server/)** | 88 |
| **deeds_labs/ files** | ~80,000 (intentional archive) |
| **Active compile diagnostics** | **19 import-resolution errors** |
| **Playwright** | **Last audited: 20/20 PASS** |
---
## Root Project Directory (26 regular + 15 dotdirs)
Status note: labels in this inventory describe repository role/classification and were not revalidated as live runtime state during the March 17 audit.

### ESSENTIAL (Primary Code Areas)
| Directory | Purpose | Status |
|-----------|---------|--------|
| `sveltekit-frontend/` | Main SvelteKit 2 + Svelte 5 application | **ACTIVE** |
| `go-microservice/` | Go gRPC embedding (:50051), QUIC-NATS (:4434), GPU inference (:8095), analytics | **ACTIVE** |
| `simd-bridge/` | LibTorch/CUDA N-API addon (tensorrt_bridge.node) — GPU similarity, clustering, embedding | **ACTIVE** |
| `scripts/` | Test scripts (test-screenshots.mjs), build automation | **ACTIVE** |
| `drizzle/` | Drizzle ORM SQL migrations + manual/*.sql | **ACTIVE** |
| `docker/` | Docker build files + utility scripts | **ACTIVE** |
| `proto/` | Protocol Buffer definitions — pbjs/pbts codegen, `proto/active/` has embedding + retrieval | **ACTIVE** |
| `python/` | `docling_analyze.py` — Docling audio/PDF ASR pipeline (MCP transcribe_audio) | **ACTIVE** |
| `python-workers/` | FastAPI embedding worker stub | AVAILABLE |
| `next_steps/` | 17 planning/reference docs (current inventory) | REFERENCE |
### INFRASTRUCTURE (Service Assets)
| Directory | Purpose | Status |
|-----------|---------|--------|
| `neo4j-community-5.23.0/` + `-windows/` | Neo4j graph database binaries | ACTIVE |
| `qdrant/` + `qdrant-windows/` | Qdrant vector DB binaries + data | ACTIVE |
| `redis/` | Redis config | ACTIVE |
| `minio/` + `minio-data/` | MinIO S3 object storage + data | ACTIVE |
| `pgvector-precompiled/` | pgvector PostgreSQL extension | ACTIVE |
| `nginx/` | Reverse proxy config | AVAILABLE |
| `ssl/` | SSL certificates placeholder | AVAILABLE |
| `storage/` | Vector backups, file storage | KEEP |
### DATA + MODELS
| Directory | Purpose | Status |
|-----------|---------|--------|
| `gemma3Q4_K_M/` | Gemma3 quantized model weights | ACTIVE |
| `granite-docling-258M/` | IBM Granite DocLing model for legal OCR | AVAILABLE |
| `libtorch-win-shared-with-deps-2.9.0+cu130/` | PyTorch C++ runtime — linked by tensorrt_bridge.node | **KEEP** |
| `models/` | Model files | DATA |
| `logs/` | Build logs, codemod memories | KEEP |
### ARCHIVE + CLEANUP
| Directory | Purpose | Status |
|-----------|---------|--------|
| `deeds_labs/` | Central archive — ~80K files (svelte4, corrupted, dead code, old services) | KEEP IN PLACE |
| `onnx/` | ONNX model files (gemma3_270m/, model.onnx/) | REVIEW |
| ~~`tensorrt_py310_env/`~~ | ~~TensorRT Python venv~~ | DELETED |
| ~~`hmm-topic-service/`~~ | ~~Empty HMM stub~~ | DELETED |
| ~~`ocr_pipeline/`~~ | ~~Empty OCR stub~~ | DELETED |
| ~~`ollama_models/`~~ | ~~Empty~~ | DELETED |
| ~~`deeds-web-app/`~~ | ~~Nested copy~~ | DELETED |
---
## SvelteKit Frontend (src/ — 2,115 files, 754 dirs)
### Directory Structure
```
sveltekit-frontend/
├── src/
│   ├── lib/           ← 22 top-level dirs, 236 nested subdirs (components, server, ai, stores, types, utils...)
│   ├── routes/        ← (app)/ pages + api/ endpoints
│   ├── mcp/           ← FastMCP server (29 tools, stdio)
│   ├── native/        ← Native bridge stubs
│   ├── proto/         ← Proto definitions for frontend gRPC clients
│   ├── scripts/       ← Build/utility scripts
│   ├── shims/         ← Browser compatibility shims (MUST preserve)
│   ├── stores/        ← Svelte 5 rune stores (.svelte.ts)
│   ├── stories/       ← Component stories
│   ├── styles/        ← Global CSS
│   ├── tests/         ← Test files
│   ├── types/         ← TypeScript type definitions
│   ├── wasm/          ← WASM modules
│   └── workers/       ← Web workers
├── drizzle/           ← SQL migrations (auto + manual/)
├── next_steps/        ← Planning docs (restored from archive)
├── proto/             ← Proto files (active/ subdirectory)
├── static/            ← Static assets (ONNX models, ORT WASM, fonts)
├── tests/             ← Playwright test specs
├── vite-plugins/      ← Custom Vite plugins
└── public/            ← Public assets
```
### Top-Level Dirs (11 tracked source dirs — excludes generated/internal folders)
| Directory | Status |
|-----------|--------|
| `docs_readme/` | Reference docs |
| `drizzle/` | SQL migrations |
| `next_steps/` | Planning docs (restored) |
| `proto/` | Proto definitions |
| `public/` | Public assets |
| `scripts/` | Build scripts |
| `src/` | Main source |
| `static/` | Static assets (ONNX, ORT, fonts) |
| `test/` | Test configs |
| `tests/` | Playwright specs |
| `vite-plugins/` | Custom Vite plugins |
---
## App Routes — src/routes/(app)/ (17 groups, 86 pages)
Status note: `ACTIVE` in this table means the route group is present in `src/routes/(app)`; it does not imply route-level runtime verification.

| Route | Purpose | Status |
|-------|---------|--------|
| `active-cases/` | Active case listing | ACTIVE |
| `admin/` | Admin panels (users, system, knowledge) | ACTIVE |
| `analysis-center/` | Analysis tools | ACTIVE |
| `analytics/` | Analytics dashboard | ACTIVE |
| `cases/` | Case management (CRUD, AI, board, persons, notes) | ACTIVE |
| `citations/` | Legal citations + KB search + collections | ACTIVE |
| `command-center/` | Codebase command center + health monitoring | ACTIVE |
| `dashboard/` | Main dashboard with stats | ACTIVE |
| `demos/` | Component demos (ace-pipeline, bits-ui, cache, gpu, icons, nes-routes, retro) | ACTIVE |
| `evidence/` | Evidence upload + search (ssr=false) | ACTIVE |
| `evidence-library/` | Evidence gallery (ssr=false) | ACTIVE |
| `global-search/` | GPU-accelerated search | ACTIVE |
| `persons-of-interest/` | POI profiles + associates + photos | ACTIVE |
| `recommendations/` | AI recommendations | ACTIVE |
| `reports/` | Report generation | ACTIVE |
| `system-configuration/` | System config panel | ACTIVE |
| `terminal/` | 9S AI Chat Interface (voice I/O, streaming) | ACTIVE |
---
## API Routes — src/routes/api/ (80+ groups, 414 endpoints, 58,531 LOC)
### Core API Groups
| API Group | Endpoints | Purpose |
|-----------|-----------|---------|
| `ai/` | 20 | AI chat, analysis, predictions, scoring, personas, TensorRT, VLM |
| `cases/` | 21 | Case CRUD + notes + citations + chat + export + similar |
| `health/` | 14 | Health checks (DB, Redis, Qdrant, Neo4j, Ollama, GPU, OCR, circuit breakers) |
| `phase89/` | 22 | Legacy phase 89 migration endpoints |
| `routes/` | 9 | Route health SSE + error brain analyses |
| `codebase-index/` | 8 | Codebase search + indexing + clusters |
| `evidence/` | 18 | Upload, search, analysis, realtime, audit, GPU analysis, chain of custody |
| `auth/` | 8 | Authentication (login, register, session, debug, health) |
| `reports/` | 8 | Report generation, export, publish, preview, save |
| `citations/` | 10 | Citations CRUD, collections, tags, export (JSON/PDF) |
| `cache/` | 8 | Cache operations, invalidation, metrics, stats, LLM cache |
| `error-brain/` | 10 | Generate-fix, apply-fix, verify-fix, auto-patch, search, history |
| `persons-of-interest/` | 10 | POI CRUD, associates, photos, face-match, risk, similar |
| `admin/` | 6 | Admin operations, agent fix, knowledge seed |
| `system/` | 6 | System env, health, phase13/78 patches |
| `knowledge/` | 5 | Knowledge base queries, search, stats, stream |
| `analytics/` | 6 | Events, patterns, summary, research-summaries (browse+persist), research-graph (stats+build+rl) |
| `rag/` | 4 | Search, validate, answer, enhanced |
| `graph/` | 5 | Neo4j connections, relationships, sync, timeline |
| `chat/` | 3 | Chat POST, stream, migrate |
| `gpu/` | 3 | Compute, lease, queue |
| `sse/` | 2 | SSE streaming (by ID + chat) |
| `recommendations/` | 4 | User recs, metrics, tracking |
| `tags/` | 3 | Tag CRUD + search |
| `push/` | 2 | Web Push notifications |
| `pipeline/` | 2 | Pipeline run + status |
| `stream/` | 2 | Stream endpoints |
| `infrastructure/` | 1 | Infrastructure status (all services) |
| `embed/` | 1 | Canonical embedding endpoint |
| `synthesis/` | 1 | ACE synthesis generation |
| `ace/` | 2 | ACE ingest + summarize |
| `web/` | 2 | Web crawl + search |
| 48 more | Mixed | Additional specialized endpoints |
---
## Server Architecture — src/lib/server/ (88 subdirectories, 362 .ts files)
### Core Infrastructure
| Directory | Key Files | Purpose |
|-----------|-----------|---------|
| `db/` | `client.ts`, `schema-postgres.ts` (2500+ lines) | Drizzle ORM — 87 tables, 19 enums |
| `vector/` | `qdrant-manager.ts`, `multi-store.ts`, `pgvector.ts` | Qdrant (9 collections) + pgvector |
| `queue/` | `rabbitmq-manager-fixed.ts`, `queue-worker.ts` | RabbitMQ — 8 queues, 8 consumers |
| `cache/` | `invalidation.ts` | Multi-tier cache invalidation |
| `redis/` | (via `redis.ts` at server root) | ioredis singleton + factory |
| `connections/` | `connection-pool.ts` | Central connection pool + shutdown |
| `grpc/` | `embedding-client.ts`, `retrieval-client.ts` | gRPC clients — 4-tier embedding fallback |
### AI + Inference
| Directory | Key Files | Purpose |
|-----------|-----------|---------|
| `gpu/` | `libtorch-bridge.ts`, `cuda-bridge.ts`, `background-analyzer.ts` | LibTorch N-API CUDA — similarity, clustering, embedding |
| `inference/` | `inference-router.ts`, `gpu-arbiter.ts` | Server-side inference routing (TRT→Ollama), VRAM mutex |
| `ai/` | `ollama-client.ts`, `multimodal-fusion.ts`, `endpoints.ts` | Ollama API, VLM+OCR fusion, model endpoints |
| `ace/` | `context-assembler.ts`, `self-prompt.ts`, `types.ts` | ACE parallel data fetching, quality eval → retry |
| `retrieval/` | `wikipedia-search.ts`, `document-dag.ts`, `query-expansion.ts` | RAG sources — Wikipedia, DAG, legal synonyms |
| `nlp/` | NLP classify, sentiment | Natural language processing |
| `ml/` | ML cluster status | Machine learning endpoints |
### Evidence + Analysis
| Directory | Key Files | Purpose |
|-----------|-----------|---------|
| `analysis/` | `entity-extraction.ts`, `forensics.ts` | LLM + regex entities, PII/legal pattern detection |
| `evidence/` | Evidence processing | Evidence pipeline logic |
| `audit/` | `evidence-audit.ts` | Chain of custody audit logging (NEW) |
| `indexer/` | `legal-chunker.ts`, `dual-embedder.ts` | Structure-aware chunking, dual-vector embedding |
| `ocr/` | OCR pipeline | Tesseract integration |
### Graph + Knowledge
| Directory | Key Files | Purpose |
|-----------|-----------|---------|
| `graph/` | `evidence-graph-service.ts`, `graph-centrality.ts` | Neo4j evidence graph + centrality |
| (root) | `neo4j-schema.ts`, `neo4j-driver.ts`, `pg-neo4j-sync.ts` | Neo4j driver + PG→Neo4j sync |
| `rag/` | RAG pipeline components | Retrieval-augmented generation |
### Services + External
| Directory | Key Files | Purpose |
|-----------|-----------|---------|
| `services/` | `langextract-service.ts` | Go SIMD text extraction (port 8095) |
| `minio/` | MinIO integration | S3-compatible object storage |
| `simd/` | SIMD sidecar client | Go SIMD JSON service |
| `notifications/` | Push, email, ntfy | Multi-channel notifications |
| `engagement/` | Heartbeat scanner | Idle re-engagement system |
| `streaming/` | SSE infrastructure | Server-Sent Events |
### Supporting
| Directory | Purpose |
|-----------|---------|
| `auth/` | Authentication logic |
| `cases/` | Case business logic |
| `chat/` | Chat processing |
| `config/` | Server configuration |
| `env/` | Environment helpers |
| `logging/` | Production logger |
| `middleware/` | Request middleware |
| `monitoring/` | Health monitoring |
| `pdf/` | PDF generation |
| `prompt/` | LLM prompt templates |
| `reports/` | Report generation |
| `startup/` | Server startup initialization |
| `tools/` | MCP tool implementations |
| `training/` | ML training utilities |
| `validation/` | Input validation |
| `workflows/` | Workflow orchestration |
---
## Client Architecture — src/lib/ (22 top-level, 236 nested subdirectories)
### Core Client Modules
| Directory | Key Files | Purpose |
|-----------|-----------|---------|
| `ai/` | `client-router.ts`, `client-cache.ts`, `client-embed.ts`, `onnx/session.ts` | Local inference (ONNX WebGPU), 3-tier routing, dual-tier cache |
| `gpu/` | `gpu-compute-pipeline.ts` (709L), `gpu-search-reranker.ts` | 3 WGSL shaders, WebGPU compute, search reranking |
| `models/` | `ChatSession.svelte.ts` (429L) | Central chat hub (local↔server routing) |
| `machines/` | `retrieval-machine.ts` | XState v5 2-stage retrieval orchestration |
| `components/` | 541 .svelte files across 39 top-level subdirs | All UI components |
| `stores/` | `.svelte.ts` stores | Svelte 5 rune-based shared state |
| `types/` | TypeScript definitions | Type system |
| `utils/` | `ollama.ts`, `xstate-svelte5.ts`, etc. | Utility functions (12 active, current inventory) |
| `shims/` | Browser compatibility | **MUST preserve** |
| `services/` | 35 active, 0 errors | **un-excluded** (was 312 corrupted, cleaned Apr 7) |
### Component Subdirectories (39)
| Group | Dirs | Notable |
|-------|------|---------|
| **Core UI** | `ui/`, `layout/`, `forms/`, `modals/`, `Dialog/` | Button, Icon, panels, forms |
| **Domain** | `cases/`, `evidence/`, `citations/`, `poi/`, `legal/`, `legal-ai/` | Business components |
| **AI/ML** | `ai/`, `agent/`, `agentic/`, `rag/`, `recommendations/`, `scoring/` | AI interface components |
| **Visualization** | `visualization/`, `canvas/`, `dashboard/` | Charts, graphs, dashboards |
| **Terminal** | `terminal/`, `yorha/`, `nes/`, `detective/` | YoRHa theme, NES elements |
| **Other** | `admin/`, `codebase/`, `editor/`, `editors/`, `source-validation/` | Specialized |
---
## Key Server Infrastructure Files (35+)
| File | Lines | Purpose |
|------|-------|---------|
| `lib/server/db/schema-postgres.ts` | 2500+ | 87 tables, 19 enums, evidenceAuditLog, evidenceVersions |
| `lib/server/db/client.ts` | ~50 | Primary Drizzle ORM client (canonical import) |
| `lib/server/vector/qdrant-manager.ts` | 400+ | 9 Qdrant collections, hybrid search |
| `lib/server/queue/rabbitmq-manager-fixed.ts` | 350+ | 8 queues, 8 consumers |
| `lib/server/cache.ts` | 200+ | Dual-tier memory + Redis cache |
| `lib/server/redis.ts` | 100+ | ioredis singleton |
| `lib/server/grpc/embedding-client.ts` | 200+ | gRPC → HTTP fallback embeddings (4-tier) |
| `lib/server/grpc/retrieval-client.ts` | 150+ | gRPC retrieval client |
| `lib/server/rag/*.ts` | 8 files | RAG pipeline (evidenceRag, qdrant, ranker, sdk, tag-extractor, types, uiComplianceRag) |
| `lib/server/indexer/legal-chunker.ts` | 200+ | Structure-aware legal chunking |
| `lib/server/indexer/dual-embedder.ts` | 200+ | Dual-vector embedding (content + signature) |
| `lib/server/analysis/entity-extraction.ts` | 250+ | LLM + regex entity extraction |
| `lib/server/analysis/forensics.ts` | 200+ | PII/legal pattern detection |
| `lib/server/gpu/libtorch-bridge.ts` | 280 | GPU similarity/clustering/embedding + CPU fallback |
| `lib/server/gpu/cuda-bridge.ts` | 100+ | CUDA runtime integration, re-exports libtorch |
| `lib/server/gpu/background-analyzer.ts` | 177 | Fire-and-forget CUDA analysis post-upload |
| `lib/server/inference/inference-router.ts` | 200+ | Server-side inference routing (TRT→Ollama) |
| `lib/server/inference/gpu-arbiter.ts` | 150+ | Ollama/TRT-LLM/LibTorch VRAM mutex |
| `lib/server/ace/context-assembler.ts` | 250 | ACE parallel data fetching (8 sources) |
| `lib/server/ace/self-prompt.ts` | 150+ | Quality eval → correction → retry |
| `lib/server/ai/ollama-client.ts` | 150+ | Ollama API client |
| `lib/server/ai/multimodal-fusion.ts` | 150+ | Weighted VLM+OCR+entity fusion |
| `lib/server/neo4j-schema.ts` | 100+ | Neo4j constraints + indexes |
| `lib/server/neo4j-driver.ts` | 50+ | Neo4j driver singleton |
| `lib/server/pg-neo4j-sync.ts` | 150 | Postgres → Neo4j MERGE pipeline |
| `lib/server/vector/multi-store.ts` | 150+ | Multi-vector store coordination |
| `lib/server/vector/pgvector.ts` | 200+ | PostgreSQL pgvector operations |
| `lib/server/cache/invalidation.ts` | 150+ | Multi-tier cache invalidation |
| `lib/server/services/langextract-service.ts` | 150+ | Go SIMD text extraction (port 8095) |
| `lib/server/ingest/minio.ts` | 100+ | MinIO S3 integration |
| `lib/server/queue/queue-worker.ts` | 150+ | Queue message consumer |
| `lib/server/audit/evidence-audit.ts` | 50+ | Chain of custody audit logging |
| `lib/server/circuit-breaker.ts` | 100+ | Ollama/Qdrant/Redis circuit breakers |
| `lib/server/env.server.ts` | 100+ | Server environment variables |
| `src/hooks.server.ts` | 350+ | Request handling, CORS, CSP, auth, COOP/COEP |
| `src/mcp/server.ts` | 1400+ | FastMCP server — 29 tools (cases, evidence, RAG, citations, LangExtract, codebase, Playwright, compose) |
## Key Client Infrastructure Files
| File | Lines | Purpose |
|------|-------|---------|
| `lib/ai/client-router.ts` | 200+ | Local vs server inference routing (3-tier) |
| `lib/ai/client-cache.ts` | 300+ | LokiJS + IndexedDB dual-tier |
| `lib/ai/client-embed.ts` | 200+ | 768-dim ONNX embeddings (mean-pool + L2-norm) |
| `lib/ai/onnx/session.ts` | 150+ | WebGPU → WASM → CPU factory |
| `lib/models/ChatSession.svelte.ts` | 429 | Central chat hub |
| `lib/gpu/gpu-compute-pipeline.ts` | 709 | 3 WGSL shaders, WebGPU compute |
| `lib/gpu/gpu-search-reranker.ts` | 148 | Client-side GPU reranking |
| `lib/machines/retrieval-machine.ts` | 200+ | XState v5 2-stage retrieval orchestration |
---
## Storage Layer
### PostgreSQL (87 tables)
| Group | Tables | Key |
|-------|--------|-----|
| Auth | users, sessions | Core auth |
| Cases | cases, caseNotes, caseStatuteLinks | Case management |
| Evidence | evidence, evidenceRelationships, evidenceAuditLog, evidenceVersions | Evidence + audit trail |
| Documents | documents, legalDocuments, documentChunks | Document management |
| Legal | citations, statutes, statuteChunks, legalPrecedents, citationTags | Legal resources |
| RAG | ragSessions, ragMessages | RAG conversations |
| Embeddings | 6 vector tables (768-dim) | Vector storage |
| Analytics | analyticsEvents | Event tracking |
| Error Tracking | phase72_error, phase72_patch, reportAuditLog | Error management |
| Workspaces, Route Health | Various | Supporting |
### Qdrant Collections (768-dim)
| Collection | Purpose |
|------------|---------|
| `evidence_items` | Evidence chunks + metadata |
| `legal_documents` | Legal document embeddings |
| `legal_cases` | Case description embeddings |
| `chat_messages` | Chat context search |
| `embedding_cache` | Embedding lookup cache |
| `document_tags` | Document tag embeddings |
| `topic_clusters` | Topic clustering embeddings |
| `llm_response_cache` | LLM query response cache |
| `poi_profiles` | Person of interest face/photo embeddings |
### Redis Keys
- Session cache, L3 cache tier, GPU arbiter VRAM mutex
- Analytics sorted sets, HMM bigram transitions
- Circuit breaker state, template cache, report cache
### Neo4j Graph
- Cases, Evidence, Statutes, Entities, SIMILAR_TO edges
- PG→Neo4j sync via `pg-neo4j-sync.ts`
- Graph centrality computation
### RabbitMQ Queues (8)
`cache.invalidate`, `document.embed`, `evidence.process`, `vector.index`, `chat.context`, `analytics.track`, `codebase.index`, `ace.evaluate`
### FastMCP Tools (29 in src/mcp/server.ts)
**Cases (4):** `cases:load`, `cases:create`, `cases:update`, `cases:delete`
**Reports (6):** `reports:list`, `reports:create`, `reports:generate_from_template`, `reports:update`, `reports:delete`, `reports:export`
**RAG (2):** `rag:search`, `rag:index_page`
**Citations (3):** `citations:search`, `citations:list_by_case`, `citations:add_to_case`
**Evidence (5):** `evidence:analyze`, `evidence:analyze_multimodal`, `evidence:detect_objects`, `evidence:transcribe_gpu`, `evidence:search_similar`
**Audio (1):** `transcribe_audio`
**LangExtract (4):** `langextract:legal`, `langextract:evidence`, `langextract:file`, `langextract:custom`
**Codebase (2):** `codebase:search`, `codebase:ace_context`
**Browser (1):** `playwright:browser_action`
**Composition (1):** `compose:pipeline`
---
## Infrastructure Wiring (Documented architecture overview)
Status note: the diagrams, service states, and completion language in this section are preserved as documented architecture notes and were not live-revalidated during the March 17 audit.

### 4-Tier Embedding Fallback Chain
```
SvelteKit embedding request
  ↓
Tier 1: gRPC (embedding-client.ts → Go :50051)
  │  Protobuf, goroutine batching, Redis cache
  ↓ fail
Tier 2: QUIC/NATS (NATS → quic-nats-bridge → gRPC)
  │  0-RTT, queue-subscribed workers
  ↓ fail
Tier 3: HTTP Batch (Ollama /api/embed, pLimit(4))
  ↓ fail
Tier 4: HTTP Sequential (Ollama /api/embed, one-at-a-time)
```
### GPU Pipeline (LibTorch/CUDA N-API) — Verified 2026-04-08
```
simd-bridge/cpp/
  ├── binding.cc          ← N-API module init + TypedArray wrappers
  ├── libtorch_graph.cc   ← torch::mm similarity, k-means, weighted embedding (CUDA/CPU)
  ├── libtorch_stubs.cc   ← Stub implementations (-99) when NO_LIBTORCH=1
  └── CMakeLists.txt      ← find_package(Torch), conditional build
       ↓ builds
  build/Release/tensorrt_bridge.node
       ↓ loaded by
  lib/server/gpu/libtorch-bridge.ts (graphSimilarity, clusterEmbeddings, computeCaseEmbedding, isCudaAvailable)
       ↓ re-exported via
  lib/server/gpu/cuda-bridge.ts + gpu/background-analyzer.ts
       ↓ consumed by (21 files total — L1 static + L2 dynamic + L6 fetch)
  Static:  /api/gpu/compute, /api/health/gpu, /api/infrastructure/status
  Dynamic: hooks.server.ts (boot warmup), mcp/server.ts (gpu:similarity tool),
           workers/compute-pool.ts (K-means), /api/evidence/upload (post-upload),
           /api/evidence/[id]/gpu-analysis, /api/persons-of-interest/[id]/gpu-analyze,
           /api/persons-of-interest/[id]/photos (post-VLM)
  Fetch:   stores/analysis-panel.svelte.ts → /api/gpu/compute
```
### Evidence Upload Pipeline (9 stages)
1. MinIO upload + SHA-256 hash + PostgreSQL record
2. Text extraction: pdf-parse → OCR fallback (Tesseract CLI → tesseract.js)
3. Structure-aware chunking via legal-chunker.ts (ARTICLE/SECTION/§)
4. Embedding: gRPC → embeddinggemma → nomic-embed-text fallback
5. Dual storage: pgvector `evidence_vectors` + Qdrant `evidence_items`
6. Entity extraction (EMAIL, PHONE, DATE, CITATION, STATUTE, MONEY)
7. Forensic pattern detection (SSN, CC, contact density, legal keywords)
8. Summarization via Ollama gemma4-legal (non-fatal)
9. **GPU Background Analysis** (fire-and-forget) — similarity, clustering, case embedding via LibTorch CUDA
### Active Go Microservice Entry Points
| Service | Port | Protocol | Purpose |
|---------|------|----------|---------|
| embedding-server | :50051 | gRPC | Ollama proxy + Redis cache + batch parallelism |
| quic-nats-bridge | :4434 | QUIC/NATS | Cross-protocol bridge + embedding proxy |
| gpu_inference_server | :8095-8097 | gRPC/QUIC/HTTP3 | CUDA worker pools + tensor cache |
| analytics-service | gRPC | gRPC | PostgreSQL analytics (trends, breakdowns) |
| minio-simd-service | :8095 | HTTP | SIMD JSON parsing for MinIO metadata |
### Docker Services
| Service | Port | Status |
|---------|------|--------|
| deeds-postgres-prod | 5432 | UP |
| deeds-redis-prod | 6379 | UP |
| deeds-qdrant-prod | 6333 | UP |
| phase66-minio | 9000 | UP |
| phase66-rabbitmq | 5672 | UP |
| phase66-couchdb | 5984 | UP |
| phase66-langextract | 8095 | UP |
### GPU + Inference Stack
| Component | Status | Details |
|-----------|--------|---------|
| RTX 3060 Ti | ACTIVE | 8192 MiB VRAM, driver 580.88 |
| Ollama (native) | RUNNING | Port 11434, GPU, 4 models loaded |
| gemma4-legal | LOADED | 11.8B Q4_K_M (7.3GB) |
| embeddinggemma | LOADED | 307M BF16 (622MB, 768-dim) |
| TRT-LLM | AVAILABLE | API routes exist, engine not built |
---
## Cross-Service Communication Map
```
SvelteKit ←─ gRPC ──→ Go embedding-server ←─ HTTP ──→ Ollama
    │                       ↑
    │            ←─ NATS ──→│ (quic-nats-bridge)
    │
    ├── HTTP ──→ Ollama (direct, Tier 3/4)
    ├── HTTP ──→ Go SIMD sidecar (MinIO metadata)
    ├── N-API ──→ tensorrt_bridge.node (LibTorch CUDA)
    ├── bolt:// ──→ Neo4j (graph queries)
    ├── TCP ──→ Redis (cache + lease + sessions)
    ├── TCP ──→ PostgreSQL (primary storage)
    ├── HTTP ──→ Qdrant (vector search)
    ├── AMQP ──→ RabbitMQ (async jobs)
    └── HTTP ──→ CouchDB (tag catalog)
```
---
## 10-Layer Import Audit Protocol (Gemini Audit — April 7, 2026)

### Layer Coverage
| Layer | Pattern | Risk | Files | Detection |
|-------|---------|------|-------|-----------|
| L1 | Static ESM (`from '...'`) | Baseline | All | `rg "from.*MODULE" src/` |
| L2 | Dynamic ESM (`await import()`) | HIGH | 115 files | `rg "import\(.*MODULE" src/` |
| L3 | CJS require | LOW | ~5 files | `rg "require\(.*MODULE" src/` |
| L4 | Variable dynamic (`@vite-ignore`) | CRITICAL | 4 files | `rg "@vite-ignore" src/` |
| L5 | SvelteKit auto-discovery | LOW | 692 route files | Don't flag route files as orphans |
| L6 | Config/safelist refs | LOW | ~10 files | Check `unocss.config.ts`, `vite.config.ts` |
| L7 | `{@html}` string refs | LOW | ~20 files | `rg "{@html" src/` |
| L8 | Barrel re-exports | MODERATE | 24 index.ts | Check if barrel ITSELF is imported |
| L9 | Event coupling | HIGH | 88 files (192 events) | `rg "CustomEvent\|addEventListener" src/` |
| L10 | Store subscriptions | LOW | 37 .svelte.ts files | `rg "from.*MODULE" src/ --glob "*.svelte.ts"` |

### L4 — Variable Dynamic Imports (Invisible to Grep)
| File | Pattern |
|------|---------|
| `lib/server/db/drizzle.ts` | `const cachePath = '...'; await import(cachePath)` |
| `lib/server/analysis/granite-docling.ts` | PDF rendering variable import |
| `lib/server/json/fastjson.ts` | JSON parser variable import |
| `lib/components/yorha/_simulations/CanvasBoard.svelte` | Simulation engine variable import |

### L8 — Barrel Re-Exports (24 index.ts files)
- `shells/index.ts` re-exports 3 components but barrel itself has **0 consumers** — entire chain dead
- Rule: Always check if the barrel itself is imported, not just its contents

### L9 — Event Coupling (88 files, 192+ event types)
- `AnalysisPanel.svelte` has 0 static imports but triggered via `yorha:open-analysis` from root layout
- 27 files use `window.addEventListener` for global event channels
- `yorha:` event namespace is the primary coupling mechanism

### Dynamic Import Hotspots
| File | Dynamic Imports | Why |
|------|----------------|-----|
| `(app)/+layout.svelte` | ~5 | AnalysisPanel, KeyboardShortcuts, lazy UI |
| `mcp/server.ts` | 12 | All tool handlers lazy-loaded |
| `hooks.server.ts` | 3 | Boot tasks (GPU warmup, queue consumers) |
| API routes (`src/routes/api/`) | 80+ | Service imports on first request |
| **Total files using `await import()`** | **115** | |

### API Route Consumer Analysis (414 +server.ts, 58,531 LOC)
| Metric | Count |
|--------|-------|
| Total `+server.ts` files | 414 |
| Total lines of API code | 58,531 |
| `.svelte` files with `fetch('/api/...')` | 193 |
| Total `/api/` references (fetch + import) | 4,865 |
| `.svelte.ts` store files | 37 |

### Internal API-to-API Calls (8 server→server fetch chains)
| Source Route | Target Route | Method |
|-------------|-------------|--------|
| `cases/[id]/similar` | `/api/graph/sync` | POST |
| `error-brain/diagnose` | `/api/codebase-index/graph` | GET |
| `evidence/analyze` | `/api/evidence/analysis` | GET+POST |
| `gpu-wasm-integration` | `/api/gpu/queue` | GET |
| `knowledge/search` | `/api/glossary/search` | POST |
| `knowledge/search` | `/api/statutes/search` | POST |
| `knowledge/search` | `/api/precedents/search` | POST |

### Component Wiring Stats (April 8, 2026)
| Metric | Count |
|--------|-------|
| Wired components (orphan-detector v2) | 537 |
| Remaining orphans | 8 |
| Edge cases | 0 |
| Demo route pages | 50+ |

---
## Client ↔ Server RAG Architecture
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
  │   └── Falls back to server if local answer < confidence
  │
  └── COMPLEX (score > 0.6): gemma4-legal server — full pipeline
      ├── RAG+KAG+DAG (dual search, graph-hop, doc context)
      ├── Entity extraction + forensic detection
      ├── Citation-grounded answers
      └── SSE streaming to client
```
### Cache Hierarchy
```
L0: LokiJS (in-memory, 5-10min TTL, session-scoped)
  ↓ miss
L1: IndexedDB (persistent, 7-day TTL, survives refresh)
  ↓ miss
L2: Memory Cache (server, 5min TTL, in-process Map)
  ↓ miss
L3: Redis (server, configurable TTL, cross-request)
  ↓ miss
L4: Service Logic (DB query, Qdrant search, Ollama inference)
  ↓
Write back to L0-L3
```
---
## Kiro Spec Features (Historical project-status snapshot)
Status note: percentages below are carried forward from earlier project tracking and were not mechanically reverified during the March 17 audit.

| # | Feature | Historical Status |
|---|---------|--------|
| 1 | Multi-Source Retrieval | **100%** — RAG, KAG, DAG, Wikipedia, Google+DDG, ACE 8-source, 2-stage retrieval |
| 2 | YoRHa Detective Screens | **100%** — Terminal (25KB, voice), Board (37KB, Kanban), Command Center |
| 3 | VLM Legal Vision | **100%** — YOLO, Gemma3 VLM, LangExtract OCR, multimodal fusion, poi_profiles |
| 4 | Self-Healing Error Agent | **100%** — Error Brain, generate→apply→verify→rollback, Auto-Fix UI |
| 5 | Unified Reasoning Engine | **0% DEFERRED** — Ollama covers same ground |
| 6 | ACE Web Ingestion | **100%** — /api/ace/ingest + SSE streaming + Neo4j sync |
| 7 | Citation Intelligence | **100%** — Collections, tags, export, PageRank + Redis |
| 8 | Agentic Alignment Router | **100%** — 3-tier routing, 8 intents, health-aware fallback |
| 9 | Knowledge Search Engine | **100%** — IDF hybrid, HMM bigram, query expansion, 5-tab UI |
| 10 | Case Notes Enhancements | **100%** — Versioning, FTS, diff, case packet export |
| 11 | Person of Interest | **100%** — Schema, 7 APIs, VLM photos, face-match, multimodal fusion |
| 12 | Error Brain DB Wiring | **100%** — phase72_error, status API, runs API |
| 13 | Infrastructure & Docker | **95%** — 7 Docker services UP, stubs ready, start all = ops task |
| 14 | Svelte 5 Migration | **100%** — Complete |
| 15 | Evidence Pipeline Scaling | **100%** — pLimit(3), batch embed, summary, auto-tag, GPU analysis |
| 16 | Report Caching | **100%** — Redis templates, warmup, export cache |
| 17 | Cache Infrastructure | **100%** — Multi-tier invalidation, dashboard, Qdrant health |
---
## next_steps/ Inventory (17 files)
| File | Notes |
|------|-------|
| 00-OVERVIEW.md | Overview index for the current next_steps set |
| 01-reports-next-steps.md | Reports planning notes |
| 02-mcp-integration.md | MCP integration planning notes |
| 03-evidence-improvements.md | Evidence improvement notes |
| 04-ai-integration.md | AI integration notes |
| 05-infrastructure.md | Infrastructure notes |
| 06-database-migrations.md | Database migration notes |
| 07-ml-training.md | ML training notes |
| 08-detective-mode-integration.md | Detective mode integration notes |
| 09-agent-investigate-endpoint.md | Agent-investigate endpoint notes |
| 10-trtllm-triton-deployment.md | TRT-LLM / Triton deployment notes |
| 11-wiring-production-quality.md | Production wiring notes |
| 12-app-wiring-consolidation.md | App wiring consolidation notes |
| DRIZZLE_SCHEMA_MATCHING.md | Drizzle schema matching reference |
| SESSION_93r28c_COMPLETE.md | Session completion log |
| TODO_TRTLLM_TRITON.md | TRT-LLM / Triton todo list |
| ZOD_SUPERFORMS_BENEFITS.md | Zod and Superforms reference notes |
---
## Sprint Pipeline Snapshot (March 10, 2026 historical notes)
### Reported Completed Work
- Evidence audit logging (evidenceAuditLog + evidenceVersions tables)
- GPU analysis API endpoint (GET/POST /api/evidence/[id]/gpu-analysis)
- Evidence audit trail API (GET /api/evidence/[id]/audit)
- Background analyzer audit wiring
- Evidence upload audit wiring
- SQL migration created (drizzle/manual/20260311_audit_and_versions.sql)
### Historical Active Plan (silly-squishing-barto.md)
| Sprint | Focus | Historical Status |
|--------|-------|--------|
| Sprint 1 | Critical Fixes (shutdown, VAPID, CORS, timeouts, IORedis shim) | DONE |
| Sprint 2 | Embedding Consolidation (facade, cache-first, dedup) | DONE |
| Sprint 3 | Infrastructure Hardening (circuit breakers, health) | PARTIAL (circuit breaker done) |
| Sprint 4 | Production Readiness (CSP, body limit, SSE fix) | PENDING |
| Sprint 5 | Evidence Board Interactive Wiring (connections, timeline, undo/redo, zoom) | IN PROGRESS |
| Sprint 6 | NES Card Grid UI (all-routes blue theme, dashboard nav, demos/nes-routes) | DONE |
---
## Recent Changes
### March 17, 2026
| Change | Files |
|--------|-------|
| **Citation Search Compatibility Fix**: Normalized both citation search endpoints to use the saved-citation schema and return the response shapes expected by CitationSearch and WysiwygEditor callers | `src/routes/api/citations/search/+server.ts`, `src/routes/api/search/citations/+server.ts` |
| **Targeted Error Revalidation**: Rechecked the reported Tiptap, case canvas, and case reports problem spots and confirmed no active diagnostics remained in the targeted files after the endpoint fix | `src/lib/components/editor/TiptapWithAIAssistant.svelte`, `src/routes/(app)/cases/[id]/canvas/+page.svelte`, `src/routes/(app)/cases/[id]/reports/+page.svelte` |
---
### March 11, 2026
| Change | Files |
|--------|-------|
| **NES Card Grid UI**: Admin all-routes converted from green terminal list to blue NES card-grid with SVG pixel art icons | `admin/all-routes/+page.svelte` |
| **NES Route Navigator**: Dashboard gets compact NES route nav widget (12 key routes, blue theme) | `dashboard/+page.svelte` |
| **NES Routes Demo**: Full demo page at `/demos/nes-routes/` with sidebar, filters, card grid, RouteInspectorModal | `demos/nes-routes/+page.svelte`, `+page.server.ts` |
| **Evidence Board Wiring**: Connections CRUD API, enriched case timeline API, HybridBoard enhancements | `api/cases/[id]/connections/`, `api/cases/[id]/timeline/`, `HybridBoard.svelte`, board page |
| **PHASE*.md Audit**: 150+ files audited — 86 complete (57%), 45 in-progress (30%), 19 reference (13%) | Root PHASE*.md files |
---
## Cleanup Opportunities
### Root Project (38 loose files — was 2,231, bulk archived)
- Config files (.env, docker-compose, tsconfig, etc.) — all needed
- Only `onnx/` remains as a potential cleanup target (model files may be redundant with static/ort/)
### Empty/Stale Root Dirs
- 5 of 6 stale dirs already deleted (tensorrt_py310_env, hmm-topic-service, ocr_pipeline, ollama_models, deeds-web-app)
- Only `onnx/` remains — contains gemma3_270m/ and model.onnx/
### SvelteKit src/lib/ (22 top-level dirs, 236 nested subdirs)
- Many single-file directories could be consolidated
- `lib/services/` — 35 clean files, 0 errors (was 312 corrupted, cleaned Apr 7, 2026)
- `lib/types/` — ~65 of 83 files likely dead (only 9 actively imported)
- `lib/__tests__/`, `lib/error-brain/` — excluded from tsconfig
---
## Critical Warnings
- **tsconfig**: `src/lib/services/**` un-excluded — 35 files, 0 errors (cleaned Apr 7, 2026)
- **Phase 99**: Commit `0a2bd98929` corrupted 83 files — DO NOT rerun
- **DB migrations**: Always `drizzle-kit migrate`, review SQL for DROPs
- **SSR routes**: evidence, citations, evidence-library have `ssr = false` (client-heavy)
- **bits-ui Dialog**: TDZ bug in Svelte 5.46.0 SSR — routes with Dialog need `ssr = false`
- **VAPID keys**: Currently empty defaults — push notifications skip when empty
- **GPU VRAM**: RTX 3060 Ti 8GB — Ollama + TRT-LLM cannot coexist (gpu-arbiter.ts mutex)
