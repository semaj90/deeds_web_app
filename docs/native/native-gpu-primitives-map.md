# GPU Primitives Map — simd-bridge

> **Purpose**: Reference for which native library handles which compute primitive.
> Each layer is independently optional. Missing layers fall back to stubs or the
> layer below. No layer depends on a higher layer.

---

## Layer Stack (bottom → top)

```
┌─────────────────────────────────────────────────────────────────────┐
│  WebGPU (browser lane, experimental)                                │
│  WGSL compute shaders, WebGPU API — browser-only, no CUDA          │
├─────────────────────────────────────────────────────────────────────┤
│  LibTorch 2.9.0+cu130  (high-level tensor wrapper)                 │
│  torch::mm, torch::softmax, torch::topk, FP16 half tensor ops      │
│  autograd, broadcasting, device management — wraps cuBLAS/cuDNN    │
├─────────────────────────────────────────────────────────────────────┤
│  cuDNN 9.x  (fused neural op graphs)                               │
│  SDPA / FlashAttention, fused normalization, conv fusion            │
│  Optional if CUDNN_ROOT or a known install path is present         │
├─────────────────────────────────────────────────────────────────────┤
│  cuVS  (ANN / vector search / clustering)                          │
│  CAGRA graph-ANN (best recall >0.95 for 768-dim)                   │
│  IVF-PQ, IVF-RaBitQ (2.7× faster than IVF-PQ, no reranking)       │
│  Requires RAPIDS conda: conda install -c rapidsai cuvs-cu13        │
├─────────────────────────────────────────────────────────────────────┤
│  CUTLASS 3.x  (custom tiled GEMM, header-only)                     │
│  FP16/BF16/INT8 TensorCore MMA tiles (SM80+)                       │
│  Used when custom tile configs beat cuBLAS heuristic               │
├─────────────────────────────────────────────────────────────────────┤
│  cuBLAS / cuBLASLt  (GEMM / cosine / rerank)                       │
│  cuBLAS: SGEMM, DGEMM batch matmul                                 │
│  cuBLASLt: FP16/BF16 matmul heuristic, epilogue fusions            │
│  Used for: cosine similarity, embedding rerank, attention GEMM     │
├─────────────────────────────────────────────────────────────────────┤
│  CUDA Runtime  (streams, graphs, memory, kernel launches)          │
│  cudaStream_t, CUDA Graph capture/replay, cudaMalloc/Free          │
│  cudaMemcpyAsync, cudaEventRecord — required for any GPU work      │
└─────────────────────────────────────────────────────────────────────┘
                    ↕  FALLBACK (CPU stubs)
┌─────────────────────────────────────────────────────────────────────┐
│  graph_fallback_stubs.cpp  (CPU fallback layer)                    │
│  graphSimilarity, graphSimilarityHalf, batchCosineSimilarity,      │
│  computeCaseEmbedding, clusterEmbeddings (naive k-means),          │
│  pageRankGPU (power iteration), attentionScoreGPU stubs            │
│  Compiled when LibTorch unavailable AND SIMD_ENABLE_FALLBACK_STUBS │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Primitives by Operation

### GEMM / Matrix Multiply

| Operation | Primary | Fallback |
|-----------|---------|---------|
| FP32 SGEMM | cuBLAS `cublasSgemm` | CPU loop (graph_fallback_stubs) |
| FP16 HGEMM | cuBLASLt `cublasLtMatmul` | LibTorch `torch::mm(half)` |
| BF16 matmul | cuBLASLt epilogue fusion | LibTorch `torch::mm(bfloat16)` |
| Custom tile | CUTLASS 3.x TensorCore MMA | cuBLASLt |
| Batched matmul | cuBLAS `cublasSgemmBatched` | LibTorch `torch::bmm` |

### Cosine Similarity / Rerank

| Operation | Primary | Fallback |
|-----------|---------|---------|
| Single query vs N corpus | cuBLAS SGEMV + norm | `batchCosineSimilarity` CPU stub |
| FP16 batch cosine | `batchCosineSimilarity_fp16` (LibTorch half) | FP32 SGEMV |
| Pairwise N×N similarity | `graphSimilarity` (LibTorch) | `graphSimilarity` CPU stub |

### Attention / Scoring

| Operation | Primary | Fallback |
|-----------|---------|---------|
| Scaled dot-product attention FP32 | `attentionScoreGPU` (LibTorch) | CPU stub |
| Scaled dot-product attention FP16 | `attentionScoreGPU_fp16` (LibTorch half) | FP32 variant |
| SDPA fused (FlashAttention) | cuDNN 9.x (Linux only) | LibTorch unfused SDPA |
| GRPO reward scoring FP16 | `rewardScoreGPU_fp16` (LibTorch half) | `rewardScoreGPU` FP32 |

### ANN / Vector Search / Clustering

| Operation | Primary | Fallback |
|-----------|---------|---------|
| Graph ANN (recall >0.95) | cuVS CAGRA | Qdrant HNSW (external) |
| IVF clustering search | cuVS IVF-RaBitQ → IVF-PQ | Qdrant IVF (external) |
| K-means clustering | `kmeansWithCentroids` (LibTorch CUDA) | CPU stub (graph_fallback_stubs) |
| SOM topology | `trainSOM` (LibTorch) + `som_cache.cu` | `somCache` CPU path |

### Graph Analytics

| Operation | Primary | Fallback |
|-----------|---------|---------|
| PageRank (n≤2000) | `pageRankGPU` (LibTorch sparse) | CPU power-iteration stub |
| Embedding autoencoder | `autoencoderEncode/Decode` (LibTorch) | Identity passthrough |
| PCA projection | `pcaProject` (LibTorch SVD) | No CPU stub — returns error |

### CUDA Graphs / Streams

| Operation | Library | Notes |
|-----------|---------|-------|
| Graph capture | CUDA Runtime | `cuda_graph_bridge.cu` |
| Graph replay | CUDA Runtime | `replayGraph`, `replayGraphOnStream` |
| 4-stream round-robin pool | CUDA Runtime | `STREAM_POOL_SIZE=4`, ~50μs saved/turn |
| Async memcpy | CUDA Runtime | cudaMemcpyAsync on captured streams |

### JSON Parsing

| Operation | Library | Fallback |
|-----------|---------|---------|
| SIMD JSON parse (AVX2) | simdjson (vendor) | V8 JSON.parse |
| Float64Array extraction | simdjson zero-copy | parse + JS loop |
| Validation pre-check | simdjson `validate()` | Always true |

---

## CMake Feature Flags

| Flag | Default | Controls |
|------|---------|---------|
| `SIMD_ENABLE_CUDA` | ON | CUDA compiler, streams, graph bridge, SOM/LSTM kernels |
| `SIMD_ENABLE_CUBLAS` | ON | cuBLAS SGEMM, cosine GEMV kernels |
| `SIMD_ENABLE_CUBLASLT` | ON | FP16/BF16 matmul heuristic via cuBLASLt |
| `SIMD_ENABLE_LIBTORCH` | ON | pytorch_graph.cc, pytorch_graph_fp16.cc, libtorch_graph_impl.cpp |
| `SIMD_ENABLE_CUDNN` | OFF | cuDNN fused ops (Linux/WSL2 only) |
| `SIMD_ENABLE_CUVS` | OFF | cuvs_bridge.cc CAGRA/IVF — requires RAPIDS |
| `SIMD_ENABLE_CUTLASS` | OFF | CUTLASS 3.x header-only GEMM tiles |
| `SIMD_ENABLE_FALLBACK_STUBS` | ON | graph_fallback_stubs.cpp always compiled when LibTorch absent |

---

## Preset Matrix

| Preset | CUDA | cuBLAS | LibTorch | cuDNN | cuVS | CUTLASS | Use Case |
|--------|------|--------|----------|-------|------|---------|---------|
| `windows-x64-fallback` | OFF | OFF | OFF | OFF | OFF | OFF | CI, no GPU |
| `windows-x64-cuda-runtime` | ON | OFF | OFF | OFF | OFF | OFF | streams/graphs only |
| `windows-x64-cuda-cublas` | ON | ON | OFF | OFF | OFF | OFF | GEMM/cosine, no LibTorch |
| `windows-x64-cuda-libtorch` | ON | ON | ON | OFF | OFF | OFF | full tensor ops (default) |
| `windows-cuda` | ON | ON | ON | OFF | OFF | OFF | production default |
| `windows-cuda-cuvs` | ON | ON | ON | OFF | ON | OFF | + CAGRA ANN |
| `wsl2-cuda` | ON | ON | ON | ON | ON | OFF | Docker/Linux |

---

## WebGPU Lane (Browser Only)

WebGPU is a **separate compute lane** — it does NOT share code with the N-API native addon.

```
Browser → WebGPU API (Dawn/WGSL)
  ├─ src/lib/gpu/ — WGSL compute shaders (reranker, embedding norm)
  ├─ src/lib/ai/onnx/ — ONNX Runtime WebGPU backend
  └─ static/embeddinggemma_300m_onnx/ — 768-dim client-side embedding
```

WebGPU cannot access cudart, cuBLAS, cuVS, or any CUDA resource. It operates
entirely within the browser sandbox. Use it only for client-side inference
(local embedding, re-rank preview). All serious GPU work routes through the
N-API native addon (`tensorrt_bridge.node`) on the Node.js server.

---

## Platform Matrix

| Library | Windows Native | WSL2/Docker | Notes |
|---------|---------------|-------------|-------|
| CUDA Runtime | ✅ | ✅ | Needs driver ≥ 530 |
| cuBLAS | ✅ | ✅ | Bundled with CUDA Toolkit |
| cuBLASLt | ✅ | ✅ | SM80+ for FP16 epilogue |
| LibTorch | ✅ (2.9.0+cu130) | ✅ | Download from pytorch.org |
| cuDNN 9.x | ⚠️ optional | ✅ | Detect via CUDNN_ROOT or known install path |
| cuVS CAGRA | ⚠️ limited | ✅ | RAPIDS conda, best on Linux |
| CUTLASS 3.x | ✅ (header-only) | ✅ | git clone NVIDIA/cutlass |
| simdjson | ✅ | ✅ | vendor/simdjson.cpp bundled |

---

*Last updated: 2026-05-31 — Phase H GPU capability matrix*
