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

## Root Project Directory — Full Audit (145 directories, March 8 2026)

### ESSENTIAL (Keep — Core Project)

| Directory | Files | Purpose | Status |
|-----------|-------|---------|--------|
| `sveltekit-frontend/` | ~45,000 | Main SvelteKit 2 + Svelte 5 application | ACTIVE |
| `scripts/` | ~5,127 | Test scripts (test-screenshots.mjs), batch-fix, build automation | ACTIVE |
| `drizzle/` | ~18 | Drizzle ORM SQL migrations | ACTIVE |
| `docker/` + `docker-scripts/` | ~13 | Docker build files + utility scripts | ACTIVE |
| `config/` | ~1 | Configuration files | ACTIVE |
| `sql/` | ~10 | Raw SQL schemas + queries | ACTIVE |
| `migrations/` | ~5 | Manual SQL migration history | ACTIVE |
| `native/` | ~3 | Autoencoder bridge stub (Dockerfile + server.py) | ACTIVE — new |
| `python-workers/` | ~2 | FastAPI embedding worker stub | ACTIVE — new |

### INFRASTRUCTURE (Keep — Running Services)

| Directory | Files | Purpose | Status |
|-----------|-------|---------|--------|
| `neo4j-community-5.23.0/` + `-windows/` | ~30 | Neo4j graph database binaries | ACTIVE |
| `qdrant/` + `qdrant-windows/` | ~175 | Qdrant vector DB binaries + data | ACTIVE |
| `redis/` | ~1 | Redis config | ACTIVE |
| `minio/` + `minio-data/` | ~70 | MinIO S3 object storage + data | ACTIVE |
| `pgvector-install/` + `pgvector-precompiled/` | ~92 | pgvector PostgreSQL extension | ACTIVE |
| `proto/` + `protos/` + `proto-backup/` + `protoc-install/` | ~110 | Protocol Buffer definitions + compiler | LEGACY — keep |
| `nginx/` | ~2 | Reverse proxy config | AVAILABLE |
| `ssl/` | ~1 | SSL certificates placeholder | AVAILABLE |
| `searxng-config/` | ~1 | Searxng search engine config | VERIFY if running |

### DATA (Keep — Content + Models)

| Directory | Files | Purpose | Status |
|-----------|-------|---------|--------|
| `gemma3Q4_K_M/` | varies | Gemma3 quantized model weights | ACTIVE — Ollama uses |
| `granite-docling-258M/` | ~53 | IBM Granite DocLing model for legal OCR | AVAILABLE |
| `granite-docling-worker/` | ~97 | DocLing worker service | AVAILABLE |
| `lawpdfs/` | ~37 | Sample legal PDF documents | DATA |
| `documents/` | ~650 | Reference markdown docs (architecture, guides) | DATA |
| `docs/` | ~322 | Project documentation | KEEP |
| `logs/` | ~1,201 | Build logs, codemod memories, breakthrough notes | KEEP |
| `training-datasets/` + `datasets/` | ~8 | ML training data samples | DATA |
| `sample-data/` + `data/` | ~10 | Sample/test data | DATA |
| `reports/` | ~12 | Generated report files | DATA |
| `ace_runs/` | ~4 | ACE (Agentic Chat Engine) run logs | KEEP |
| `storage/` | ~171 | Vector backups, file storage | KEEP |
| `vector-backup-*` | ~10 | Timestamped Qdrant backup (July 2025) | KEEP for recovery |

### ARCHIVE (Move to deeds_labs/ — Dead Projects)

| Directory | Files | Purpose | Status |
|-----------|-------|---------|--------|
| `deeds_labs/` | 13,227 | **Central archive** — svelte4, corrupted demos, old dead files | KEEP IN PLACE |
| `_archive/` | 352 | Old model backups (models-archived-s37/) | MOVE → deeds_labs/ |
| `archives/` | 474 | Misc old code archives | MOVE → deeds_labs/ |
| `archive/` | 2 | Small archive dir | MERGE → deeds_labs/ |
| `go-microservice/` | 26,570 | Complete abandoned Go gRPC service (12,396 .go files) | MOVE → deeds_labs/ |
| `go-trt-service/` | ~4 | Go TensorRT service stub | MOVE → deeds_labs/ |
| `langextract-go/` | 171 | Go text extraction service | MOVE → deeds_labs/ |
| `ingestion-phase66/` | ~5,271 | GPU-based document ingestion pipeline | MOVE → deeds_labs/ |
| `ai-server/` | ~14 | Old standalone AI server | MOVE → deeds_labs/ |
| `ai-summary-service/` | ~34 | Old AI summary service | MOVE → deeds_labs/ |
| `embedding-service/` | ~7 | Old embedding service (replaced by Ollama) | MOVE → deeds_labs/ |
| `reranker-service/` | ~3 | Old reranker (replaced by GPU pipeline) | MOVE → deeds_labs/ |
| `ingestion-service/` | ~2 | Legacy ingestion service | MOVE → deeds_labs/ |
| `svelte_ui/` | ~6 | Old Svelte UI component library (pre-Svelte 5) | MOVE → deeds_labs/ |
| `unocss-main/` | ~528 | UnoCSS source copy (available via node_modules) | MOVE → deeds_labs/ |
| `context7/` + `context7-docs/` | ~47 | Old context generation artifacts | MOVE → deeds_labs/ |
| `legal-ai-cuda/` | varies | CUDA kernels (replaced by WebGPU) | MOVE → deeds_labs/ |
| `legal-ai-enhanced/` + `legal-ai-production/` + `legal-ai-ubuntu/` + `legal-ai-ubuntu-deployment/` | ~15 | Legacy legal-ai deployment stubs | MOVE → deeds_labs/ |
| `gpu-inference-worker/` | ~5 | Old GPU inference worker | MOVE → deeds_labs/ |
| `document-chunker/` | ~3 | Standalone old document chunker | MOVE → deeds_labs/ |
| `engine-builder/` | ~3 | TensorRT engine builder | MOVE → deeds_labs/ |
| `error-analysis/` | ~3 | Old error analysis scripts | MOVE → deeds_labs/ |
| `next_steps/` | ~15 | Old planning documents | MOVE → deeds_labs/ |
| `codemod-plans/` | ~1 | Old codemod planning docs | MOVE → deeds_labs/ |
| `commas-previews/` | ~20 | Old UI preview screenshots | MOVE → deeds_labs/ |
| `jstests/` | ~4 | Old JavaScript tests | MOVE → deeds_labs/ |
| `legal_ai_output/` | ~4 | Old model outputs | MOVE → deeds_labs/ |
| `old-scripts/` | ~2 | Deprecated scripts | MOVE → deeds_labs/ |
| `sveltekit-evidence/` | varies | Old evidence service | MOVE → deeds_labs/ |

### PYTHON VENVS (Delete — Recreatable)

| Directory | Files | Purpose | Status |
|-----------|-------|---------|--------|
| `.venv/` | 77,779 | Active Python virtual environment | KEEP if used |
| `.venv-phase46/` | 81,103 | Archived Phase 46 Python venv | **DELETE** — recreatable |
| `phase46-venv/` | 41,964 | Duplicate Phase 46 Python venv | **DELETE** — recreatable |
| `.venv-verify/` | 2,236 | Small verification venv | **DELETE** — recreatable |
| `.python311/` | 4,362 | Python 3.11 installation | KEEP if needed |
| `tensorrt_py310_env/` | 2,994 | TensorRT Python environment | **DELETE** — recreatable |
| `libtorch-win-shared-with-deps-2.9.0+cu130/` | 9,377 | PyTorch C++ runtime (not used) | **DELETE** — downloadable |

### DELETE (Safe — No Value)

| Directory | Files | Purpose | Status |
|-----------|-------|---------|--------|
| `__pycache__/` | ~6 | Python bytecode (auto-regenerates) | DELETE |
| `build/` | ~406 | Build artifacts (auto-generated) | DELETE |
| `dist/` | ~5 | Distribution output (auto-generated) | DELETE |
| `cache/` | ~2 | Runtime cache files | DELETE |
| `tmp/` + `tmux/` | ~10 | Temporary runtime files | DELETE |
| `checkpoints/` | 0 | Empty directory | DELETE |
| `tensor_services/` | ~2 | Empty stub | DELETE |
| `gpu-orchestrator/` | 0 | Empty directory | DELETE |
| `hmm-topic-service/` | ~1 | Empty HMM stub | DELETE |
| `microservices/` | ~1 | Empty stub | DELETE |
| `temp-services/` | ~11 | Outdated service stubs | DELETE |
| `test-services/` | ~1 | Empty test service | DELETE |
| `metrics/` | 0 | Empty directory | DELETE |
| `model_unsloth_hf_f16/` | 0 | Empty model directory | DELETE |
| `ollama_models/` | 0 | Empty (models in Ollama server) | DELETE |
| `onnx/` | ~1 | Empty directory (ONNX in sveltekit-frontend/static/) | DELETE |
| `trt_engines/` + `trt_models/` | 0 | Empty TensorRT directories | DELETE |
| `orchestrator/` | ~1 | Empty stub | DELETE |
| `perf/` + `PERFORMANCE_FIXES_DOCUMENTATION/` | ~2 | Empty performance dirs | DELETE |
| `playwright-report/` | ~1 | Old test report | DELETE |
| `q4km_test_results/` | ~2 | Old test results | DELETE |
| `weekly-cleanup/` | ~2 | Old cleanup logs | DELETE |
| `windows-service/` | ~6 | Old Windows service wrapper | DELETE |
| `todolist_2025-08-04T05-23-51/` | ~2 | Abandoned todo export | DELETE |
| `node-cluster/` | ~1 | Empty Node.js cluster stub | DELETE |
| `ocr_pipeline/` | ~1 | Empty OCR stub (replaced by tesseract.js) | DELETE |
| `workers/` | ~2 | Empty worker stubs | DELETE |
| `svelte-check-errors-index/` | varies | Old error index dump | DELETE |

### UNCLEAR (Verify Before Action)

| Directory | Files | Purpose | Status |
|-----------|-------|---------|--------|
| `src/` | ~410 | Root-level source (agents, lib, routes, server, utils, wasm) — may duplicate sveltekit-frontend | VERIFY — likely dead |
| `nats-server/` | ~3 | NATS messaging binary (RabbitMQ in use instead) | DELETE if not running |
| `elk-stack/` + `logstash/` | ~4 | ELK stack configs | DELETE if not running |
| `tools/` | ~40 | Misc utility scripts | VERIFY — may have useful scripts |
| `monitoring/` | ~10 | Monitoring scripts/configs | VERIFY if used |
| `packages/` | ~2 | Package definitions | VERIFY |
| `bin/` | ~2 | Binary wrapper scripts | VERIFY |
| `triton_models/` + `triton-models/` | ~5 | Triton inference server model configs | DELETE if not using Triton |
| `trt_runner/` + `trt_server/` | ~11 | TensorRT runner/server | DELETE if not using TRT |
| `tensorrt_build/` | ~16 | TensorRT build output | DELETE if not using TRT |
| `engines/` | ~6 | Pre-built TensorRT engines | DELETE if not using TRT |
| `backup/` + `backups/` | ~8 | Backup files (check dates) | VERIFY — likely stale |
| `deeds-web-app/` | varies | Nested copy of project? | VERIFY — may be accidental |
| `dev/` | varies | Development tools/configs | VERIFY |
| `simd-bridge/` | ~3 | SIMD bridge experiment | VERIFY |
| `static/` | ~15 | Root-level static assets | VERIFY — likely dead (served from sveltekit-frontend/static/) |
| `python/` | varies | Python utilities | VERIFY — likely dead |
| `database/` | varies | DB tools/configs | VERIFY |
| `test-reports/` + `test-results/` | ~5 | Test outputs | DELETE |
| `clickhouse-init/` | varies | ClickHouse DB init scripts | DELETE if not using |
| `services/` | varies | Old service implementations | VERIFY — likely dead |
| `legal-ai-quic-server-fixed.exe;C/` | ~1 | Malformed directory name (semicolon) | DELETE |

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

## Language Breakdown (Audited March 8, 2026)

| Language | Total Files | Active Files | Location | Status |
|----------|-------------|-------------|----------|--------|
| TypeScript (.ts) | 1,635 | ~1,100 | sveltekit-frontend/src/ | ACTIVE — 595 server, 244 API, 113 components |
| Svelte (.svelte) | 816 | ~700 | sveltekit-frontend/src/ | ACTIVE — 613 components, 84 routes |
| Go (.go) | 12,527 | 0 | go-microservice/ (12,396), langextract-go/ (75) | ABANDONED — DELETE safe |
| Python (.py) | 73,588 | ~200 | 69,194 in venvs (DELETE), 555 deeds_labs, 139 sveltekit, 43 scripts | 99.7% VENVS |
| CUDA (.cu/.cuh) | 563 | 5 | 5 in sveltekit-frontend/, 471 in venvs, 13 deeds_labs | ARCHIVE — venvs inflate count |
| Proto (.proto) | 345 | 9 | 141 go-microservice, 79 venvs, 69 proto/, 9 sveltekit | LEGACY — DELETE safe |
| Markdown (.md) | 5,626 | ~3,100 | 3,071 sveltekit-frontend/, 650 documents/, 511 go-microservice | CLEANUP needed |
| WGSL (.wgsl) | 4 | 4 | sveltekit-frontend/src/ | ACTIVE |
| Dockerfiles | 93 | ~10 | Scattered, mostly in venvs/go | 90% dead |

### Dead Weight Summary

| Category | Dirs | Files | Safe to Delete? |
|----------|------|-------|-----------------|
| **Python venvs** (.venv, .venv-phase46, phase46-venv, .python311, tensorrt_py310_env, .venv-verify) | 6 | **210,438** | YES — recreatable via pip |
| **Go microservice** (go-microservice/) | 1 | 26,570 | YES — SvelteKit replaced |
| **LibTorch** (libtorch-win-shared-with-deps-2.9.0+cu130/) | 1 | 9,377 | YES — not used |
| **deeds_labs/** | 1 | 13,227 | KEEP — intentional archive |
| **_archive/** | 1 | 352 | KEEP — intentional archive |
| **Misc legacy** (langextract-go, proto, proto-backup, protoc-install, old-scripts, etc.) | ~20 | ~500 | YES — unused |
| **TOTAL DELETABLE** | **~30** | **~247,000** | Frees ~50GB+ disk |

### Unwired Files Inside sveltekit-frontend/src/

| Area | Total | Used | Dead | % Dead |
|------|-------|------|------|--------|
| lib/types/ | 83 | ~18 | ~65 | 78% |
| lib/utils/ | 40 | ~12 | ~28 | 70% |
| lib/services/ | 64 | ~7 | ~57 | 89% (blanket-excluded, 312 corrupted) |
| lib/api/ | 6 | 1 | 5 | 83% |
| lib/error-brain/ | 3 | 0 | 3 | 100% |
| lib/__tests__/ | 3 | 0 | 3 | 100% |
| lib/stores/ | 16 | 13 | 3 | 19% |
| lib/db/ | 5 | 3 | 2 | 40% |
| lib/components/ | 69 top-level | ~55 | ~14 | 20% |
| **TOTAL** | **~289** | **~109** | **~180** | **62%** |

### lib/types/ — File-by-File Wiring Status

| File | Importers | Status | Recommendation |
|------|-----------|--------|----------------|
| `admin.ts` | 0 | DEAD | Archive to deeds_labs/ |
| `advanced-patches.d.ts` | 0 | DEAD | Archive |
| `ai.ts` | 3 | WIRED | Keep |
| `ai-assistant.ts` | 0 | DEAD | Archive |
| `ai-chat.ts` | 0 | DEAD | Archive |
| `ai-types.ts` | 0 | DEAD | Archive |
| `api.ts` | 8 | WIRED | Keep — heavily used |
| `app.d.ts` | 0 | DEAD | Archive |
| `auth.d.ts` | 0 | DEAD | Archive |
| `automated-resolution.ts` | 0 | DEAD | Archive |
| `button.ts` | 0 | DEAD | Archive |
| `case-summary.ts` | 7 | WIRED | Keep — heavily used |
| `case-theory.ts` | 2 | WIRED | Keep |
| `chat.ts` | 2 | WIRED | Keep |
| `citations.ts` | 4 | WIRED | Keep |
| `cluster.ts` | 0 | DEAD | Archive |
| `common-props.d.ts` | 0 | DEAD | Archive |
| `common-props.ts` | 0 | DEAD | Archive |
| `components.ts` | 0 | DEAD | Archive |
| `database.ts` | 2 | WIRED | Keep |
| *+ 63 more files* | varies | ~45 DEAD | Audit individually |

**Summary: 9 WIRED / 11+ DEAD of 20 checked (55% active). ~65 of 83 total likely dead.**

### lib/services/ — File-by-File Wiring Status

| File | Importers | Status | Recommendation |
|------|-----------|--------|----------------|
| `adaptive-index-orchestrator.ts` | 0 | DEAD | Archive (blanket-excluded) |
| `agentic-stream.ts` | 0 | DEAD | Archive |
| `agentShellMachine.ts` | 0 | DEAD | Archive |
| `ai-error-fixer.ts` | 0 | DEAD | Archive |
| `ai-service.ts` | 0 | DEAD | Archive |
| `api-client.ts` | 2 | WIRED | Keep |
| `case-link.service.ts` | 0 | DEAD | Archive |
| `contextual-intelligence-service.ts` | 1 | WIRED | Keep |
| `couchdb-client.ts` | 4 | WIRED | Keep |
| `get-ollama-endpoint.ts` | 2 | WIRED | Keep |
| `hybrid-stt.ts` | 1 | WIRED | Keep — voice input |
| `hybrid-whisper.ts` | 1 | WIRED | Keep — voice input |
| `llm-logger.ts` | 0 | DEAD | Archive |
| `neural-sprite-autoencoder.ts` | 0 | DEAD | Archive |
| `ollamaService.ts` | 3 | WIRED | Keep |
| `png-embed-extractor.ts` | 1 | WIRED | Keep |
| `poi.ts` | 0 | DEAD | Archive |
| `qdrant-client.ts` | 1 | WIRED | Keep |
| `rag-source-validation.ts` | 1 | WIRED | Keep |
| `source-validation-api.ts` | 3 | WIRED | Keep |
| `tts.ts` | 4 | WIRED | Keep — text-to-speech |
| `vector-service.ts` | 1 | WIRED | Keep |
| `voice-commands.ts` | 2 | WIRED | Keep |
| `whisper-stt.ts` | 1 | WIRED | Keep |

**Summary: 15 WIRED / 9 DEAD (63% active). Note: 312+ in lib/services/ are blanket-excluded (corrupted).**

### lib/utils/ — File-by-File Wiring Status (All Active)

| File | Importers | Status |
|------|-----------|--------|
| `api-endpoints.ts` | 1 | WIRED |
| `debounce.ts` | 1 | WIRED |
| `dynamic-imports.ts` | 1 | WIRED |
| `intersection-observer.ts` | 1 | WIRED |
| `ollama.ts` | 11 | WIRED — most used utility |
| `ollama-endpoint.ts` | 9 | WIRED — second most used |
| `progressive-enhancement-audit.ts` | 1 | WIRED |
| `route-operation-logger.ts` | 1 | WIRED |
| `sensitive-info-detector.ts` | 2 | WIRED |
| `toast.ts` | 1 | WIRED |
| `tracking.ts` | 3 | WIRED |
| `xstate-svelte5.ts` | 2 | WIRED |

**Summary: 12/12 WIRED (100% active). Healthiest directory in the project.**

### Consolidation Recommendations

1. **Immediate wins** — Archive 20 dead files from lib/types/ and lib/services/ to deeds_labs/archived-dead-files/
2. **Type consolidation** — Merge 83 type files into ~10 domain-grouped files (cases.ts, ai.ts, evidence.ts, etc.)
3. **Services cleanup** — The 312 blanket-excluded corrupted services need a full triage pass (but low priority since tsconfig excludes them)
4. **Root directory cleanup** — Delete ~30 empty/stale dirs, move ~25 legacy projects to deeds_labs/ → frees ~247,000 files

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
- document_tags, poi_profiles
**Redis Keys:** Session cache, L3 cache tier, GPU arbiter VRAM mutex, analytics sorted sets
---
## Kiro Spec Features — Implementation Gap

**Last Updated: March 8, 2026 (Session 99 — All Gaps Closed)**

| # | Feature | Planned | Built | Gap |
|---|---------|---------|-------|-----|
| 1 | Multi-Source Retrieval | 15 reqs, 31 tasks | **100%** | RAG ✅, KAG ✅, Citation PageRank ✅, 7-signal ranker ✅, Web search (Google+DDG) ✅, ACE context assembler (8 sources) ✅, 2-stage retrieval (Fuse.js→Qdrant) ✅, Wikipedia API ✅, DAG executor (topological sort) ✅. LexisNexis/Westlaw out-of-scope (commercial API keys) |
| 2 | YoRHa Detective Screens | 3 screens | **100%** | Terminal (25KB, voice I/O, streaming) ✅, Board (37KB, Kanban evidence) ✅, Command Center (stats+health+50 YoRHa components) ✅ |
| 3 | VLM Legal Vision | 5 subsystems | **100%** | YOLO service ✅, Gemma3 VLM embedder (live Ollama, 768-dim) ✅, VLM doc analyzer ✅, LangExtract OCR ✅, multi-modal fusion (VLM+OCR+entities) ✅, poi_profiles Qdrant collection ✅. TensorRT optional (Ollama covers inference) |
| 4 | Self-Healing Error Agent | Auto-patch loop | **100%** | Error Brain UI ✅, 12+ API endpoints ✅, generate-fix (Ollama) ✅, apply-fix (file write + dryRun mode) ✅, verify-fix (svelte-check) ✅, auto-patch orchestrator (generate→apply→verify→rollback) ✅, Auto-Fix UI button ✅ |
| 5 | Unified Reasoning Engine | C++ gRPC + CUDA | **0%** | DEFERRED — Ollama + legal-reasoning-chain.ts + batch embedder covers same ground |
| 6 | ACE Web Ingestion | Crawl→chunk→embed→KAG | **100%** | /api/ace/ingest ✅, SSE streaming pipeline (?stream=true) ✅, KAG graph nodes ✅, Neo4j sync (syncIngestedContent) ✅, context-assembler (8 parallel sources) ✅, /api/ace/summarize ✅ |
| 7 | Citation Intelligence | Collections, tags, export | **100%** | Collections API ✅, tags ✅, export ✅, CitationCollections + CollectionDetail ✅, Citation PageRank + Redis persistence ✅ |
| 8 | Agentic Alignment Router | Intent classify + KAG | **100%** | 3-tier routing (LOCAL/RETRIEVAL/SERVER) ✅, 8 intent categories ✅, 6 scoring rules ✅, health-aware fallback ✅, KAG-aware intent classification ✅ |
| 9 | Knowledge Search Engine | IDF + HMM + external docs | **100%** | 4-source parallel search ✅, TF-IDF hybrid reranking (0.7/0.3) ✅, 5-tab UI ✅, glossary+statutes+precedents ✅, HMM bigram transitions (Redis-backed) ✅, query expansion (50+ legal synonyms) ✅, file upload ✅ |
| 10 | Case Notes Enhancements | Versioning, FTS, PDF export | **100%** | Versioning ✅, CRUD ✅, diff view ✅, case packet export ✅, FTS ✅, evidence linking ✅, notes tab route ✅ |
| 11 | Person of Interest | Vector search UI + photos | **100%** | Schema ✅, 7 API endpoints ✅, create/detail routes ✅, photo upload (MinIO) ✅, VLM photo analysis (live Ollama) ✅, poi_profiles Qdrant collection ✅, face-match cross-collection search ✅, multi-modal fusion ✅ |
| 12 | Error Brain DB Wiring | History + patches | **100%** | phase72_error table ✅, status API ✅, runs API ✅, /all-routes panel ✅, error_brain_analysis schema ✅ |
| 13 | Infrastructure & Docker | Full stack | **95%** | 7 Docker services UP ✅, Neo4j in docker-compose ✅, TensorRT defined ✅, native/autoencoder stub ✅, python-workers/fastapi-embed stub ✅. Remaining: start all 14 services (ops task, not code) |
| 14 | Svelte 5 Migration | Runes + bits-ui | **100%** | COMPLETE |
| 15 | Evidence Pipeline Scaling | Batch embed + summary + tags | **100%** | pLimit(3) ✅, batch /api/embed ✅, summary→Qdrant ✅, auto-tag ✅, streaming embeddings ✅ |
| 16 | Report Caching | Templates + warmup + exports | **100%** | Redis template cache ✅, startup warmup ✅, export cache ✅ |
| 17 | Cache Infrastructure | Invalidation + monitoring | **100%** | Multi-tier invalidation ✅, admin dashboard ✅, Qdrant health ✅, 3-tier CachingLayer (hot+LRU+Redis) ✅, zlib compression ✅, tag invalidation ✅ |

**Summary: 16/17 features at 100% (95-100%) | 1 DEFERRED (#5)**

---

## TODO — Remaining Gaps (Priority Order)

### All Feature Gaps Closed (Session 99)

All 16 achievable features are now at 100% (or 95% for #13 Infrastructure where remaining work is ops, not code). Feature #5 (Unified Reasoning Engine) remains DEFERRED — Ollama covers the same ground.

#### Completed in Session 99:
- [x] **#1 Wikipedia API** — `wikipedia-search.ts`, wired to context-assembler as 8th parallel source
- [x] **#1 DAG executor** — `document-dag.ts`, Kahn's topological sort, `?dag=true` on `/api/rag/search`
- [x] **#9 Query expansion** — `query-expansion.ts`, 50+ legal synonym pairs, wired to `/api/knowledge/search`
- [x] **#9 HMM bigram model** — `hmm-engine.ts` rewritten from stub to Redis-backed bigram transitions
- [x] **#3 VLM unmocked** — `gemma3-vlm-embedder.ts` now uses real Ollama VLM + EmbeddingGemma (768-dim)
- [x] **#3 Multi-modal fusion** — `multimodal-fusion.ts`, weighted VLM+OCR+entity merging
- [x] **#3 poi_profiles collection** — Added to Qdrant init, dual-write from POI photo upload
- [x] **#11 Face-match cross-collection** — Searches `poi_profiles` (0.7 threshold) → `evidence_items` fallback
- [x] **#4 Apply-fix file write** — `dryRun=false` mode, path safety, backup before modify
- [x] **#4 Verify-fix** — New endpoint, runs svelte-check, checks target file for errors
- [x] **#4 Auto-patch** — Orchestration loop: generate→apply→verify→retry→rollback, max 5 attempts
- [x] **#4 Auto-Fix UI** — Button in Error Brain page, shows attempt-by-attempt progress
- [x] **#6 SSE streaming** — `?stream=true` on `/api/ace/ingest`, 6-stage progress events
- [x] **#6 Neo4j sync** — `syncIngestedContent()` in pg-neo4j-sync.ts, fire-and-forget
- [x] **#13 Infrastructure stubs** — `native/autoencoder/` + `python-workers/fastapi-embed/`

#### Out of Scope:
- **#1 LexisNexis/Westlaw**: Requires commercial API keys — not possible in open-source project
- **#5 Unified Reasoning Engine**: DEFERRED — Ollama inference covers same capabilities
- **#13 Start all 14 Docker services**: Operations task, not code — all configs exist

---

## Quick Wins Status

| # | Quick Win | Was | Now | Status |
|---|-----------|-----|-----|--------|
| 1 | Error Brain History UI | 90% | 95% | ✅ DONE — 6 API endpoints (status, runs, search, generate-fix, apply-fix, history) + dashboard with status cards + runs table + Ollama fix generation + provenance tracking. Frontend wired to API |
| 2 | POI Vector Search UI | 70% | 95% | ✅ DONE — 6 API endpoints, 7-stage VLM pipeline, photo CRUD, vector search, face matching |
| 3 | Case Notes Versioning + FTS | 60% | 100% | ✅ DONE — 3 DB tables + 8 API endpoints + PostgreSQL FTS + diff view + restore + evidence linking |
| 4 | Citation Tags | 20% | 95% | ✅ DONE — citationTags table + full CRUD API + cache invalidation + CitationSaveForm wired to tag API + preset tag buttons (6 legal tag types with colors) |
| 5 | Infrastructure Restart | 85% | 85% | Pending — health checks work (`/api/health/services`), automated restart scripts missing |
| 6 | Case Packet PDF Export | 60% | 95% | ✅ DONE — HTML export + citations + evidence + POI + notes sections + Redis caching + pdf-lib generator |
| 7 | NES Modal for Notes | 60% | 100% | ✅ DONE — custom NesModal.svelte (SSR-safe, avoids bits-ui TDZ) + NoteViewerModal.svelte rebuilt (was Phase 99 corrupted) + integrated with case notes editor |
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

### All Feature Gaps Closed (Session 99)

All features previously listed here are now at 100%. See the Kiro Spec Features table above for full status.

#### New Files Created in Session 99:
- `src/lib/server/retrieval/wikipedia-search.ts` — Wikipedia MediaWiki API integration
- `src/lib/server/retrieval/document-dag.ts` — DAG executor (Kahn's topological sort)
- `src/lib/server/retrieval/query-expansion.ts` — Legal synonym expansion (50+ pairs)
- `src/lib/server/ai/multimodal-fusion.ts` — Weighted VLM+OCR+entity signal fusion
- `src/routes/api/error-brain/verify-fix/+server.ts` — svelte-check verification
- `src/routes/api/error-brain/auto-patch/+server.ts` — Auto-patch orchestration loop
- `native/autoencoder/` — Autoencoder bridge stub (Dockerfile + health + server)
- `python-workers/fastapi-embed/` — FastAPI embedding worker stub

#### Key Files Modified in Session 99:
- `gemma3-vlm-embedder.ts` — Unmocked: real Ollama VLM + EmbeddingGemma (768-dim)
- `hmm-engine.ts` — Rewritten: stub → Redis-backed bigram transition model
- `qdrant-manager.ts` — Added poi_profiles collection to init
- `ace/ingest/+server.ts` — Added SSE streaming + Neo4j sync
- `error-brain/apply-fix/+server.ts` — Added dryRun=false file write mode
- `face-match/+server.ts` — Cross-collection search (poi_profiles → evidence_items)
- `web-search.ts` — Re-exports Wikipedia search
- `context-assembler.ts` — 8th parallel source (Wikipedia)
- `pg-neo4j-sync.ts` — Added syncIngestedContent()

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
