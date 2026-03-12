# Deeds Web App — Codebase Map
## Last Updated: March 11, 2026 (NES Card Grid UI + PHASE Audit + Evidence Board)
---
## Grand Totals
| Metric | Count |
|--------|-------|
| **Root project directories** | 32 |
| **Root project loose files** | 2,231 (session logs, patches — cleanup candidate) |
| **SvelteKit src/ files** | 2,445 |
| **SvelteKit src/ directories** | 823 |
| **Svelte components (.svelte)** | 744 |
| **TypeScript files (.ts)** | 1,370 |
| **Server files (lib/server/*.ts)** | 420 |
| **Component files (lib/components/*.svelte)** | 544 |
| **App route groups** | 17 |
| **Page routes (+page.svelte)** | 109 |
| **API endpoints (+server.ts)** | 254 |
| **API route groups** | 77 |
| **Server subdirectories (lib/server/)** | 79 |
| **deeds_labs/ files** | ~193,000 (intentional archive) |
| **svelte-check** | **0 errors, 0 warnings** |
| **Playwright** | **20/20 PASS** |
---
## Root Project Directory (32 directories)
### ESSENTIAL (Active Code)
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
| `next_steps/` | 18 planning docs (10 CURRENT, 8 DONE) | REFERENCE |
### INFRASTRUCTURE (Running Services)
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
| `deeds_labs/` | Central archive — ~193K files (svelte4, corrupted, dead code, old services) | KEEP IN PLACE |
| `tensorrt_py310_env/` | TensorRT Python venv | DELETE — recreatable |
| `hmm-topic-service/` | Empty HMM stub | DELETE |
| `ocr_pipeline/` | Empty OCR stub (replaced by tesseract.js) | DELETE |
| `ollama_models/` | Empty (models in Ollama server) | DELETE |
| `onnx/` | Empty (ONNX in sveltekit-frontend/static/) | DELETE |
| `deeds-web-app/` | Nested copy of project | VERIFY — likely accidental |
---
## SvelteKit Frontend (src/ — 2,445 files, 823 dirs)
### Directory Structure
```
sveltekit-frontend/
├── src/
│   ├── lib/           ← 90+ subdirs (components, server, ai, stores, types, utils...)
│   ├── routes/        ← (app)/ pages + api/ endpoints
│   ├── mcp/           ← FastMCP server (11 agentic tools, stdio)
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
``
### Top-Level Dirs (11 — post-cleanup)
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
## App Routes — src/routes/(app)/ (17 groups, 109 pages)
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
## API Routes — src/routes/api/ (77 groups, 254 endpoints)
### Core API Groups
| API Group | Endpoints | Purpose |
|-----------|-----------|---------|
| `ai/` | 17 | AI chat, analysis, predictions, scoring, personas, TensorRT, VLM |
| `cases/` | 14 | Case CRUD + notes + citations + chat + export + similar |
| `health/` | 13 | Health checks (DB, Redis, Qdrant, Neo4j, Ollama, GPU, OCR, circuit breakers) |
| `phase89/` | 20 | Legacy phase 89 migration endpoints |
| `routes/` | 9 | Route health SSE + error brain analyses |
| `codebase-index/` | 8 | Codebase search + indexing + clusters |
| `evidence/` | 8 | Upload, search, analysis, realtime, audit, GPU analysis, chain of custody |
| `auth/` | 8 | Authentication (login, register, session, debug, health) |
| `reports/` | 7 | Report generation, export, publish, preview, save |
| `citations/` | 8 | Citations CRUD, collections, tags, export (JSON/PDF) |
| `cache/` | 8 | Cache operations, invalidation, metrics, stats, LLM cache |
| `error-brain/` | 6 | Generate-fix, apply-fix, verify-fix, auto-patch, search, history |
| `persons-of-interest/` | 7 | POI CRUD, associates, photos, face-match, risk, similar |
| `admin/` | 6 | Admin operations, agent fix, knowledge seed |
| `system/` | 6 | System env, health, phase13/78 patches |
| `knowledge/` | 5 | Knowledge base queries, search, stats, stream |
| `analytics/` | 3 | Events, patterns, summary |
| `rag/` | 4 | Search, validate, answer, enhanced |
| `graph/` | 4 | Neo4j connections, relationships, sync, timeline |
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
| 20+ more | 1 each | Various single endpoints |
---
## Server Architecture — src/lib/server/ (79 subdirectories, 420 .ts files)
### Core Infrastructure
| Directory | Key Files | Purpose |
|-----------|-----------|---------|
| `db/` | `client.ts`, `schema-postgres.ts` (2500+ lines) | Drizzle ORM — 70+ tables, 14 enums |
| `vector/` | `qdrant-manager.ts`, `multi-store.ts`, `pgvector.ts` | Qdrant (8 collections) + pgvector |
| `queue/` | `rabbitmq-manager-fixed.ts`, `queue-worker.ts` | RabbitMQ — 7 queues, 7 consumers |
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
## Client Architecture — src/lib/ (90+ subdirectories)
### Core Client Modules
| Directory | Key Files | Purpose |
|-----------|-----------|---------|
| `ai/` | `client-router.ts`, `client-cache.ts`, `client-embed.ts`, `onnx/session.ts` | Local inference (ONNX WebGPU), 3-tier routing, dual-tier cache |
| `gpu/` | `gpu-compute-pipeline.ts` (709L), `gpu-search-reranker.ts` | 3 WGSL shaders, WebGPU compute, search reranking |
| `models/` | `ChatSession.svelte.ts` (429L) | Central chat hub (local↔server routing) |
| `machines/` | `retrieval-machine.ts` | XState v5 2-stage retrieval orchestration |
| `components/` | 544 .svelte files across 38 subdirs | All UI components |
| `stores/` | `.svelte.ts` stores | Svelte 5 rune-based shared state |
| `types/` | TypeScript definitions | Type system |
| `utils/` | `ollama.ts`, `xstate-svelte5.ts`, etc. | Utility functions (12 active, 100% wired) |
| `shims/` | Browser compatibility | **MUST preserve** |
| `services/` | 15 active of 312+ total | **blanket-excluded** (312 corrupted) |
### Component Subdirectories (38)
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
| `lib/server/db/schema-postgres.ts` | 2500+ | 70+ tables, 14 enums, evidenceAuditLog, evidenceVersions |
| `lib/server/db/client.ts` | ~50 | Primary Drizzle ORM client (canonical import) |
| `lib/server/vector/qdrant-manager.ts` | 400+ | 8 Qdrant collections, hybrid search |
| `lib/server/queue/rabbitmq-manager-fixed.ts` | 350+ | 7 queues, 7 consumers |
| `lib/server/cache.ts` | 200+ | Dual-tier memory + Redis cache |
| `lib/server/redis.ts` | 100+ | ioredis singleton |
| `lib/server/grpc/embedding-client.ts` | 200+ | gRPC → HTTP fallback embeddings (4-tier) |
| `lib/server/grpc/retrieval-client.ts` | 150+ | gRPC retrieval client |
| `lib/server/rag-pipeline.ts` | 300+ | End-to-end RAG pipeline |
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
| `src/mcp/server.ts` | 400+ | FastMCP server — 11 agentic tools (stdio) |
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
### PostgreSQL (70+ tables)
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
| `codebase_chunks_768` | Dual-vector code search |
| `chat_messages` | Chat context search |
| `embedding_cache` | Embedding lookup cache |
| `document_tags` | Document tag embeddings |
| `poi_profiles` | Person of interest face/photo embeddings |
### Redis Keys
- Session cache, L3 cache tier, GPU arbiter VRAM mutex
- Analytics sorted sets, HMM bigram transitions
- Circuit breaker state, template cache, report cache
### Neo4j Graph
- Cases, Evidence, Statutes, Entities, SIMILAR_TO edges
- PG→Neo4j sync via `pg-neo4j-sync.ts`
- Graph centrality computation
### RabbitMQ Queues (7)
`cache.invalidate`, `document.embed`, `evidence.process`, `vector.index`, `chat.context`, `analytics.track`, `codebase.index`
### FastMCP Tools (11)
`unified_ast_query`, `cross_language_similarity`, `cuda_fix_priority`, `glyph_metadata`, `neo4j_dependency_graph`, `agentic_recommendation`, `batch_error_analysis`, `redis_cache_stats`, `system_health_check`, `transcribe_audio`, `web_search`
---
## Infrastructure Wiring (7 Phases — All Complete)
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
### GPU Pipeline (LibTorch/CUDA N-API)
```
simd-bridge/cpp/
  ├── binding.cc          ← N-API module init + TypedArray wrappers
  ├── libtorch_graph.cc   ← torch::mm similarity, k-means, weighted embedding (CUDA/CPU)
  ├── libtorch_stubs.cc   ← Stub implementations (-99) when NO_LIBTORCH=1
  └── CMakeLists.txt      ← find_package(Torch), conditional build
       ↓ builds
  build/Release/tensorrt_bridge.node
       ↓ loaded by
  lib/server/gpu/libtorch-bridge.ts (graphSimilarity, clusterEmbeddings, computeCaseEmbedding)
       ↓ re-exported via
  lib/server/gpu/cuda-bridge.ts
       ↓ called by
  /api/gpu/compute + background-analyzer.ts (post-upload)
```
### Evidence Upload Pipeline (9 stages)
1. MinIO upload + SHA-256 hash + PostgreSQL record
2. Text extraction: pdf-parse → OCR fallback (Tesseract CLI → tesseract.js)
3. Structure-aware chunking via legal-chunker.ts (ARTICLE/SECTION/§)
4. Embedding: gRPC → embeddinggemma → nomic-embed-text fallback
5. Dual storage: pgvector `evidence_vectors` + Qdrant `evidence_items`
6. Entity extraction (EMAIL, PHONE, DATE, CITATION, STATUTE, MONEY)
7. Forensic pattern detection (SSN, CC, contact density, legal keywords)
8. Summarization via Ollama gemma3-legal (non-fatal)
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
| gemma3-legal | LOADED | 11.8B Q4_K_M (7.3GB) |
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
  └── COMPLEX (score > 0.6): gemma3-legal server — full pipeline
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
## Kiro Spec Features — 16/17 at 100%
| # | Feature | Status |
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
## next_steps/ Status (18 files)
| File | Status | Summary |
|------|--------|---------|
| ACTIVE_DEMOS_LIST.md | DONE | 12 route demos verified |
| ARCHIVE_GEMS_REVIEW.md | DONE | Archive review complete |
| CITATION_COLLECTIONS_NEXT_STEPS.md | CURRENT | UI rewiring + superforms |
| COMPREHENSIVE_ARCHIVE_REVIEW.md | DONE | 5-task deep audit complete |
| OPTIMIZATION_COMPARISON.md | DONE | Performance benchmarks documented |
| P3_P4_COMPLETION_PLAN.md | CURRENT | UX polish (search, skeletons, keyboard nav) |
| P4_ROUTES_PARKED_REVIEW.md | DONE | 588→0 corrupted files archived |
| PRODUCTION_DEPLOYMENT.md | CURRENT | Pointer compression, monitoring setup |
| PRODUCTION_OPTIMIZATIONS_COMPLETE.md | DONE | 9 optimizations verified |
| PRODUCTION_READINESS_ROADMAP.md | CURRENT | 5 critical items: env vars, DB, SSL, health, security |
| QUICK_START_PRODUCTION.md | DONE | 3 deployment options ready |
| TENSORRT_VLM_PIPELINE.md | CURRENT | TRT INT4 engine + Triton ensemble |
| TRT_DIRECTORY_CONSOLIDATION.md | DONE | 102 archived, 17 kept |
| TRT_ENGINE_BUILD_STEPS.md | CURRENT | Colab→docker→Triton steps |
| VLM_POI_PHOTOS_WIRING.md | CURRENT | VLM auto-analysis, face embeddings |
| WEBGPU_DEMO_IMPLEMENTATION.md | DONE | Memory palace 3D implementation |
| WEBGPU_MEMORY_PALACE_ANALYSIS.md | CURRENT | WebGL→WebGPU upgrade paths |
| README.md | CURRENT | Index of all docs |
---
## Sprint Pipeline Status (March 10, 2026)
### Completed This Session
- Evidence audit logging (evidenceAuditLog + evidenceVersions tables)
- GPU analysis API endpoint (GET/POST /api/evidence/[id]/gpu-analysis)
- Evidence audit trail API (GET /api/evidence/[id]/audit)
- Background analyzer audit wiring
- Evidence upload audit wiring
- SQL migration created (drizzle/manual/20260311_audit_and_versions.sql)
### Active Plan (silly-squishing-barto.md)
| Sprint | Focus | Status |
|--------|-------|--------|
| Sprint 1 | Critical Fixes (shutdown, VAPID, CORS, timeouts, IORedis shim) | DONE |
| Sprint 2 | Embedding Consolidation (facade, cache-first, dedup) | DONE |
| Sprint 3 | Infrastructure Hardening (circuit breakers, health) | PARTIAL (circuit breaker done) |
| Sprint 4 | Production Readiness (CSP, body limit, SSE fix) | PENDING |
| Sprint 5 | Evidence Board Interactive Wiring (connections, timeline, undo/redo, zoom) | IN PROGRESS |
| Sprint 6 | NES Card Grid UI (all-routes blue theme, dashboard nav, demos/nes-routes) | DONE |
---
## Recent Changes (March 11, 2026)
| Change | Files |
|--------|-------|
| **NES Card Grid UI**: Admin all-routes converted from green terminal list to blue NES card-grid with SVG pixel art icons | `admin/all-routes/+page.svelte` |
| **NES Route Navigator**: Dashboard gets compact NES route nav widget (12 key routes, blue theme) | `dashboard/+page.svelte` |
| **NES Routes Demo**: Full demo page at `/demos/nes-routes/` with sidebar, filters, card grid, RouteInspectorModal | `demos/nes-routes/+page.svelte`, `+page.server.ts` |
| **Evidence Board Wiring**: Connections CRUD API, enriched case timeline API, HybridBoard enhancements | `api/cases/[id]/connections/`, `api/cases/[id]/timeline/`, `HybridBoard.svelte`, board page |
| **PHASE*.md Audit**: 150+ files audited — 86 complete (57%), 45 in-progress (30%), 19 reference (13%) | Root PHASE*.md files |
---
## Cleanup Opportunities
### Root Project (2,231 loose files)
- ~500 session log `.txt` files (1_1_25 through 3_10_26 naming pattern)
- ~50 `.patch` files
- ~100 misc artifacts (`.exe`, old configs, stale reports)
- Recommendation: Archive to `deeds_labs/session-logs/`
### Empty/Stale Root Dirs (5)
- `hmm-topic-service/`, `ocr_pipeline/`, `ollama_models/`, `onnx/`, `deeds-web-app/`
- Safe to delete (empty or duplicated)
### SvelteKit src/lib/ (90+ subdirs)
- Many single-file directories could be consolidated
- `lib/services/` — 312 corrupted files blanket-excluded; 15 active files wired
- `lib/types/` — ~65 of 83 files likely dead (only 9 actively imported)
- `lib/__tests__/`, `lib/error-brain/` — excluded from tsconfig
---
## Critical Warnings
- **tsconfig**: `src/lib/services/**` blanket-excluded (312 corrupted)
- **Phase 99**: Commit `0a2bd98929` corrupted 83 files — DO NOT rerun
- **DB migrations**: Always `drizzle-kit migrate`, review SQL for DROPs
- **SSR routes**: evidence, citations, evidence-library have `ssr = false` (client-heavy)
- **bits-ui Dialog**: TDZ bug in Svelte 5.46.0 SSR — routes with Dialog need `ssr = false`
- **VAPID keys**: Currently empty defaults — push notifications skip when empty
- **GPU VRAM**: RTX 3060 Ti 8GB — Ollama + TRT-LLM cannot coexist (gpu-arbiter.ts mutex)
