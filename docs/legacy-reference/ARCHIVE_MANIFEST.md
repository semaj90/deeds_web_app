# Legacy Projects Archive Manifest

## Date: March 9, 2026
## Total: 66 directories, ~1500 files archived
## Verdict: All directories superseded by integrated SvelteKit 2 + Go microservice stack

---

## Active Codebase (NOT archived)

| Directory | Purpose | Status |
|-----------|---------|--------|
| `sveltekit-frontend/` | Main SvelteKit 2 + Svelte 5 application | **ACTIVE** |
| `go-microservice/` | Go gRPC (:50051) + QUIC (:4434) + SIMD (:8095) | **ACTIVE** |
| `simd-bridge/` | LibTorch/CUDA N-API addon | **ACTIVE** |
| `scripts/` | Test automation (Playwright screenshots) | **ACTIVE** |
| `docker/` | Docker Compose orchestration | **ACTIVE** |
| `proto/` | Active protobuf definitions | **ACTIVE** |

---

## Archived Directory Summaries

### Frontend Projects

| Directory | Files | What It Was | What Replaced It |
|-----------|-------|-------------|-----------------|
| `src/` | 238 | Original SvelteKit root (Svelte 4, old AI chat) | `sveltekit-frontend/` with Svelte 5 runes |
| `sveltekit-evidence/` | 32 | Standalone evidence app with NES.css retro UI | Merged into `/evidence` route in main app |
| `svelte_ui/` | 6 | Early Svelte 4 UI component prototypes | Svelte 5 components with bits-ui v2.16.2 |
| `svelte-check-errors-index/` | 5 | Error tracking for svelte-check runs | svelte-check now at 0 errors/0 warnings |
| `commas-previews/` | 20 | Preview/demo screenshots | No longer needed |

### AI / Inference Microservices

| Directory | Files | What It Was | What Replaced It |
|-----------|-------|-------------|-----------------|
| `ai-server/` | 12 | FastAPI WebSocket inference + vector search + workflows | Ollama GPU (:11434) + Go gRPC (:50051) |
| `ai-summary-service/` | 15+3 | Go document summarization microservice | RAG pipeline (`rag-pipeline.ts`) |
| `embedding-service/` | 5 | Standalone embedding generation service | Go gRPC embedding client + Ollama + HTTP fallback |
| `reranker-service/` | 2 | Search result reranking microservice | Qdrant hybrid search + GPU search reranker |
| `granite-docling-worker/` | 61 | Granite doc extraction + Docling page classifier | langextract Docker service (:8095) |
| `ingestion-phase66/` | 24 | Phase 66 GPU document ingestion pipeline | 8-stage evidence pipeline in SvelteKit |
| `ingestion-service/` | 1 | Document ingestion endpoint | Same — merged into evidence upload routes |
| `orchestrator/` | 1 | JavaScript workflow orchestration | XState v5 state machines |
| `workers/` | 2 | Background job workers | RabbitMQ consumers (7 queues) |

### TensorRT / GPU Services

| Directory | Files | What It Was | What Replaced It |
|-----------|-------|-------------|-----------------|
| `tensor_services/` | 2 | TensorRT inference stub | Ollama GPU + ONNX WebGPU client |
| `go-trt-service/` | 2 | Go TensorRT wrapper + test binary | Ollama GPU (native, no TRT needed) |
| `engine-builder/` | 3 | TensorRT engine builder | Triton Inference Server (optional) |
| `engines/` | 3 | Pre-built TensorRT engines | Not needed — Ollama handles inference |
| `triton_models/` | 6 | Triton model repository | Optional — Ollama is primary |
| `triton-models/` | 2 | Duplicate Triton models directory | Same |

### Infrastructure & DevOps

| Directory | Files | What It Was | What Replaced It |
|-----------|-------|-------------|-----------------|
| `monitoring/` | 10 | Grafana/Prometheus Docker stack | Basic health checks in SvelteKit |
| `elk-stack/` | 2 | Elasticsearch + Kibana configs | Not in active stack |
| `logstash/` | 2 | Logstash pipeline config | Not in active stack |
| `docker-scripts/` | 2 | Docker migration scripts (one-time) | Completed — Docker Compose active |
| `clickhouse-init/` | 1 | ClickHouse database config | Not in active stack |
| `tmux/` | 2 | Terminal multiplexer configs | Manual tmux use |
| `weekly-cleanup/` | 1 | Scheduled cleanup scripts | Manual cleanup |
| `windows-service/` | 6 | Windows service wrapper for Node.js | Native Node.js execution |
| `searxng-config/` | 1 | SearXNG search engine config | Not in active stack |
| `pgvector-install/` | 43 | Manual pgvector build scripts + JPEG docs | pgvector via Docker PostgreSQL 16 image |
| `protoc-install/` | 13 | Protocol buffer compiler installer | protoc installed globally |

### Data & Documents

| Directory | Files | What It Was | What Replaced It |
|-----------|-------|-------------|-----------------|
| `documents/` | 648 | Document storage (PDFs, text, metadata) | Object storage + PostgreSQL evidence table |
| `lawpdfs/` | 31+6 | Legal PDF corpus | Object storage + evidence pipeline |
| `data/` | 1 | Object storage system files | Object storage runs in Docker |
| `datasets/` | 1 | `legal_corpus.json` sample data | Active corpus in Qdrant collections |
| `sample-data/` | 1 | Test data files | Test fixtures in `scripts/tests/` |
| `notebooks/` | 1 | Jupyter research notebooks | No active model training pipeline |
| `vector-backup-*` | 10 | One-time Qdrant vector backup (2025-07-24) | Qdrant runs persistently in Docker |
| `context7/` | 1 | Context7 external dev tool docs | Tool no longer used |
| `context7-docs/` | 46 | Context7 documentation cache | Tool no longer used |

### Database & Migrations

| Directory | Files | What It Was | What Replaced It |
|-----------|-------|-------------|-----------------|
| `database/` | 9 | Raw PostgreSQL schema + seed scripts | Drizzle ORM schema (`schema-postgres.ts`) |
| `migrations/` | 5 | Raw SQL migration scripts | `drizzle-kit migrate` + `drizzle/` directory |
| `proto-backup/` | 12 | Backup of protobuf definitions | Active protos in `proto/` directory |
| `protos/` | 1 | Duplicate proto directory | Consolidated into `proto/` |

### Build & Tooling

| Directory | Files | What It Was | What Replaced It |
|-----------|-------|-------------|-----------------|
| `build_helpers/` | 1 | MSVC cl.exe wrapper for native builds | No active native C++ builds (simd-bridge uses cmake) |
| `jstests/` | 4 | Old JavaScript test files | Playwright tests in `scripts/tests/` |
| `codemod-plans/` | 1 | Code migration planning docs | Migrations completed |
| `config/` | 1 | `production-config.json` | Environment variables (.env) |
| `dev/` | 2 | Development utilities | Integrated into scripts/ |
| `old-scripts/` | 2 | Legacy automation scripts | Current scripts in `scripts/` |
| `perf/` | 1 | Performance benchmarks | PERFORMANCE_FIXES_DOCUMENTATION |

### Documentation & Reports

| Directory | Files | What It Was | What Replaced It |
|-----------|-------|-------------|-----------------|
| `docs/` | 157 | 157 markdown documentation files | `CLAUDE.md` + `memory/` reference docs |
| `reports/` | 11 | Generated analysis reports | Report generation via `/api/reports/` |
| `test-reports/` | 2 | Test result archives | Playwright screenshots in `scripts/tests/` |
| `test-results/` | 1 | Single test result file | Same |
| `error-analysis/` | 1 | Error analysis scripts | Error Brain route (`/error-brain`) |
| `ace_runs/` | 2 | ACE self-prompting run logs | ACE integrated into synthesis endpoint |
| `PERFORMANCE_FIXES_DOCUMENTATION/` | 1 | Performance fix notes | Completed — performance fixes applied |
| `archive/` | 2 | Old Storybook backup | Consolidated into `deeds_labs/` |
| `legal_ai_output/` | 2 | Legacy inference output logs | Not needed |
| `q4km_test_results/` | 1 | Quantization test results | Completed tests |
| `todolist_*` | 2 | Old todo list snapshots | TodoWrite tool + CLAUDE.md |
| `langextract-go/` | 1 | Go language extraction CLI | Consolidated into `go-microservice/langextract/` |

---

## Architecture Evolution Summary

These 66 directories represent the evolution from **scattered microservices** to an **integrated monolith**:

```
BEFORE (2024-2025):
  15+ Python FastAPI services
  8+ Go microservices
  3+ standalone frontends (Svelte 4, Vue)
  Manual SQL migrations
  ELK/Prometheus/Grafana monitoring
  TensorRT acceleration experiments

AFTER (2026):
  sveltekit-frontend/     — Unified SvelteKit 2 + Svelte 5 app (248 API endpoints, 80 pages)
  go-microservice/        — Consolidated Go (gRPC + QUIC + SIMD)
  simd-bridge/            — LibTorch/CUDA N-API addon
  Ollama (native)         — GPU inference (gemma3-legal + embeddinggemma)
  Docker Compose          — PostgreSQL + Redis + Qdrant + object storage + RabbitMQ + CouchDB
```

---

## Verification

All archived directories verified as having **zero active imports** from `sveltekit-frontend/src/`. The active codebase passes:
- `svelte-check`: 0 errors, 0 warnings
- Playwright: 20/20 routes PASS
- `vite build`: exit 0
