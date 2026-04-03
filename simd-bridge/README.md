# SIMD Bridge — Native GPU/SIMD Addon for Legal AI Platform

## Status: WORKING (38/38 eval tests pass)

| Component | Status | Detail |
|-----------|--------|--------|
| CUDA (RTX 3060 Ti) | **ACTIVE** | SM 8.6, `TORCH_CUDA_ARCH_LIST=8.6`, CUDA 13.0 |
| LibTorch | **ACTIVE** | 2.9.0+cu130, NoGradGuard, 4-thread intra-op |
| simdjson | **ACTIVE** | **AVX-512 (Ice Lake)** auto-detected at runtime |
| CUDA buffer pool | **ACTIVE** | Thread-local, grow-only, zero per-call malloc |
| Node.js N-API | **ACTIVE** | 14 exports, TypedArray zero-copy interface |

---

## Architecture

```
Node.js (SvelteKit SSR)
  │
  ├─ libtorch-bridge.ts ──── graphSimilarity, clusterEmbeddings, computeCaseEmbedding
  │    └─ CPU fallback        lstmAdd, somCache, dotProduct, scale, relu, isCudaAvailable
  │
  ├─ simdjson-bridge.ts ──── fastJsonParse (LRU cache), fastJsonValidate, fastJsonExtractNumbers
  │    └─ JSON.parse fallback  isSimdJsonAvailable, simdJsonBackend
  │
  ├─ cuda-bridge.ts ───────── submitCudaCompute, getCudaDeviceInfo (re-exports above)
  │
  └─ background-analyzer.ts ─ analyzeEvidenceGpu, triggerEvidenceGpuAnalysis (fire-and-forget)
        │
        ▼
  tensorrt_bridge.node  ◄── This addon (N-API, C++17, CUDA)
        │
        ├─ libtorch_graph.cc ── LibTorch CUDA: similarity, k-means, weighted embedding
        ├─ lstm_gpu.cu ──────── CUDA kernels: add, dot, scale, relu (buffer pool)
        ├─ som_cache.cu ─────── SOM copy/transform kernel (device-aware)
        ├─ simdjson_bridge.cc ── simdjson: parse, validate, extractNumbers, backend
        ├─ tensor_bridge.cc ──── JSON→float→SOM pipeline
        └─ binding.cc ──────── N-API module init (14 exports)
```

---

## API Routes Using This Addon

| Route | Methods | What It Does |
|-------|---------|-------------|
| `/api/gpu/compute` | POST | similarity, cluster, weighted_embedding, device_info |
| `/api/health/gpu` | GET | CUDA check + 10x768 benchmark |
| `/api/evidence/[id]/gpu-analysis` | GET/POST | Cached/fresh GPU evidence analysis |
| `/api/infrastructure/status` | GET | CUDA availability in infra report |
| `/api/codebase-index/stats` | GET | simdjson fast parse for index stats |
| `/api/codebase-index/graph` | GET | simdjson fast parse for graph data |
| `/api/codebase-index/analyze` | POST | simdjson fast parse for analysis payload |

---

## Build

### Prerequisites
- Visual Studio 2022 (MSVC 19.42+)
- CUDA Toolkit 13.0
- LibTorch 2.9.0+cu130 at `C:/libtorch-win-shared-with-deps-2.9.0+cu130/libtorch`
- Node.js 22+ with node-gyp headers cached

### Configure + Build
```powershell
# Clean configure (uses CMakePresets.json "windows-cuda" preset)
cmake --preset windows-cuda

# Or manual:
cmake -DCMAKE_BUILD_TYPE=Release ^
  -DCMAKE_PREFIX_PATH=C:/libtorch-win-shared-with-deps-2.9.0+cu130/libtorch ^
  -DTORCH_CUDA_ARCH_LIST=8.6 ^
  "-DCMAKE_CUDA_FLAGS=-use_fast_math -lineinfo" ^
  "-DCMAKE_CXX_FLAGS_RELEASE=/O2 /arch:AVX2" ^
  -S simd-bridge/cpp -B simd-bridge/cpp/build ^
  -G "Visual Studio 17 2022" -A x64

# Build
cmake --build simd-bridge/cpp/build --config Release
```

### Test
```powershell
$env:PATH = "C:\libtorch-win-shared-with-deps-2.9.0+cu130\libtorch\lib;" + $env:PATH
node simd-bridge/cpp/test-addon.cjs
# Expected: 38 passed, 0 failed
```

---

## Performance (RTX 3060 Ti, CUDA 13.0)

| Operation | Workload | Time |
|-----------|----------|------|
| dotProduct | 10K floats | 0.21ms |
| graphSimilarity | 50x768 embeddings | 20ms |
| clusterEmbeddings | 200x128, k=5 | 11ms |
| simdJsonParse | 230KB (10K keys) | 2.6ms |

---

## Enhancements Applied (2026-04-01)

### Done
- [x] `TORCH_CUDA_ARCH_LIST=8.6` — PyTorch honors GPU target (was ignored via CMAKE_CUDA_ARCHITECTURES)
- [x] `torch::NoGradGuard` on all 3 LibTorch GPU functions — ~10-15% inference speedup
- [x] Lazy `set_num_threads(4)` / `set_num_interop_threads(2)` — prevents LibTorch from starving Node.js event loop
- [x] CUDA buffer pool (`CudaBuffer` struct, thread-local) — eliminates cudaMalloc/cudaFree per kernel call
- [x] `simdJsonBackend()` diagnostic — reports runtime SIMD level (confirmed: AVX-512 Ice Lake)
- [x] 38-test eval suite with assertions, edge cases, error handling, and perf benchmarks

---

## Roadmap: Next Enhancements

### Tier 1 — Codebase Indexing Integration
**Goal**: GPU-accelerated codebase indexing for ACE analysis and production readiness audit.

| Enhancement | Files Involved | Impact |
|-------------|---------------|--------|
| **simdjson for Qdrant response parsing** | `qdrant-manager.ts`, `simdjson-bridge.ts` | 3-5x faster vector search result deserialization |
| **GPU batch embedding comparison** | `gpu-embedding-bridge.ts` → addon | Offload cosine similarity to CUDA instead of CPU loops |
| **Codebase chunk clustering** | `/api/codebase-index/analyze` → `clusterEmbeddings` | GPU k-means on code embeddings for topic discovery |
| **AST graph similarity** | `graphSimilarity` + Neo4j export | Cross-file structural similarity via GPU cosine matrix |

### Tier 2 — GPU-Accelerated Ingestion Pipeline
**Goal**: RabbitMQ `document.embed` queue → GPU batch processing → compressed storage.

| Enhancement | Status | Detail |
|-------------|--------|--------|
| **Batch embedding on GPU** | PLANNED | Accumulate N docs from RabbitMQ → single GPU embedding call |
| **Compressed vector storage** | PLANNED | INT8 quantized Qdrant + pgvector halfvec already done |
| **TRT-LLM inference** | STOPPED | 83GB Docker image exists, needs WSL2 GPU passthrough |
| **GPU worker container** | STOPPED | 13GB image, needs Docker Compose `gpu` profile |

### Tier 3 — TRT-LLM via WSL2 Docker
**Goal**: Linux-only TensorRT-LLM for high-throughput inference.

```
Windows (native) ──── WSL2 (Ubuntu) ──── Docker (GPU passthrough)
  │                     │                    │
  SvelteKit app         nvidia-docker2       TRT-LLM container
  LibTorch addon        CUDA toolkit         Gemma3 INT4 engine
  Ollama (native)       GPU passthrough      Port 8099
```

**Prerequisites not yet done:**
- [ ] WSL2 nvidia-docker2 GPU passthrough configuration
- [ ] TRT-LLM container restart with current model weights
- [ ] Health check integration (`TENSORRT_URL` already wired in env)
- [ ] Fallback chain: TRT-LLM → Ollama (code exists in trt-llm.ts)

### Tier 4 — Neo4j User Analytics + Recommendations
**Goal**: Graph-based user behavior tracking and content recommendations.

| Component | Status | What's Needed |
|-----------|--------|--------------|
| Neo4j Community | RUNNING | Standard Cypher, no GPU |
| User analytics sync | WIRED | 12 server files import Neo4j |
| Graph centrality | REAL | Cypher-based PageRank/betweenness |
| GPU graph compute | NEVER BUILT | Would need NVIDIA cuGraph or custom CUDA kernels |
| Recommendation engine | PARTIAL | ACE context enrichment exists, needs graph features |

### Tier 5 — Data Migration + Compression
**Goal**: Audit, merge, compress historical data across Docker volumes.

| Volume | Size | Action |
|--------|------|--------|
| `postgres-data-384` | ~2GB | **AUDIT** — Contains legal_ai_db, langfuse, postgres DBs |
| `qdrant-data-384` | 4.8GB | **KEEP** — 4 unique collections not migrated |
| `redis-data-384` | 1.2GB | **REVIEW** — Old session/cache dump |
| `neo4j-data-384` | ~540MB | **COMPARE** — Check if active Neo4j has same data |
| `langfuse-clickhouse` | 18GB | **DECIDE** — Langfuse never wired, traces from old sessions |
| `trt_llm_weights` | 9GB | **KEEP** — TRT model weights (not recreatable without re-export) |

**Migration strategy:**
1. Audit each PG cluster with `pg_isready -U legal_admin -d legal_ai_db`
2. Use PG16 image (not PG17) — clusters were created with PG16
3. `pg_dump` unique tables → merge into native postgres.exe
4. Compress Qdrant snapshots → MinIO cold storage
5. Delete empty/duplicate volumes after verification

---

## Honest Status — What This Addon Connects To

### WORKING (end-to-end verified)
- **LibTorch CUDA addon** → 3 GPU functions on RTX 3060 Ti (this repo)
- **simdjson AVX-512** → JSON parsing at native SIMD speed
- **SvelteKit API routes** → 7 routes consume the addon
- **TS bridge wrappers** → 4 files with full CPU fallbacks
- **Evidence GPU analysis** → Fire-and-forget background analyzer
- **Codebase index** → simdjson fast parse for stats/graph/analyze

### WIRED BUT NOT GPU-ACCELERATED
- **Neo4j graph queries** — Standard Cypher, no CUDA/cuGraph
- **Search orchestrator** — 8-adapter fan-out, but Go service URL is empty
- **Corrective RAG** — Query reformulation code exists, rag-pipeline.ts has zero consumers

### STOPPED / NEEDS WSL2
- **TRT-LLM** — Docker image exists, TENSORRT_URL wired, needs WSL2 GPU passthrough
- **GPU workers** — Docker image exists, needs Compose `gpu` profile
- **MCP server** — Docker image exists, FastMCP tools in code, container not running

### CONCEPT ONLY
- **KAG** — Prompt engineering in courtroom sim, no dedicated module
- **DAG executor** — Topological sort for fix priority, not a workflow engine
- **Neo4j GPU** — No GPU graph code exists anywhere

---

## File Map

```
simd-bridge/
├── cpp/
│   ├── CMakeLists.txt          # Build config (CUDA + LibTorch + simdjson + N-API)
│   ├── CMakePresets.json        # 4 presets: windows-cuda, debug, cpu-only, wsl2
│   ├── binding.cc              # N-API module init (14 exports)
│   ├── libtorch_graph.cc       # LibTorch: similarity, k-means, weighted embedding
│   ├── lstm_bridge.cc          # C bridge: CUDA kernel dispatch
│   ├── lstm_gpu.cu             # CUDA kernels: add, dot, scale, relu + buffer pool
│   ├── som_cache.cu            # SOM cache kernel (device-aware)
│   ├── tensor_bridge.cc        # JSON→float→SOM pipeline
│   ├── simdjson_bridge.cc      # simdjson: parse, validate, extract, backend
│   ├── libtorch_stubs.cc       # Stubs for non-CUDA builds
│   ├── vendor/simdjson.{h,cpp} # Vendored simdjson (single-header)
│   ├── test-addon.cjs          # 38-test eval suite
│   └── build/Release/
│       └── tensorrt_bridge.node  # Built addon (291KB)
├── binding.gyp                 # node-gyp config (alternative build)
└── README.md                   # This file

sveltekit-frontend/src/lib/server/gpu/
├── libtorch-bridge.ts          # TS wrapper: 8 GPU functions + CPU fallbacks
├── simdjson-bridge.ts          # TS wrapper: JSON parse/validate + LRU cache
├── cuda-bridge.ts              # Re-exports + device info + background analysis
└── background-analyzer.ts      # Fire-and-forget evidence/POI GPU analysis
```
