# Legacy Projects Archive Index

## Date Archived: March 9, 2026
## Total: 66 directories moved from project root

All directories confirmed **disconnected** from the active SvelteKit 2 codebase (`sveltekit-frontend/`). No active imports, Docker mounts, or script references found.

---

## Services & Microservices (11)

| Directory | What It Was | Why Archived |
|-----------|-------------|--------------|
| `ai-server/` | Standalone AI inference server | Replaced by Ollama + gRPC Go server (:50051) |
| `ai-summary-service/` | Document summarization microservice | Integrated into RAG pipeline (`rag-pipeline.ts`) |
| `embedding-service/` | Embedding generation service | Replaced by Go gRPC embedding server + Ollama |
| `ingestion-phase66/` | Phase 66 document ingestion | Replaced by 8-stage evidence pipeline in SvelteKit |
| `ingestion-service/` | Generic ingestion service | Same — replaced by evidence pipeline |
| `reranker-service/` | Search result reranking | Integrated into Qdrant hybrid search + GPU reranker |
| `tensor_services/` | TensorRT inference services | Replaced by Ollama GPU + ONNX WebGPU client |
| `go-trt-service/` | Go TensorRT wrapper service | Replaced by Triton ensemble pipeline |
| `granite-docling-worker/` | Granite document extraction worker | Replaced by langextract Docker service (:8095) |
| `orchestrator/` | Workflow orchestration service | Replaced by XState v5 + RabbitMQ queues |
| `workers/` | Background job workers (JS/TS) | Replaced by RabbitMQ consumers |

## Old SvelteKit / Svelte Projects (3)

| Directory | What It Was | Why Archived |
|-----------|-------------|--------------|
| `src/` | Original root src/ before SvelteKit migration | Replaced by `sveltekit-frontend/src/` |
| `svelte_ui/` | Early Svelte 4 UI prototype | Replaced by Svelte 5 runes codebase |
| `sveltekit-evidence/` | Separate SvelteKit evidence app | Merged into main app at `(app)/evidence/` |

## Infrastructure & DevOps (12)

| Directory | What It Was | Why Archived |
|-----------|-------------|--------------|
| `clickhouse-init/` | ClickHouse database init scripts | ClickHouse removed from stack (use PostgreSQL) |
| `docker-scripts/` | Docker automation scripts | Replaced by `docker/` and `docker-compose.yml` |
| `elk-stack/` | Elasticsearch/Logstash/Kibana configs | ELK stack not in active architecture |
| `logstash/` | Logstash pipeline configs | Part of removed ELK stack |
| `monitoring/` | Grafana/Prometheus Docker compose | Monitoring stack not actively deployed |
| `nginx/` config was kept at root; this was a duplicate | N/A |
| `pgvector-install/` | pgvector build/install scripts | pgvector installed via Docker image |
| `protoc-install/` | protoc compiler install scripts | protoc installed globally |
| `searxng-config/` | SearXNG search engine config | SearXNG not in active stack |
| `tmux/` | tmux session configs | Dev workflow convenience, not codebase |
| `weekly-cleanup/` | Scheduled cleanup scripts | Not actively scheduled |
| `windows-service/` | Windows service wrapper | App runs as SvelteKit dev/node process |

## Data & Documents (8)

| Directory | What It Was | Why Archived |
|-----------|-------------|--------------|
| `data/` | Misc data files | No active references |
| `datasets/` | Training/evaluation datasets | No active model training pipeline |
| `documents/` | Document storage directory | Evidence stored in object storage + PostgreSQL |
| `lawpdfs/` | Legal PDF collection | Reference PDFs, not programmatically accessed |
| `legal_ai_output/` | AI analysis output files | Output now goes to DB/object storage |
| `sample-data/` | Sample legal documents (1 PDF) | Zero references from active code |
| `vector-backup-*` | Qdrant vector backup snapshot | One-time backup, not automated |
| `notebooks/` | Jupyter notebooks | Research notebooks, not production code |

## Build & Tooling (6)

| Directory | What It Was | Why Archived |
|-----------|-------------|--------------|
| `build_helpers/` | MSVC cl.exe wrapper for native builds | No active native build references |
| `engine-builder/` | TensorRT engine builder scripts | Replaced by Triton build pipeline |
| `engines/` | Pre-built TensorRT engines | Replaced by Triton model repository |
| `jstests/` | Old JavaScript test files | Tests now in `tests/` and Playwright |
| `config/` | Production config JSON | Config now in env vars + SvelteKit config |
| `codemod-plans/` | Automated code migration plans | One-time migration tool output |

## TensorRT & Triton (4)

| Directory | What It Was | Why Archived |
|-----------|-------------|--------------|
| `triton_models/` | Triton Inference Server model configs | Triton deployment not active |
| `triton-models/` | Duplicate Triton model directory | Duplicate of above |
| `q4km_test_results/` | Q4_K_M quantization test results | Historical test data |
| `test-services/` | Minimal CUDA test service (Go) | One-off test, not production |

## Documentation & Reports (5)

| Directory | What It Was | Why Archived |
|-----------|-------------|--------------|
| `docs/` | Project documentation collection | Docs now in CLAUDE.md + memory/ |
| `PERFORMANCE_FIXES_DOCUMENTATION/` | Performance fix writeups | Historical documentation |
| `reports/` | Generated analysis reports | Reports now generated via SvelteKit API |
| `commas-previews/` | UI preview screenshots | Historical UI snapshots |
| `svelte-check-errors-index/` | Error tracking during migration | Migration complete (0 errors) |

## Archives & Misc (8)

| Directory | What It Was | Why Archived |
|-----------|-------------|--------------|
| `archive/` | Old archive directory | Superseded by `deeds_labs/` |
| `ace_runs/` | ACE self-prompting run output | Historical run data |
| `context7/` | Context7 tool data | External tool workspace |
| `context7-docs/` | Context7 documentation | External tool docs |
| `dev/` | Dev environment scripts | Not actively used |
| `old-scripts/` | Explicitly labeled old scripts | Self-documenting name |
| `todolist_2025-08-04T05-23-51/` | Old timestamped todo list | Historical |
| `error-analysis/` | Error analysis scripts/data | Replaced by error-brain in SvelteKit |

## Reference Repos (2)

| Directory | What It Was | Why Archived |
|-----------|-------------|--------------|
| `langextract-go/` | Cloned Go langextract repo (had .git/) | Reference only — active service is Docker `phase66-langextract` |
| `native/` | Autoencoder stub (random vectors) | See `native/autoencoder/ARCHIVE_ANALYSIS.md` |

## Database & Migrations (3)

| Directory | What It Was | Why Archived |
|-----------|-------------|--------------|
| `database/` | Old database setup scripts | Replaced by `drizzle/` migrations |
| `migrations/` | Old migration files | Replaced by `drizzle/` migrations |
| `proto-backup/` | Backup of proto definitions | Active protos in `proto/` |
| `protos/` | Duplicate proto directory | Active protos in `proto/` |

## Test Artifacts (2)

| Directory | What It Was | Why Archived |
|-----------|-------------|--------------|
| `test-reports/` | Old test report output | Current reports in `playwright-report/` |
| `test-results/` | Old test result output | Current results from Playwright |

## Performance (1)

| Directory | What It Was | Why Archived |
|-----------|-------------|--------------|
| `perf/` | Performance benchmarks/profiling | Historical performance data |

---

## What Remains at Root (ACTIVE)

| Directory | Purpose |
|-----------|---------|
| `sveltekit-frontend/` | Main SvelteKit 2 + Svelte 5 application |
| `go-microservice/` | Active Go services (gRPC :50051, QUIC :4434) |
| `simd-bridge/` | LibTorch/CUDA N-API addon |
| `docker/` | Docker infrastructure configs |
| `drizzle/` | Database migrations (Drizzle ORM) |
| `scripts/` | Test and utility scripts |
| `proto/` | Protobuf definitions |
| `sql/` | Docker Postgres init (WIRED via docker-compose) |
| `ssl/` | SSL certificates |
| `nginx/` | Nginx reverse proxy config |
| `qdrant/` | Qdrant vector DB config |
| `redis/` | Redis config |
| `minio/` | Legacy object storage config |
| `next_steps/` | Project planning documents |
| `python/` | Python utility scripts |
| `python-workers/` | Python background workers |
| `granite-docling-258M/` | Granite document model |
| `hmm-topic-service/` | HMM topic modeling service |
| `ocr_pipeline/` | OCR processing pipeline |
| `tools/` | Development tools |
| `tests/` | Test suites |
| `deeds_labs/` | Archive destination |
