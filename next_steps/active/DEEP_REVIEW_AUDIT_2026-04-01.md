# Deep Review Audit — April 1, 2026
**Status**: SUPERSEDED — disk cleanup completed Apr 3 (16 GB reclaimed). Archive candidate.

## Executive Summary

**Workspace**: 45.8 GB (down from ~53 GB after 7.6 GB duplicate cleanup today)
**C: Drive**: 891.8 GB used / 39.1 GB free (4.2% free — critical)
**Docker**: 132.4 GB images (91% reclaimable), 58.5 GB volumes
**Status**: Core platform production-ready, GPU acceleration partial, disk space critical

---

## 1. Workspace Size Breakdown (45.8 GB)

| Directory | Size | Category |
|-----------|------|----------|
| `deeds_labs/` | 14.75 GB | Archive (gitignored) |
| `sveltekit-frontend/` | 10.40 GB | Application (includes static models) |
| `gemma3Q4_K_M/` | 7.38 GB | Unsloth fine-tuned GGUF model — KEEP |
| `.venv/` | 6.06 GB | Python venv (PyTorch + CUDA DLLs) |
| `models/` | 2.89 GB | Canonical model files |
| `scripts/` | 0.97 GB | Build/test scripts |
| `node_modules/` | 0.73 GB | JS dependencies |
| `granite-docling-258M/` | 0.49 GB | Document parsing model |
| `.cache/` | 0.44 GB | Build caches |
| `.rag-metrics/` | 0.44 GB | RAG evaluation data |
| `qdrant-windows/` | 0.40 GB | Qdrant native binary |
| `storage/` | 0.33 GB | Local file storage |
| `tools/` | 0.27 GB | CLI tools |
| `.python311/` | 0.09 GB | Python runtime |
| Other (15 dirs) | < 0.5 GB | Config, proto, docker, etc. |

### Canonical Model Inventory

| Model | Location | Size | Purpose | Status |
|-------|----------|------|---------|--------|
| gemma4-legal Q4_K_M | `gemma3Q4_K_M/` | 7.38 GB | Unsloth fine-tuned LLM (GGUF) | ACTIVE — Ollama |
| embeddinggemma 300M | `models/embeddinggemma_300m/` | 1.16 GB | 768-dim embeddings (safetensors) | ACTIVE — Ollama |
| gemma3 270M ONNX | `sveltekit-frontend/static/gemma3_270m_onnx/` | 0.83 GB | Client-side inference (WebGPU/WASM) | ACTIVE — browser |
| gemma3 270M ONNX (master) | `models/gemma3-client-onnx/` | 0.83 GB | Source copy of ONNX models | MASTER |
| gemma3 270M safetensors | `models/gemma3_270m/` | 0.51 GB | Raw safetensors weights | REFERENCE |
| granite-docling 258M | `granite-docling-258M/` | 0.49 GB | Document structure parsing | ACTIVE |

---

## 2. Duplicates Cleaned Today (7.6 GB freed)

| What | Size | Action |
|------|------|--------|
| `.svelte-kit/output/client/gemma3_270m_onnx` | 872 MB | Deleted (build artifact, auto-regenerated) |
| `build/client/gemma3_270m_onnx` | 881 MB | Deleted (build artifact, auto-regenerated) |
| `deeds_labs/snapshots/**/gemma3_270m_onnx` (3 copies) | 2,634 MB | Deleted (snapshot dupes of `static/`) |
| `deeds_labs/**/gemma_3_270m-duplicate/` | 1,022 MB | Deleted (duplicate + LFS blob) |
| `deeds_labs/**/all-mpnet-base-v2/` | 418 MB | Deleted (replaced by embeddinggemma) |
| `svelte-check-current.log` | 507 MB | Truncated (regenerated each run) |
| `full-errors.log` | 501 MB | Deleted (stale error analysis) |
| `svelte-check-output.json` | 463 MB | Deleted (stale snapshot) |
| `.cache/sveltecheck.json` | 449 MB | Deleted (stale cache) |
| **TOTAL** | **~7.6 GB** | |

---

## 3. C: Drive Space Analysis

**39.1 GB free — CRITICAL (4.2%)**

| Location | Size | Notes |
|----------|------|-------|
| `C:\Users\james\AppData` | 451.4 GB | Likely Docker Desktop WSL2 vhdx |
| `C:\Users\james\Videos\deeds-web-app` | 45.8 GB | This workspace |
| `C:\Users\james\.ollama` | 16.4 GB | Ollama model cache |
| `C:\Program Files\NVIDIA GPU Computing Toolkit` | 8.8 GB | CUDA 13.0 toolkit |
| `C:\Users\james\.cache` | 4.3 GB | Misc caches |
| `C:\libtorch-win-shared-with-deps-2.9.0+cu130` | 3.3 GB | LibTorch (needed for build) |
| `C:\Program Files\NVIDIA` | 2.8 GB | cuDNN + drivers |

### Immediate Space Recovery Opportunities

| Action | Savings | Risk |
|--------|---------|------|
| `docker image prune` (unused images) | ~121.6 GB | LOW — removes untagged/unused |
| `docker volume prune` (unused volumes) | ~18.9 GB | MEDIUM — verify no data volumes |
| `docker builder prune` (build cache) | ~758 MB | LOW |
| Remove `legal-ai-tensorrt-llm` image | 83 GB | LOW — can re-pull when needed |
| Remove `deeds-web-app-mcp-server` image | 7.23 GB | LOW — can rebuild |
| Remove `ghcr.io/berriai/litellm` image | 5.61 GB | LOW — not currently running |
| Compact WSL2 vhdx | Varies | LOW — `wsl --shutdown && Optimize-VHD` |

---

## 4. Docker Container & Image Audit

### Running Containers (11)

| Container | Image | Status | Essential? |
|-----------|-------|--------|-----------|
| postgres-pgvector | postgres:17 | UP (healthy) | YES — primary DB |
| deeds-postgres-prod | deeds-postgres-pgai:pg17 | UP | YES — pgai extension |
| deeds-redis-prod | redis-stack-server:7.4.0-v3 | UP | YES — cache + search |
| phase66-redis | redis-stack | UP (healthy) | DUPLICATE — port conflict |
| phase66-qdrant | qdrant/qdrant | UP (healthy) | YES — vector DB |
| phase66-rabbitmq | rabbitmq:3-management | UP (healthy) | YES — message queue |
| phase66-minio | minio/minio | UP (healthy) | YES — object storage |
| phase66-langextract | ingestion-phase66-langextract | UP (healthy) | YES — doc extraction |
| legal-ai-couchdb | couchdb:3.3 | UP (healthy) | OPTIONAL — profile-gated |
| legal-ai-neo4j | neo4j:5-community | UP (healthy) | OPTIONAL — graph enrichment |
| legal-ai-nats | nats:latest | UP | OPTIONAL — QUIC transport |

### Stopped Containers (11)

| Container | Status | Action |
|-----------|--------|--------|
| deeds-litellm-proxy | Exited 2 weeks ago | Can remove (not currently used) |
| langfuse-server | Exited 2 weeks ago | Can remove (observability, not active) |
| langfuse-clickhouse | Exited 2 weeks ago | Can remove (langfuse dependency) |
| phase66-postgres | Exited 11 days ago | DUPLICATE of postgres-pgvector |
| phase66-couchdb | Exited 2 weeks ago | DUPLICATE of legal-ai-couchdb |
| phase66-node-api | Exited 5 days ago | Can remove (legacy ingestion API) |
| legal-ai-caddy-quic | Exited 3 days ago | Can remove (replaced by native Caddy) |
| legal-ai-qdrant | Created | DUPLICATE of phase66-qdrant |
| legal-ai-rabbitmq | Created | DUPLICATE of phase66-rabbitmq |
| legal-ai-redis | Created | DUPLICATE of phase66-redis |
| legal-ai-minio | Created | DUPLICATE of phase66-minio |

### Docker Images — GPU Related

| Image | Size | Status |
|-------|------|--------|
| `legal-ai-tensorrt-llm` | **83 GB** | STOPPED — TRT-LLM not live yet |
| `ingestion-phase66-gpu-workers` | **13 GB** | NO CONTAINER — image only |
| `ollama/ollama` | 5.82 GB | NOT USED — native Ollama is active |
| `ghcr.io/berriai/litellm` | 5.61 GB | STOPPED — proxy not active |

### GPU Workers Container (Found)

Located in `deeds_labs/projects/legacy-projects/ingestion-phase66/`:
- **4 Python workers** managed by supervisord: pdf, text, vision, embedder
- Uses PyTorch + RabbitMQ consumers + Qdrant writes
- Docker compose service with `deploy.resources.reservations.devices: [gpu]`
- Health check via `torch.cuda.is_available()`
- **Status**: Archived in deeds_labs, 13 GB image still on disk
- **Assessment**: Superseded by current pipeline (native Ollama + N-API CUDA addon + SvelteKit workers)

---

## 5. GPU Acceleration Stack — Current State

### Active GPU Paths

| Layer | Technology | Status | Performance |
|-------|-----------|--------|-------------|
| **LLM Inference** | Ollama (native, GPU) | RUNNING | gemma4-legal Q4_K_M on RTX 3060 Ti |
| **Embeddings** | Ollama (native, GPU) | RUNNING | embeddinggemma 768-dim |
| **N-API CUDA Addon** | tensorrt_bridge.node | BUILT TODAY | 7 GPU functions verified |
| **Client ONNX** | WebGPU → WASM → CPU | ACTIVE | gemma3 270M in-browser |
| **Vector Search** | Qdrant INT8 | ACTIVE | 72 collections quantized |
| **pgvector** | halfvec HNSW | ACTIVE | 6 tables indexed |

### N-API CUDA Functions (Verified April 1, 2026)

| Function | GPU Path | CPU Fallback | Status |
|----------|---------|-------------|--------|
| `checkCudaAvailable()` | N/A | N/A | Returns 1 (GPU) |
| `relu(arr, n)` | CUDA kernel | C++ loop | VERIFIED |
| `dotProduct(a, b, n)` | CUDA shared-mem reduction | C++ loop | VERIFIED |
| `scale(arr, s, n)` | CUDA kernel | C++ loop | VERIFIED |
| `lstmAdd(a, b, n)` | CUDA kernel | C++ loop | VERIFIED |
| `graphSimilarity(e, n, d)` | LibTorch `torch::mm` (CUDA) | LibTorch (CPU) | VERIFIED |
| `clusterEmbeddings(v, n, d, k, i)` | LibTorch K-Means (CUDA) | LibTorch (CPU) | VERIFIED |
| `computeCaseEmbedding(w, e, n, d)` | LibTorch weighted sum (CUDA) | LibTorch (CPU) | VERIFIED |
| `bridgeSIMD(json)` | simdjson → GPU pipeline | simdjson → CPU | AVAILABLE |
| `somCache(in, n)` | CUDA device-aware | CPU loop | AVAILABLE |
| `simdJsonParse/Validate/ExtractNumbers` | simdjson SIMD | N/A | AVAILABLE |

### Inactive GPU Paths

| Path | Status | Blocker |
|------|--------|---------|
| TRT-LLM | Image exists (83 GB), not running | WSL2 GPU passthrough needed |
| PyTorch VLM | Planned | No container yet |
| GPU Workers (Python) | Archived | Superseded by current stack |
| gRPC Embedding Server | Code exists | Not started (Ollama fallback works) |

### Build Toolchain (Verified Today)

| Component | Version | Status |
|-----------|---------|--------|
| CUDA Toolkit | 13.0.48 | Installed, nvcc working |
| LibTorch | 2.9.0+cu130 | GPU build (torch_cuda.dll 386 MB) |
| cuDNN | 9.16 | Installed |
| MSVC | 19.42 (VS 2022 Community) | Working |
| CMake | 3.x with presets | 4 presets configured |
| Node.js | 22.17.1 | N-API addon loads |
| RTX 3060 Ti | SM 8.6, 8 GB VRAM | Driver 580.88 |

### CMake Presets (New: `simd-bridge/cpp/CMakePresets.json`)

| Preset | Purpose | Generator |
|--------|---------|-----------|
| `windows-cuda` | Release: SM86 + AVX2 + fast math | VS 2022 x64 |
| `windows-debug` | Debug: CUDA with `-G -lineinfo` | VS 2022 x64 |
| `windows-cpu-only` | Debug without CUDA | VS 2022 x64 |
| `wsl2-cuda` | Linux CUDA under WSL2 | Ninja |

### VS Code Integration (Configured Today)

- `cmake.configureOnOpen: true` — auto-configure on workspace open
- `runOn: folderOpen` task — builds addon if not already built
- 3 C++ debug configurations (Release, Debug, Attach)
- 8 CMake build tasks (configure, build, clean, test, full pipeline)
- `c_cpp_properties.json` with CUDA/LibTorch IntelliSense
- `$msCompile` problem matcher for build errors in Problems panel

---

## 6. Production Readiness Summary

### Green (Production-Ready)

- Core DB (PostgreSQL 16 + pgvector + Drizzle ORM)
- Cache (Redis Stack + L0-L3 hierarchy)
- Vector DB (Qdrant INT8 quantized, 72 collections)
- Message Queue (RabbitMQ, 8 queues, all consumers wired)
- Object Storage (MinIO)
- LLM Inference (Ollama, GPU, gemma4-legal + embeddinggemma)
- Frontend (110 pages, 267+ endpoints, 0 svelte-check errors)
- Builds (vite build passes, Playwright 698/698)
- Auth (358/386 routes guarded, 28 correctly public)
- Zod validation (282/386 routes, remaining use schema imports)

### Yellow (Partial / Environment-Sensitive)

- N-API CUDA addon (built and verified, but PATH-dependent at runtime)
- Client ONNX inference (WebGPU works, WASM fallback, COOP/COEP headers needed for threading)
- Docker profiles (essential/full/gpu defined, active profile not formally captured)
- gRPC embeddings (code exists, Ollama HTTP fallback active and sufficient)
- CouchDB / Neo4j (running, wired, but optional)

### Red (Not Live)

- TRT-LLM (83 GB image, not started, WSL2 GPU passthrough unproven)
- PyTorch VLM container (planned, no container)
- GPU Workers Python container (archived, superseded)
- Langfuse tracing (containers stopped 2 weeks ago)
- Rate limiting in production (in-memory only, no distributed)

---

## 7. Recommended Actions (Priority Order)

### P0 — Disk Space (Critical: 4.2% free)

1. **Remove stopped containers**: `docker container prune` — ~1.3 GB
2. **Remove unused images**: `docker image prune -a` — up to 121 GB
3. **Remove TRT-LLM image** (re-pull when WSL2 is ready): 83 GB
4. **Remove GPU workers image** (superseded): 13 GB
5. **Remove litellm image** (not active): 5.6 GB
6. **Compact WSL2 vhdx**: `wsl --shutdown` then `Optimize-VHD`
7. **Prune Docker build cache**: `docker builder prune` — 758 MB
8. **Prune unused volumes**: `docker volume prune` — up to 18.9 GB (verify first)

### P1 — Runtime Proof Completion

1. Evidence download in browser (API proven, browser flow untested)
2. Capture active Docker compose profile
3. Inference router backend selection logging

### P2 — GPU Acceleration Next Steps

1. Prove WSL2 GPU passthrough for TRT-LLM (10-phase checklist exists)
2. Define PyTorch VLM service contract
3. Complete TS → N-API → C++ cross-language call map
4. Add CUDA startup diagnostics to dev server boot

### P3 — Infrastructure Cleanup

1. Resolve duplicate service containers (phase66-* vs legal-ai-*)
2. Unify health endpoint wording (live vs future vs optional)
3. Enable Langfuse tracing or remove containers
4. Decide CouchDB/Neo4j live role

---

## 8. Files Modified This Session

| File | Change |
|------|--------|
| `simd-bridge/cpp/CMakeLists.txt` | Added `lstm_bridge.cc` to ADDON_SOURCES |
| `simd-bridge/cpp/CMakePresets.json` | **NEW** — 4 configure + 3 build presets |
| `.vscode/settings.json` | cmake.configureOnOpen, CMAKE_EXPORT_COMPILE_COMMANDS, useCMakePresets |
| `.vscode/c_cpp_properties.json` | **NEW** — CUDA + CPU IntelliSense configs |
| `.vscode/launch.json` | Added 3 C++ debug configurations |
| `.vscode/tasks.json` | Added 9 CMake/GPU tasks + auto-build on startup |

---

---

## 9. Data Migration & Volume Audit (April 1–2, 2026)

> **NOTE: HISTORICAL SNAPSHOT** — The 20 volumes below were deleted on April 1, 2026.
> This section documents what was found and exported before cleanup.
> Do NOT use this table for future volume management — run `docker volume ls` for current state.

### Orphan Volume Cleanup Results (COMPLETED)

| Volume | Size | Data Found | Action |
|--------|------|-----------|--------|
| `deeds-web-app_qdrant-data-384` | 4.8 GB | 129,809 error_embeddings (dim=384, AST errors) + 3 phase44_fingerprints | **EXPORTED → deleted** |
| `deeds-web-app_postgres_data` | 200 MB | 46 tables, ALL 0 rows | **SCHEMA ARCHIVED** (in use by container — kept) |
| `deeds-web-app_postgres-data-384` | ~100 MB | DB exists, 0 tables | Deleted |
| `legal_ai_postgres_data` | ~50 MB | 0 tables | Deleted |
| `ingestion-phase66_postgres_data` | ~50 MB | 0 tables | Deleted |
| `deeds-web-app_redis-data-384` | 1.2 GB | Old dump.rdb (ephemeral) | Deleted |
| `deeds-web-app_minio-data-384` | ~small | Old MinIO | Deleted |
| `ollama_data` | 622 MB | Docker Ollama (native is primary) | Deleted |
| `phase76_*` (7 vols) | ~small | Old compose run | Deleted |
| `neo4j_data` + `neo4j_logs` | ~small | Orphan | Deleted |
| **20 volumes removed** | **~8 GB** | |

### Exported Data (`deeds_labs/data-exports/`)

| File | Size | Contents |
|------|------|---------|
| `qdrant-384/error_embeddings_payloads.jsonl` | 42 MB | 129,809 AST error payloads (file, line, error_message, tags, timestamp) |
| `qdrant-384/phase44_fingerprints_payloads.jsonl` | 480 B | 3 code fingerprint records |
| `pg-schemas/postgres_data_schema.sql` | 1,671 lines | Full DDL for 46-table PG17+pgvector schema |

### Volumes KEPT (require decision)

| Volume | Size | Reason |
|--------|------|--------|
| `langfuse-clickhouse-data` | **18 GB** | 20 instrumented call sites ready — keep if activating Langfuse |
| `trt_llm_weights` | **9 GB** | TensorRT engine weights |

---

## 10. Honest Feature Wiring Status

> **Corrected April 2, 2026** — 7 inaccuracies from initial review fixed.
> Principle: "implemented but runtime-down" ≠ "not built". Code-complete features with disabled runtime are PARTIAL, not absent.

### WORKING (end-to-end verified, running in dev)

| Feature | Evidence |
|---------|----------|
| SvelteKit app | 698 Playwright tests, 110 pages, 267 endpoints |
| PostgreSQL + Drizzle | 70+ tables, pgvector HNSW |
| Redis caching | L0-L3 hierarchy, sessions, job state |
| Qdrant vector search | 52+ collections, hybrid BM42+dense |
| Ollama LLM | gemma4-legal + embeddinggemma, GPU |
| Evidence pipeline | 9-stage upload → GPU analysis |
| Chat system | Terminal + SimpleWorkingChat + AIChatWidget |
| RabbitMQ | 8 queues, all consumers wired |
| LibTorch/CUDA addon | 7 GPU functions verified on RTX 3060 Ti |
| LangExtract | Running, called from 6 API routes (evidence upload, POI photos, etc.) |
| RAG pipeline | **7 live endpoints** (`/api/rag/search`, `validate`, `answer`, `unified`, `process`, `documents`, `enhanced`), corrective RAG with query reformulation (threshold 0.5), BM42 hybrid search, ACE enrichment, DAG reordering, 14 active consumer integrations |
| KAG (graph-context) | `graph-context.ts` ACTIVE in SSE chat — 1-hop evidence neighbor traversal via `yorha_evidence_*` tables, glyph-cached (10min TTL), confidence boosting (+0.02/neighbor, max +0.1), ACE evaluation context |

### PARTIAL (code-complete, runtime-down or partially triggered)

| Feature | What Exists | What's Needed to Activate |
|---------|------------|--------------------------|
| Neo4j graph | 12 server files, real Cypher queries, `/api/graph/sync` endpoint, `syncCaseToGraph()` fire-and-forget on glossary-concept saves | More trigger points (case CRUD, evidence upload, POI), UI visualization, GPU acceleration |
| Search orchestrator | 8-adapter fan-out, `/api/search` with 3-tier fallback (gRPC → HTTP → PostgreSQL FTS) | Go binary not running (archived in `deeds_labs/`), `GO_SEARCH_URL` defaults to empty — PG FTS fallback is active |
| Bifrost AI gateway | Docker config, `docker/bifrost/config.json`, code wired in 3 API routes (`ai/chat`, `rag/answer`, `synthesis/generate`), conditional `if (ENV.BIFROST_ENABLED)` | Start container (`docker compose --profile full up bifrost`) + set `BIFROST_ENABLED=true` in `.env` (default is `false` in `env.server.ts`) |
| Langfuse observability | **Instrumented code with disabled runtime**: `traceLLM()`, `traceEmbedding()`, `traceRAG()` across **20 call sites**, zero-overhead no-ops when disabled, lazy SDK initialization | Start Langfuse + ClickHouse containers, set `LANGFUSE_ENABLED=true` + API keys in `.env` (18 GB ClickHouse data volume preserved) |
| Go microservice | **Implemented but not running**: 42 `.go` source files archived in `deeds_labs/archived-dead-code/go-microservice/` (gRPC, HTTP search, RAG, embedding, auth, SIMD, TRT bridges), build scripts preserved | Restore to active directory, build, add to docker-compose. Frontend gracefully degrades via PG FTS when Go is absent |
| KAG (KAGTraverser) | `KAGTraverser.ts` (764 lines): Neo4j error graph traversal, root cause identification, strategy augmentation | Lives in `/lib/services/` (blanket-excluded), 0 active imports — needs move to `/lib/server/` + wiring to error-brain |

### NOT BUILT / ARCHIVED

| Feature | Status |
|---------|--------|
| TRT-LLM on WSL2 | 83 GB image exists, WSL2 GPU passthrough not configured |
| GPU Workers (Python) | 13 GB image, archived in `deeds_labs/`, superseded by native pipeline |
| MCP Server container | 7.2 GB image, not running (MCP server runs in-process via `mcp/server.ts`) |
| Neo4j GPU/CUDA | No GPU graph code (cuGraph/RAPIDS not integrated), standard Cypher only |

---

## 11. Consolidated Roadmap

> **Corrected April 2, 2026** — RAG pipeline and corrective RAG are already live; Bifrost and Langfuse are activation-only tasks.

### Tier 1 — Activate Runtime-Down Features (hours)

1. **Bifrost gateway** — `docker compose --profile full up bifrost` + set `BIFROST_ENABLED=true` in `.env` (code already wired in 3 routes)
2. **Langfuse observability** — start containers, set `LANGFUSE_ENABLED=true` + API keys (20 call sites already instrumented, 18 GB ClickHouse data preserved)

### Tier 2 — Expand Existing Wiring (days)

3. **Neo4j sync triggers** — add `syncCaseToGraph()` calls to case CRUD, evidence upload, POI analysis (currently only fires on glossary-concept saves)
4. **KAGTraverser activation** — move from `/lib/services/` to `/lib/server/`, wire into error-brain UI
5. **ACE error pattern detection** — wire 129K exported error_embeddings into ACE context
6. **Error embeddings re-embed** — 384→768-dim for unified vector search with current collections

### Tier 3 — Build What's Missing (weeks)

7. **FastMCP Docker** — Dockerfile for `mcp/server.ts`, container with restart policy
8. **Go microservice revival** — restore from `deeds_labs/`, build binary, add to docker-compose (PG FTS fallback works in the meantime)
9. **Redis matrix compute** — JSONB serialization for ACE search acceleration
10. **Neo4j UI visualization** — graph explorer component for case relationships

### Tier 4 — GPU Acceleration (WSL2 Docker bridge)

11. **WSL2 GPU passthrough** — Docker Desktop → WSL2 → NVIDIA Container Toolkit
12. **TRT-LLM container** — 83 GB image ready, need WSL2 bridge
13. **GPU-accelerated ingestion** — compressed data → RabbitMQ → GPU worker → Qdrant
14. **Neo4j GPU graph** — cuGraph/RAPIDS for centrality on RTX 3060 Ti

### Tier 5 — Data Optimization

15. **QLoRA distillation** — fine-tune embeddinggemma on legal corpus
16. **Docker image diet** — remove 120 GB unused images
17. **Qdrant binary quantization** — 32x compression for cold collections
18. **PG compressed partitions** — archive old case data

### Data Flow Vision (Current State Annotated)

```
User Query → Client Router (local ONNX or server)        ← WORKING
  ↓
Bifrost Gateway (semantic cache)                          ← PARTIAL (code wired, container not running)
  ↓
RAG Pipeline (corrective reformulation)                   ← WORKING (7 endpoints, 14 consumers)
  ├─ Qdrant hybrid search (BM42 sparse + dense 768-dim)  ← WORKING
  ├─ KAG graph-context (1-hop evidence neighbors)         ← WORKING (SSE chat)
  ├─ Neo4j graph sync (case → graph)                      ← PARTIAL (1 trigger, needs more)
  ├─ Redis matrix compute (ACE pattern matching)          ← NOT BUILT
  └─ FastMCP tools (36 tools, in-process)                 ← WORKING
  ↓
Ollama gemma4-legal (or TRT-LLM when WSL2 ready)         ← WORKING (Ollama) / NOT BUILT (TRT)
  ↓
ACE self-eval → retry if quality < threshold              ← WORKING
  ↓
Langfuse trace → ClickHouse analytics                     ← PARTIAL (instrumented, runtime disabled)
  ↓
Response + user analytics → Neo4j sync                    ← PARTIAL (glossary trigger only)
```

---

## 12. Silent Failure Audit Fixes (This Session)

### Degraded Response Contract (GET → 200 not 500)

12 GET routes fixed across 2 commits:
- `/api/auth/session`, `/api/cases/[id]`, `/api/health/system`, `/api/persons-of-interest/[id]`, `/api/recommendations/[userId]`
- `/api/cartridge/stats`, `/api/cases/[id]/laws`, `/api/cases/[id]/citations`, `/api/persons`, `/api/reports`, `/api/citations/collections/[id]/citations`, `/api/routes/[routeId]/interactions`

### Cache Error Visibility

- `bumpCaseVersion .catch(() => {})` → logs warning (2 call sites in `invalidation.ts`)
- `CachingLayer` Redis get/set/invalidateByTags: silent catch → logs warning (3 sites in `caching-layer.ts`)

### Other Fixes

- ACE self-eval: fake 0.7 scores → 0.5 + descriptive suggestion text
- Recommendations: false `status: 'complete'` → `status: 'failed'` with `retryable: true`
- Dashboard stats: added `_dbDegraded` flag
- Inference router: added backend selection logging
- DLQ message loss: payload logged on DLQ publish failure
- RabbitMQ `publish()`: now throws instead of swallowing errors

---

## 13. Monkey Patch & Runtime Override Audit

### 13a. Global Monkey Patches (10 locations)

| # | File | What | Risk | Notes |
|---|------|------|------|-------|
| 1 | `app.html:34-93` | `global`, `process`, `Buffer` polyfills + WebGPU feature-detect (`window.__webgpuSupported`) | **HIGH** | Runs on every page load. Required for ONNX/WebGPU browser compat. Duplicated in `polyfills.ts` |
| 2 | `lib/ai/onnx/session.ts:36` | `globalThis.require` override (no-op CJS shim) | **HIGH** | Prevents ONNX Runtime `require()` crash in browser. Required — ONNX SDK calls `require('fs')` internally |
| 3 | `lib/polyfills.ts:28-50` | `window.global`, `window.process`, `window.Buffer` | **HIGH** | **Duplicate** of `app.html` polyfills. Both run — wastes parse time, risk of version drift |
| 4 | `lib/shims/commonjs-shim.js:5-16` | `globalThis.global`, `.module`, `.exports`, `.require` | MEDIUM | CJS compat shim. Required by CLAUDE.md — "must be preserved". Guards with `typeof` checks |
| 5 | `bits-overrides.ts:18-32` | `globalThis.__BITS_OVERRIDES__` | MEDIUM | Dev/test component override registry. Lazy-init, no production consumers found |
| 6 | `accessibility-validator.ts:258-260` | `window.accessibilityValidator`, `window.keyboardNavigationHelper` | MEDIUM | Dev tools exposed on window. No production consumers |
| 7 | `n64/parallaxDynamic.js:262,391` | `window.parallaxCleanup`, `window.parallaxDynamic` | MEDIUM | Cleanup/debug handles for N64 parallax effect. Scoped to gaming UI |
| 8 | `api/auth/health/+server.ts:31-55` | `globalThis.__users_ref`, `__sessions_ref`, `__lucia_instance` | LOW | Singleton reference tracking for auth health diagnostic — read-only after first set |
| 9 | `cache.test.ts:308` | `global.fetch = vi.fn()` | LOW | Test-only mock, vitest sandbox |
| 10 | `lib/config/env.ts` | `Object.freeze()` on env config | LOW | Defensive immutability, not a patch |

### Remediation Recommendations

| Priority | Action | Impact |
|----------|--------|--------|
| **P1** | **Deduplicate polyfills**: Remove `polyfills.ts` lines 28-50 (duplicate of `app.html`). Keep `app.html` as single source since it runs before any JS module | Eliminates version drift risk, saves ~1KB parse |
| **P2** | **Guard `bits-overrides.ts`**: Wrap in `if (import.meta.env.DEV)` so the override registry is tree-shaken in production | Zero prod overhead |
| **P3** | **Guard `accessibility-validator.ts`**: Same `import.meta.env.DEV` guard for window property injection | Zero prod overhead |
| **P4** | **Document required shims**: `app.html` polyfills + `commonjs-shim.js` + `onnx/session.ts` require override are all load-bearing. Add inline `// REQUIRED:` comments explaining why | Prevents accidental removal |

### 13b. Langfuse Observability — 27 Active Trace Sites

All sites use zero-overhead no-op wrappers when `LANGFUSE_ENABLED=false` (default). When activated, traces flow to Langfuse server for LLM cost/latency/quality monitoring.

**8 trace wrapper functions** in `lib/server/observability/langfuse.ts` (362 lines):

| Wrapper | Purpose | Consumers | Key Call Sites |
|---------|---------|-----------|----------------|
| `traceLLM` | LLM completions | **12** | ollama.ts, inference-router, ace/self-prompt, summarizer, entity-extraction, nlp/analyzer, llm/ollama-client, gemmaReports, gemmaIntake, ai/chat, synthesis/generate, knowledge/stream, rag/answer |
| `traceEmbedding` | Embedding generation | **9** | batch-embedder, embeddings/ollama, embeddings-simple, ollama-client, multimodal-fusion, sse/chat, evidence/upload, evidence/search, embed, rag/search, knowledge/search |
| `traceDB` | PostgreSQL queries | **1** | db/client.ts (wraps all queries via pool) |
| `traceVectorSearch` | Qdrant searches | **1** | qdrant-manager.ts (wraps all vector queries) |
| `traceQueue` | RabbitMQ pub/consume | **1** | rabbitmq-manager-fixed.ts |
| `traceWorker` | Worker thread tasks | **1** | compute-pool.ts (K-Means, SOM, forensics) |
| `traceCouchDB` | CouchDB operations | **1** | ace/tag-sync.ts |
| `shutdownLangfuse` | Graceful shutdown | **1** | hooks.server.ts (SIGTERM handler) |
| `traceRAG` | RAG pipeline spans | **0** | Defined but **no consumers** — dead code candidate |
| `flushLangfuse` | Flush pending events | **0** | Defined but **no consumers** — dead code candidate |

**Total: 27 active trace sites + 1 shutdown + 2 unused wrappers**

### Data Quality Assessment

| Wrapper | Data Passed | Grade | Enhancement Needed |
|---------|-------------|-------|--------------------|
| `traceLLM` | name, metadata (model/prompt/caseId), usage tokens | **Good** | Add `userId` for per-user cost tracking |
| `traceEmbedding` | text (truncated 200 chars), model, duration | Adequate | Add `batchSize`, `dimensions` |
| `traceDB` | operation, table, row count, duration | Adequate | Add `queryType` (select/insert/update/delete) |
| `traceVectorSearch` | collection, metadata (500 chars), result count, duration | **Good** | Add `topScore` for retrieval quality dashboards |
| `traceQueue` | operation, queue, metadata, duration | **Good** | No changes needed |
| `traceWorker` | task type, metadata, duration | **Good** | Add `threadId` for utilization |
| `traceCouchDB` | operation, db name, duration | Minimal | Add `docId`, `docSize` |
| `traceRAG` | query, metadata, nested span support | **Unused** | Wire to `/api/rag/answer` (currently uses `traceLLM` only) |

### Langfuse Activation Roadmap

**Current state**: 27 trace sites are no-ops. Zero runtime overhead.

**To activate** (new infrastructure required):

1. **Docker services needed** (not in any compose file):
   - ClickHouse: `clickhouse/clickhouse-server:latest` (~1.5 GB image, ~1.5 GB RAM)
   - Langfuse Server: `langfuse/langfuse:latest` (~500 MB image, ~500 MB RAM)

2. **Environment variables**:
   ```
   LANGFUSE_ENABLED=true
   LANGFUSE_PUBLIC_KEY=pk-lf-...
   LANGFUSE_SECRET_KEY=sk-lf-...
   LANGFUSE_HOST=http://localhost:3001
   ```

3. **Estimated cost**: +2 GB RAM, ~3 GB disk, API keys from Langfuse UI

4. **Post-activation enhancements** (P2):
   - Add `userId` to `traceLLM` calls for per-user cost dashboards
   - Wire `traceRAG` to `/api/rag/answer` for full pipeline visibility
   - Add `topScore` to `traceVectorSearch` for retrieval quality monitoring

---

---

## 14. Retrieval & Synthesis Enhancements (April 2, 2026 — Session 2)

### 14a. P0 Phase 1: SSE Chat Retrieval Pipeline

| Enhancement | File | Status |
|------------|------|--------|
| `graphBoostRerank()` — re-rank by +0.15 for graph-connected docs | `api/sse/chat/+server.ts` | COMPLETE |
| Query-time entity extraction — STATUTE/CASE/CA_CODE regex | `api/sse/chat/+server.ts` | COMPLETE |
| DAG ordering — Kahn's topological sort on citation deps | `api/sse/chat/+server.ts` | COMPLETE |
| Vector name fix — `''` → `'content'` for `legal_canon_chunks` | `lib/server/legal/constitution-pipeline.ts` | COMPLETE |
| `knowledge_base` collection added to VECTOR_CONFIG | `lib/server/config/vector-config.ts` | COMPLETE |

**Eval test**: SSE chat returned full legal analysis with corrective RAG reformulation, glossary match, 2 RAG chunks. Entity extraction detected statute references in query.

### 14b. P0b: RabbitMQ Synthesis Worker

**Problem**: Synthesis endpoint was synchronous — ACE context (2-5s) + Ollama LLM (10-60s) + ACE eval blocked a single HTTP request. Bifrost's 30s timeout caused orphaned Ollama requests.

**Solution**: Async publish→consume→poll via RabbitMQ (10th queue: `synthesis.generate`).

| Component | Change |
|-----------|--------|
| `rabbitmq-manager-fixed.ts` | +queue `synthesis.generate`, +consumer `handleSynthesisGenerate`, +publisher `publishSynthesisGenerate` |
| `api/synthesis/generate/+server.ts` | JSON mode → publish to queue, return 202 `{ synthesisId, pollUrl }`. Sync fallback if RabbitMQ down |
| `api/synthesis/evaluation/[id]/+server.ts` | Unified polling: `synthesis:result:{id}` + `synthesis:status:{id}` + `ace:result:{id}` |

**Worker pipeline**: Redis status→generating → assembleACEContext → DAG-order → direct Ollama (5min timeout) → citations → confidence → Redis result → publish ace.evaluate → CouchDB inference log

**Status tracking**: `pending` → `generating` → `complete`/`failed` (Redis, 1hr TTL)

### 14c. Bifrost Timeout Root Cause

`routeInference()` chain: TRT → Bifrost → Ollama. Bifrost Go server ignores `default_request_timeout` config (both top-level and `network_config`). Hard-coded 30s timeout → 504, but Ollama continues processing → orphaned GPU request blocks queue.

**Mitigation**: Synthesis worker bypasses Bifrost entirely (direct Ollama). SSE chat was never affected.

### 14d. CouchDB Inference Log

`src/lib/server/observability/inference-log.ts` — buffered CouchDB writes (flush at 50 entries or 5s). Wired into RabbitMQ synthesis worker. Remaining: wire into SSE chat, RAG pipeline, Qdrant manager.

### 14e. Updated RabbitMQ Queue Inventory

| # | Queue | Exchange | Routing Key | Consumer | Status |
|---|-------|----------|-------------|----------|--------|
| 1 | cache.invalidate | cache.events | cache.invalidate | handleCacheInvalidate | ACTIVE |
| 2 | document.embed | document.processing | document.embed | handleDocumentEmbed | ACTIVE |
| 3 | evidence.process | document.processing | evidence.process | handleEvidenceProcess | ACTIVE |
| 4 | vector.index | document.processing | vector.index | handleVectorIndex | ACTIVE |
| 5 | chat.context | chat.events | chat.context | handleChatContext | ACTIVE |
| 6 | analytics.track | analytics.events | analytics.track | handleAnalyticsTrack | ACTIVE |
| 7 | codebase.index | document.processing | codebase.index | handleCodebaseIndex | ACTIVE |
| 8 | ace.evaluate | document.processing | ace.evaluate | handleACEEvaluate | ACTIVE |
| 9 | error.embed | document.processing | error.embed | handleErrorEmbed | ACTIVE |
| 10 | **synthesis.generate** | document.processing | synthesis.generate | **handleSynthesisGenerate** | **NEW** |

*Updated: April 2, 2026 — Section 14 added (retrieval enhancements, RabbitMQ synthesis worker, Bifrost diagnosis, inference logging)*