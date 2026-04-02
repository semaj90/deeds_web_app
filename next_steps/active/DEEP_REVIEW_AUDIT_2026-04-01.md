# Deep Review Audit — April 1, 2026

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
| gemma3-legal Q4_K_M | `gemma3Q4_K_M/` | 7.38 GB | Unsloth fine-tuned LLM (GGUF) | ACTIVE — Ollama |
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
| **LLM Inference** | Ollama (native, GPU) | RUNNING | gemma3-legal Q4_K_M on RTX 3060 Ti |
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
- LLM Inference (Ollama, GPU, gemma3-legal + embeddinggemma)
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

### Orphan Volume Cleanup Results

| Volume | Size | Data Found | Action |
|--------|------|-----------|--------|
| `deeds-web-app_qdrant-data-384` | 4.8 GB | 129,809 error_embeddings (dim=384, AST errors) + 3 phase44_fingerprints | **EXPORTED → deleted** |
| `deeds-web-app_postgres_data` | 200 MB | 46 tables, ALL 0 rows | **SCHEMA ARCHIVED** (in use by container) |
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
| `langfuse-clickhouse-data` | **18 GB** | Real traces — keep if wiring Langfuse |
| `trt_llm_weights` | **9 GB** | TensorRT engine weights |

---

## 10. Honest Feature Wiring Status

### WORKING (end-to-end verified)

| Feature | Evidence |
|---------|----------|
| SvelteKit app | 698 Playwright tests, 110 pages, 267 endpoints |
| PostgreSQL + Drizzle | 70+ tables, pgvector HNSW |
| Redis caching | L0-L3 hierarchy, sessions, job state |
| Qdrant vector search | 52+ collections, hybrid BM42+dense |
| Ollama LLM | gemma3-legal + embeddinggemma, GPU |
| Evidence pipeline | 9-stage upload → GPU analysis |
| Chat system | Terminal + SimpleWorkingChat + AIChatWidget |
| RabbitMQ | 8 queues, all consumers wired |
| LibTorch/CUDA addon | 3 GPU functions verified on RTX 3060 Ti |
| LangExtract | Running, called from evidence upload + POI photos |

### PARTIAL (code exists, needs wiring)

| Feature | What Exists | What's Missing |
|---------|------------|---------------|
| Neo4j graph | 12 server files, Cypher queries | Sync triggers, UI, GPU acceleration |
| Search orchestrator | 8-adapter fan-out | Go binary archived, URL empty |
| Bifrost gateway | Docker config + code done | `BIFROST_ENABLED=true` |
| RAG pipeline | `rag-pipeline.ts` with corrective RAG | **0 consumers** |
| Langfuse | `traceLLM()` wraps all LLM calls | Disabled, ClickHouse stopped |

### NOT BUILT / ARCHIVED

| Feature | Status |
|---------|--------|
| Go microservice | All `.go` archived to `deeds_labs/` |
| TRT-LLM on WSL2 | 83 GB image, WSL2 GPU passthrough not configured |
| GPU Workers (Python) | 13 GB image, archived, superseded |
| MCP Server container | 7.2 GB image, not running |
| Neo4j GPU/CUDA | No GPU graph code, standard Cypher only |
| KAG module | Concept only, no dedicated module |

---

## 11. Consolidated Roadmap

### Tier 1 — Wire What Exists (days)

1. **Neo4j user analytics + recommendations** — wire sync triggers on case/evidence CRUD
2. **Langfuse observability** — `LANGFUSE_ENABLED=true`, restart ClickHouse
3. **Bifrost gateway** — `docker compose --profile full up bifrost` + enable
4. **RAG pipeline wiring** — replace direct Ollama calls with `rag-pipeline.ts`

### Tier 2 — Build What's Missing (weeks)

5. **FastMCP Docker** — Dockerfile for `mcp/server.ts`, container with restart
6. **ACE error pattern detection** — wire 129K error_embeddings into ACE context
7. **Error embeddings re-embed** — 768-dim for unified vector search
8. **Corrective RAG** — wire query reformulation path
9. **Redis matrix compute** — JSONB serialization for ACE search acceleration

### Tier 3 — GPU Acceleration (WSL2 Docker bridge)

10. **WSL2 GPU passthrough** — Docker Desktop → WSL2 → NVIDIA Container Toolkit
11. **TRT-LLM container** — 83 GB image ready, need WSL2 bridge
12. **GPU-accelerated ingestion** — compressed data → RabbitMQ → GPU worker → Qdrant
13. **Neo4j GPU graph** — cuGraph/RAPIDS for centrality on RTX 3060 Ti

### Tier 4 — Data Optimization

14. **QLoRA distillation** — fine-tune embeddinggemma on legal corpus
15. **Docker image diet** — remove 120 GB unused images
16. **Qdrant binary quantization** — 32x compression for cold collections
17. **PG compressed partitions** — archive old case data

### Data Flow Vision

```
User Query → Client Router (local ONNX or server)
  ↓
Bifrost Gateway (semantic cache)
  ↓
RAG Pipeline (corrective reformulation)
  ├─ Qdrant hybrid search (BM42 sparse + dense 768-dim)
  ├─ Neo4j graph traversal (centrality + recommendations)
  ├─ Redis matrix compute (ACE pattern matching)
  └─ FastMCP tools (web_search, codebase analysis)
  ↓
Ollama gemma3-legal (or TRT-LLM when WSL2 ready)
  ↓
ACE self-eval → retry if quality < threshold
  ↓
Langfuse trace → ClickHouse analytics
  ↓
Response + user analytics → Neo4j sync
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

*Updated: April 2, 2026 — Data migration, volume audit, feature status, consolidated roadmap*