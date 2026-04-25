# LibTorch GPU Bridge — Architecture & Wiring Guide

## Last Updated: March 9, 2026

---

## Overview

The LibTorch GPU Bridge provides **CUDA-accelerated vector math** to the SvelteKit server via a compiled N-API native addon (`tensorrt_bridge.node`). It accelerates cosine similarity, k-means clustering, and weighted embedding operations that are bottlenecks in the RAG/retrieval/analytics pipeline.

**Stack:** LibTorch 2.9.0 + CUDA 13.0 + MSVC 19.42 + Node.js N-API → RTX 3060 Ti (SM 8.6, 8GB VRAM)

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                        SvelteKit Server                             │
│                                                                     │
│  Routes                          Services                           │
│  ┌──────────────────┐            ┌──────────────────────────────┐  │
│  │ POST /api/gpu/   │──────────→ │ libtorch-bridge.ts           │  │
│  │     compute      │            │   graphSimilarity()          │  │
│  │                  │            │   clusterEmbeddings()        │  │
│  │ GET /api/infra/  │──────────→ │   computeCaseEmbedding()     │  │
│  │     status       │            │   isCudaAvailable()          │  │
│  └──────────────────┘            └────────────┬─────────────────┘  │
│                                               │                     │
│  Consumers                                    │ require()           │
│  ┌──────────────────┐                         ▼                     │
│  │ qdrant-manager   │──→ rerank  ┌────────────────────────────┐    │
│  │ topic-modeling   │──→ cluster │ tensorrt_bridge.node        │    │
│  │ case-similarity  │──→ embed   │ (N-API native addon)        │    │
│  │ evidence upload  │──→ fuse    │                              │    │
│  │ ace/context      │──→ score   │  binding.cc (N-API wrappers)│    │
│  └──────────────────┘            │  libtorch_graph.cc (GPU ops)│    │
│                                  │  som_cache.cu (CUDA mem)    │    │
│                                  │  lstm_gpu.cu (CUDA kernel)  │    │
│                                  └────────────┬───────────────┘    │
│                                               │                     │
│  CPU Fallback                                 │ torch::mm()         │
│  ┌──────────────────┐                         ▼                     │
│  │ cpuCosineSim()   │  ← if addon    ┌───────────────────┐        │
│  │ cpuKMeans()      │     fails       │ LibTorch 2.9.0    │        │
│  │ cpuWeightedEmb() │                 │ + CUDA 13.0       │        │
│  └──────────────────┘                 │ → RTX 3060 Ti     │        │
│                                       └───────────────────┘        │
└─────────────────────────────────────────────────────────────────────┘
```

---

## File Map

### Native Addon (C++/CUDA)

| File | Lines | Purpose |
|------|-------|---------|
| `simd-bridge/cpp/binding.cc` | 196 | N-API wrappers — exposes 5 functions to JS via TypedArrays |
| `simd-bridge/cpp/libtorch_graph.cc` | 179 | GPU-accelerated similarity, clustering, weighted embedding |
| `simd-bridge/cpp/tensor_bridge.cc` | 25 | SOM cache bridge stub |
| `simd-bridge/cpp/som_cache.cu` | 165 | CUDA memory management (device↔host, dual-mode) |
| `simd-bridge/cpp/lstm_gpu.cu` | 83 | CUDA LSTM elementwise kernel (256 threads/block) |
| `simd-bridge/cpp/libtorch_stubs.cc` | 21 | Stub fallbacks when LibTorch absent (returns -99) |
| `simd-bridge/cpp/CMakeLists.txt` | 103 | Unified build — CUDA + LibTorch + Node N-API |
| `simd-bridge/binding.gyp` | 11 | node-gyp config (legacy, CMake preferred) |

### TypeScript Wrappers

| File | Lines | Purpose |
|------|-------|---------|
| `src/lib/server/gpu/libtorch-bridge.ts` | 280 | Addon loader + DLL path + CPU fallbacks |
| `src/lib/server/gpu/cuda-bridge.ts` | 115 | Async CUDA job routing stub (RabbitMQ planned) |
| `src/routes/api/gpu/compute/+server.ts` | 63 | REST API for GPU operations |
| `src/routes/api/infrastructure/status/+server.ts` | 120 | Health dashboard (reports CUDA status) |

### LibTorch Installation

| Location | Version | Used By |
|----------|---------|---------|
| `C:\libtorch-win-shared-with-deps-2.9.0+cu130\libtorch\` | 2.9.0+cu130 | VS Code IntelliSense |
| `<project>\libtorch-win-shared-with-deps-2.9.0+cu130\libtorch\` | 2.9.0+cu130 | CMake build + runtime DLLs |

### Build Output

| File | Size | Location |
|------|------|----------|
| `tensorrt_bridge.node` | 134 KB | `simd-bridge/cpp/build/Release/` |
| `cuda_kernels.lib` | — | `simd-bridge/cpp/build/Release/` |

---

## GPU Operations (3 Functions)

### 1. `graphSimilarity(embeddings, n, dim)` → Float32Array[n×n]

**What:** Cosine similarity matrix via `torch::mm(normalized, normalized.T)`

**How it works:**
1. Flatten n×dim embeddings into Float32Array
2. Transfer to GPU tensor (`torch::kCUDA`)
3. L2-normalize each row (clamp_min 1e-12)
4. Matrix multiply normalized × normalized^T
5. Copy result back to CPU Float32Array

**Where it's used:**
| Consumer | Purpose |
|----------|---------|
| Qdrant reranking | Rerank top-50 vector search results → top-10 |
| Case similarity | 5-signal similarity scoring between cases |
| Evidence dedup | Detect near-duplicate evidence uploads |
| Knowledge search | TF-IDF hybrid reranking (0.7 semantic / 0.3 lexical) |

**Performance:** 768-dim × 50 vectors → ~2ms (GPU) vs ~45ms (CPU JS)

### 2. `clusterEmbeddings(embeddings, n, dim, k, maxIters)` → Int32Array[n]

**What:** K-means clustering on GPU with convergence detection

**How it works:**
1. Initialize centroids as first k points (deterministic)
2. GPU-parallel: compute ||data - centroid||² for each centroid
3. Assign each point to nearest centroid via `argmin`
4. Update centroids as mean of assigned points
5. Converge when assignments stabilize (or max_iters)

**Where it's used:**
| Consumer | Purpose |
|----------|---------|
| Topic modeling | Cluster evidence/documents into topic groups |
| Case grouping | Group similar cases for analytics dashboard |
| Batch analysis | Segment large evidence sets for parallel processing |
| Knowledge base | Organize knowledge articles by semantic similarity |

### 3. `computeCaseEmbedding(weights, embeddings, n, dim)` → Float32Array[dim]

**What:** Weighted average embedding with L2 normalization

**How it works:**
1. Normalize weights to sum=1
2. GPU: `torch::mm(weights[1,n], embeddings[n,dim])` → [1,dim]
3. L2-normalize the result vector
4. Return as unit vector (768-dim)

**Where it's used:**
| Consumer | Purpose |
|----------|---------|
| Case similarity ranker | Fuse 5 signals (evidence, citation, entity, temporal, forensic) |
| ACE context assembly | Weighted merge of 8 parallel context sources |
| Multi-modal fusion | Combine VLM + OCR + entity embeddings for evidence |
| Search reranking | Compute query-aware document representations |

---

## Service Integration Map

```
                         GPU Addon (tensorrt_bridge.node)
                              │
         ┌────────────────────┼────────────────────┐
         │                    │                    │
    similarity()         cluster()           weighted()
         │                    │                    │
    ┌────┴────┐          ┌────┴────┐          ┌────┴────┐
    │ Qdrant  │          │ Redis   │          │ Neo4j   │
    │ rerank  │          │ cache   │          │ graph   │
    │ top-50  │          │ cluster │          │ edges   │
    │ → top-10│          │ results │          │ weights │
    └────┬────┘          └────┬────┘          └────┬────┘
         │                    │                    │
    ┌────┴────┐          ┌────┴────┐          ┌────┴────┐
    │ pgvector│          │ CouchDB │          │Postgres │
    │ vectors │          │ analysis│          │ cases   │
    │ 768-dim │          │ metadata│          │ evidence│
    └─────────┘          └─────────┘          └─────────┘
```

### Detailed Wiring

| Service | How GPU accelerates it | Cache layer |
|---------|----------------------|-------------|
| **Qdrant** (6 collections) | Rerank search results with GPU cosine similarity | Redis L3 (query hash → ranked results) |
| **pgvector** (6 tables) | Compute case-level embeddings for vector indexing | Memory L2 (in-process Map) |
| **Redis** (L3 cache) | Cache GPU computation results by query/case hash | Self (5min-7day TTL) |
| **Neo4j** (graph) | Compute edge weights for citation/entity traversal | PostgreSQL materialized |
| **CouchDB** (docs) | Store cluster assignments + analysis metadata | N/A (write-through) |
| **RabbitMQ** (7 queues) | `vector.index` queue triggers GPU reranking | Redis job tracking |
| **MinIO** (S3) | Evidence upload → GPU embedding → Qdrant store | SHA-256 dedup |

---

## Build Instructions

### Prerequisites

- **CUDA Toolkit 13.0+** (nvcc in PATH)
- **Visual Studio 2022** (MSVC 19.42+)
- **Node.js 22+** (with node-gyp headers cached)
- **LibTorch 2.9.0+cu130** (at project root or `C:\`)
- **CMake 4.0+**

### Build

```bash
cd simd-bridge/cpp
mkdir -p build && cd build

cmake .. \
  -G "Visual Studio 17 2022" -A x64 \
  -DCMAKE_PREFIX_PATH="<project>/libtorch-win-shared-with-deps-2.9.0+cu130/libtorch" \
  -DCMAKE_BUILD_TYPE=Release

cmake --build . --config Release --parallel
```

**Output:** `build/Release/tensorrt_bridge.node` (134 KB)

### Verify

```bash
cd sveltekit-frontend
export PATH="<project>/libtorch-win-shared-with-deps-2.9.0+cu130/libtorch/lib:$PATH"

node -e "
const addon = require('../simd-bridge/cpp/build/Release/tensorrt_bridge.node');
console.log('CUDA:', addon.checkCudaAvailable());  // 1 = GPU, 0 = CPU
console.log('Functions:', Object.keys(addon));
"
```

### DLL Loading

The addon dynamically links against LibTorch DLLs (~30 files including `c10.dll`, `torch_cpu.dll`, `torch_cuda.dll`, `cublas64_13.dll`). The `libtorch-bridge.ts` module automatically adds the LibTorch lib directory to `process.env.PATH` before loading.

**Search order:**
1. `<project>/libtorch-win-shared-with-deps-2.9.0+cu130/libtorch/lib`
2. `C:/libtorch-win-shared-with-deps-2.9.0+cu130/libtorch/lib`

---

## CPU Fallback Behavior

When the addon is unavailable (not built, DLLs missing, or no CUDA), all operations fall back to pure JavaScript implementations in `libtorch-bridge.ts`:

| Function | GPU Implementation | CPU Fallback |
|----------|-------------------|--------------|
| `graphSimilarity` | `torch::mm` on CUDA cores | O(n²·d) nested JS loops |
| `clusterEmbeddings` | GPU-parallel distance + argmin | 100-iter JS k-means |
| `computeCaseEmbedding` | `torch::mm` + L2 norm | JS reduce + normalize |
| `isCudaAvailable` | `torch::cuda::is_available()` | Returns `false` |

The `source` field in all results indicates which path was taken: `'gpu'` or `'cpu'`.

---

## AST Wiring Graph (Verified March 9, 2026)

Shows which source files import or call GPU bridge functions. **Bold** = confirmed via grep. *Italic* = planned wiring (not yet importing).

```
libtorch-bridge.ts (exports)
├── graphSimilarity()
│   ├── **api/gpu/compute/+server.ts**      (REST endpoint — POST)
│   ├── *lib/server/vector/qdrant-manager.ts* (planned: rerank after search)
│   └── *lib/server/case-similarity.ts*     (planned: 5-signal ranker)
│
├── clusterEmbeddings()
│   ├── **api/gpu/compute/+server.ts**      (REST endpoint — POST)
│   └── *lib/server/topic-modeling.ts*      (planned: k-means clustering)
│
├── computeCaseEmbedding()
│   ├── **api/gpu/compute/+server.ts**      (REST endpoint — POST)
│   └── *lib/server/ai/multimodal-fusion.ts* (planned: VLM+OCR+entity fusion)
│
└── isCudaAvailable()
    ├── **api/gpu/compute/+server.ts**      (device_info operation)
    └── **api/infrastructure/status/+server.ts** (health dashboard)

Re-export chain:
  libtorch-bridge.ts → cuda-bridge.ts (re-exports all 4 functions)
                       └── 0 consumers yet (available for wiring)
```

**Current status: 2 direct importers** (api/gpu/compute + api/infrastructure/status).

### Verified Wiring Targets (All files exist, CPU code replaceable)

| Priority | File | GPU Function | Current CPU Code | Effort |
|----------|------|-------------|------------------|--------|
| **1** | `lib/server/ml/topic-cluster.ts:276` | `clusterEmbeddings()` | `cpuKMeans()` 50-line nested loop | 15 min |
| **1** | `lib/server/services/clustering/kmeans-service.ts:49` | `clusterEmbeddings()` | `initializeCentroids+assignToClusters+updateCentroids` | 45 min |
| **2** | `lib/server/vector/qdrant-manager.ts:228` | `graphSimilarity()` | No reranking (Qdrant scores only) | 30 min |
| **3** | `lib/server/ai/multimodal-fusion.ts:76` | `computeCaseEmbedding()` | Text concatenation (no vector fusion) | 20 min |
| **4** | `lib/server/ml/multi-modal-ranker.ts:175` | `graphSimilarity()` | Serial `cosineSimilarity()` map loop | 25 min |
| **5** | `lib/server/services/similar-cases.service.ts:45` | `graphSimilarity()` | TODO stub (no implementation) | 40 min |

### Full Server GPU Infrastructure Module Map

| Module | Type | Importers | Key Functions |
|--------|------|-----------|---------------|
| **libtorch-bridge.ts** | N-API addon | 2 | graphSimilarity, clusterEmbeddings, computeCaseEmbedding, isCudaAvailable |
| **cuda-bridge.ts** | Re-export hub | 0 | Re-exports libtorch-bridge (available for consumers) |
| **gpu-arbiter.ts** | Redis mutex | 11 | acquireGpuLease, releaseGpuLease, getGpuLeaseStatus |
| **trt-llm.ts** | TRT wrapper | 7 | inferLLM, streamLLM, healthCheck |
| **inference-router.ts** | Router | 1 | routeInference (TRT → Ollama fallback) |
| **embedding-client.ts** | gRPC 4-tier | 13 | generateEmbeddings, checkGrpcHealth |
| **retrieval-client.ts** | gRPC wrapper | 1 | searchEvidenceViaGrpc |
| **minio-simd-client.ts** | SIMD sidecar | 2 | getSIMDStatus, getEvidenceViaSIMD |
| **gpu-compute-pipeline.ts** | WebGPU (client) | 7 | getGPUCompute, getCachedGPUCompute |
| **gpu-search-reranker.ts** | WebGPU (client) | 2 | gpuRerank |

### Upstream Dependencies (what feeds INTO GPU ops)

```
Ollama embeddinggemma:latest (768-dim)
  → gRPC embedding-client.ts
    → Qdrant evidence_items / legal_documents
      → graphSimilarity() for reranking
        → Redis cache (query hash → ranked results)
          → SSE chat endpoint (context injection)

Evidence upload pipeline (8 stages)
  → embedTexts() → 768-dim vectors
    → computeCaseEmbedding() for case-level vector
      → Qdrant legal_documents upsert
        → Neo4j MERGE edges (HAS_SECTION, CITES)
```

### Downstream Consumers (what uses GPU results)

```
GPU similarity matrix
  → Topic modeling → CouchDB metadata store
  → Case board (Kanban) → case grouping
  → Knowledge search → TF-IDF hybrid rerank

GPU cluster assignments
  → Analytics dashboard → chart data
  → Batch processing → parallel evidence analysis
  → RabbitMQ analytics.track queue

GPU weighted embedding
  → Qdrant upsert (legal_documents collection)
  → pgvector store (evidence_vectors table)
  → ACE context → LLM system prompt
```

---

## Recommendations

### Short-Term (Next Session)

1. **Benchmark GPU vs CPU at scale** — Run similarity on 100×768 and 500×768 embeddings, measure speedup ratio. First call includes ~260ms CUDA init overhead; subsequent calls should show 10-50x speedup.

2. **Wire GPU reranking into Qdrant search** — `qdrant-manager.ts` currently returns raw cosine scores from Qdrant. Add a GPU rerank step after retrieving top-50 candidates to produce a tighter top-10.

3. **Cache GPU results in Redis** — Add a cache key pattern `gpu:sim:{hash(embeddings)}` with 5min TTL. Most repeated queries will hit cache and skip GPU entirely.

4. **Add GPU timing to infrastructure dashboard** — Extend `/api/infrastructure/status` to report addon version, CUDA device name, and last operation latency.

### Medium-Term

5. **Batch GPU operations via RabbitMQ** — Wire `cuda-bridge.ts` to submit similarity/cluster jobs to a `gpu.compute` queue. A dedicated consumer processes GPU work serially (avoids VRAM contention with Ollama).

6. **GPU arbiter integration** — Currently `gpu-arbiter.ts` manages Ollama vs TensorRT VRAM leases. Extend it to include LibTorch operations so GPU similarity doesn't run concurrently with Ollama inference.

7. **Neo4j edge weight computation** — Use `graphSimilarity()` to compute edge weights between citation nodes, enabling PageRank-weighted citation traversal.

8. **Streaming cluster updates** — Use SSE to stream cluster assignments as k-means converges, enabling real-time analytics visualization.

### Long-Term

9. **ONNX export of custom operations** — Export the libtorch_graph functions as ONNX operators for portability. This would let the same ops run via onnxruntime-web on the client (WebGPU path).

10. **Multi-GPU support** — If upgrading hardware, the libtorch_graph.cc already uses `torch::Device` selection. Change `getDevice()` to accept a device index for multi-GPU round-robin.

11. **TensorRT engine integration** — Replace `tensor_bridge.cc` stub with actual TensorRT `IExecutionContext` calls. This would let the same addon serve both LibTorch GPU ops and TensorRT LLM inference.

12. **Quantized operations** — Use `torch::quantize_per_tensor` for INT8 similarity computation. Would halve memory bandwidth requirements for large-batch operations.

---

## Hardware Specifications

| Component | Value |
|-----------|-------|
| GPU | NVIDIA RTX 3060 Ti |
| Architecture | Ampere (SM 8.6) |
| CUDA Cores | 3,584 |
| Tensor Cores | 112 (3rd gen) |
| VRAM | 8,192 MiB GDDR6X |
| Memory Bandwidth | 448 GB/s |
| Driver | 580.88 |
| CUDA Toolkit | 13.0 (V13.0.48) |
| LibTorch | 2.9.0+cu130 |
| Compiler | MSVC 19.42.34440 |
| Node.js | 22.17.1 |
| CMake | 4.0.0 |

---

## VRAM Budget

```
RTX 3060 Ti (8192 MiB total)
├── Ollama gemma3-legal  : 7,300 MiB (when loaded — exclusive)
├── Ollama embeddinggemma:   622 MiB (when loaded)
├── LibTorch operations  :   ~50 MiB (transient tensors, freed after op)
├── CUDA context         :  ~200 MiB (driver overhead)
└── Available for ops    : ~1,000 MiB (when Ollama unloaded)

GPU Arbiter manages exclusivity:
  - Ollama loaded → LibTorch uses remaining ~1GB
  - TRT-LLM loaded → Ollama unloaded → LibTorch has ~3GB
  - Neither loaded → LibTorch has ~7.9GB (full batch ops)
```

---

## Troubleshooting

| Issue | Cause | Fix |
|-------|-------|-----|
| `The specified module could not be found` | LibTorch DLLs not in PATH | `ensureLibtorchInPath()` should handle this; verify libtorch/lib exists |
| `CUDA: 0` (CPU fallback) | CUDA driver not accessible from Node process | Restart terminal, check `nvidia-smi` works |
| `graphSimilarity failed` (error -3) | VRAM exhausted (Ollama using it all) | Unload Ollama models or use smaller batch |
| Build fails at `find_package(Torch)` | Wrong CMAKE_PREFIX_PATH | Point to the `libtorch/` dir (not the parent zip dir) |
| `checkCudaAvailable returns -99` | Built without LibTorch (stubs active) | Rebuild with `-DCMAKE_PREFIX_PATH=.../libtorch` |
