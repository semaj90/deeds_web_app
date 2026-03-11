# CUDA Audit & GPU Wiring Recommendations

## Last Updated: March 9, 2026

**Hardware**: NVIDIA RTX 3060 Ti (8GB GDDR6, 4864 CUDA cores, SM 8.6 Ampere, 256-bit bus, ~448 GB/s)
**LibTorch**: 2.9.0+cu130 (CUDA 13.0 runtime)
**Node Runtime**: N-API addon (`tensorrt_bridge.node`) via CMake

---

## 1. Current GPU Kernel Audit

### 1.1 `graphSimilarity()` — Cosine Similarity Matrix

**File**: `simd-bridge/cpp/libtorch_graph.cc:31-62`

**What it does**:
```
Input:  float[n][dim] flat array
1. Copy to GPU tensor → torch::from_blob().to(device)
2. L2-normalize rows: mat / mat.norm(2, dim=1, keepdim=True)
3. torch::mm(normalized, normalized.t()) → n×n similarity
4. Copy back to CPU: sim.to(kCPU).contiguous()
Output: float[n*n] flat similarity matrix
```

**Audit findings**:
- **Correct**: L2 normalize + matmul is the optimal GPU pattern for cosine similarity (1 kernel fusion)
- **Issue — Unnecessary copy**: `torch::from_blob()` wraps existing memory, but `.to(device)` copies host→device every call. For repeated queries on the same data, this is wasteful.
- **Issue — No FP16 option**: Always uses FP32. On SM 8.6, FP16 matmul via Tensor Cores would be ~2x faster with negligible precision loss for cosine similarity.
- **Issue — No batch size guard**: For n=10000 embeddings of dim=768, the output matrix alone is 10000² × 4B = 381 MB. Combined with input tensor and normalized copy, this could exceed 8GB VRAM.
- **Issue — No stream management**: Uses default CUDA stream. If Ollama is running simultaneously, they contend for the same stream.

**Recommendations**:
1. Add a max-N guard (e.g., 4096 embeddings → output = 64MB, safe for 8GB)
2. For n > 4096, process in tiles: split into blocks, compute similarity sub-matrices
3. Add FP16 option: `mat.to(torch::kFloat16)` before normalize + matmul, then cast result back to FP32
4. Consider `torch::cuda::getCurrentCUDAStream()` with explicit stream for isolation from Ollama

### 1.2 `clusterEmbeddings()` — GPU K-Means

**File**: `simd-bridge/cpp/libtorch_graph.cc:69-126`

**What it does**:
```
Input:  float[n][dim], k clusters, max_iters
1. Copy data to GPU
2. Initialize centroids: first k points (NO k-means++)
3. Loop max_iters:
   a. Expand diff = data[n,1,dim] - centroids[1,k,dim]  → [n,k,dim]
   b. dists = diff.pow(2).sum(2)  → [n,k]
   c. assignments = dists.argmin(1)  → [n]
   d. Convergence check: torch::equal(old, new)
   e. Update centroids: per-cluster mean via indexing
Output: int[n] cluster assignments
```

**Audit findings**:
- **Critical — Memory explosion**: The `data.unsqueeze(1) - centroids.unsqueeze(0)` creates a [n, k, dim] tensor. For n=5000, k=15, dim=768: that's 5000 × 15 × 768 × 4B = **220 MB per iteration**. This is the #1 VRAM risk.
- **Issue — No k-means++ init**: Uses first-k-points initialization, which is degenerate for clustered data. The CPU fallback (topic-cluster.ts) uses proper k-means++ with D(x)² seeding.
- **Issue — Serial centroid update**: The for-loop `for (int c = 0; c < k; c++)` with `data.index({mask}).mean(0)` is k sequential GPU kernels. This should be a single `scatter_mean` or equivalent.
- **Issue — No empty cluster handling**: If a cluster loses all members, `data.index({mask})` returns empty tensor, and `.mean(0)` produces NaN centroid.

**Recommendations**:
1. Replace broadcasting distance with cdist: `torch::cdist(data, centroids)` — uses memory-efficient fused kernel
2. Replace serial centroid update with `torch::zeros` + `scatter_add_` + divide by counts (single pass)
3. Add k-means++ initialization on GPU (sample proportional to D²)
4. Guard VRAM: for n×k×dim > threshold (e.g., 100M floats), fall back to batched computation
5. Handle empty clusters: re-seed from farthest point

### 1.3 `computeCaseEmbedding()` — Weighted Average

**File**: `simd-bridge/cpp/libtorch_graph.cc:133-171`

**What it does**:
```
Input:  float[n] weights, float[n][dim] embeddings
1. Copy both to GPU
2. Normalize weights: w / sum(w)
3. torch::mm(w_norm.unsqueeze(0), mat)  → [1, dim]
4. L2 normalize result
5. Copy back to CPU
Output: float[dim] weighted embedding
```

**Audit findings**:
- **Correct**: This is well-implemented. `torch::mm` for a 1×n × n×dim matmul is efficient.
- **Issue — Overhead for small n**: For n < ~50 embeddings, the GPU launch overhead + host↔device copy exceeds the computation time. The CPU JS fallback is actually faster for small inputs.
- **Minor — No in-place ops**: Could use `div_()` instead of `result = result / norm` to avoid allocation.

**Recommendations**:
1. Add a threshold in the TS bridge: only use GPU path when n × dim > 50000 (e.g., 65 embeddings × 768 dim)
2. Use `torch::NoGradGuard` to disable autograd tracking (reduces memory overhead)

### 1.4 `checkCudaAvailable()` — Device Check

**File**: `simd-bridge/cpp/libtorch_graph.cc:177-179`

**No issues**. Simple `torch::cuda::is_available()` wrapper.

---

## 2. N-API Bridge Audit

**File**: `simd-bridge/cpp/binding.cc`

**Findings**:
- **Correct**: Uses raw N-API (not node-addon-api C++ wrappers) for minimal overhead
- **Correct**: TypedArray zero-copy for input data — `napi_get_typedarray_info` gives direct pointer
- **Issue — Synchronous execution**: All GPU calls block the Node.js main thread. For large inputs (n > 1000), this can cause event loop stalls.
- **Issue — No error detail**: Return codes (-1, -2, -3) provide no detail about the failure cause

**Recommendations**:
1. For production, consider wrapping GPU calls in `napi_create_async_work` to avoid blocking the event loop
2. Add error message propagation: catch exception `.what()` string and pass to `napi_throw_error`

---

## 3. CMake Build Audit

**File**: `simd-bridge/cpp/CMakeLists.txt`

**Findings**:
- **Correct**: `CMAKE_CUDA_ARCHITECTURES "86"` matches RTX 3060 Ti (SM 8.6)
- **Correct**: Conditional LibTorch — stubs when unavailable
- **Issue**: `som_cache.cu` and `lstm_gpu.cu` are listed as sources but may not exist or be relevant
- **Issue**: No build optimization flags (`-O2`, `-DNDEBUG` for Release builds)

**Build command** (from CODEBASE_MAP.md Recommendations):
```bash
cd simd-bridge
cmake -B build -DCMAKE_PREFIX_PATH=../libtorch-win-shared-with-deps-2.9.0+cu130/libtorch -DCMAKE_BUILD_TYPE=Release
cmake --build build --config Release
```

---

## 4. VRAM Budget Analysis

### Current VRAM Usage (Steady State)

| Component | VRAM | Notes |
|-----------|------|-------|
| Ollama gemma3-legal | ~5.2 GB | Q4_K_M quantized, always loaded |
| Ollama embeddinggemma | ~0.6 GB | BF16, always loaded |
| CUDA context overhead | ~0.3 GB | Driver + cuDNN + LibTorch caching allocator |
| **Total steady** | **~6.1 GB** | Leaves ~1.9 GB for GPU ops |

### Per-Operation VRAM Cost

| Operation | Input Size | Peak VRAM | Safe? |
|-----------|-----------|-----------|-------|
| `graphSimilarity` n=100, dim=768 | 300 KB | ~40 MB | YES |
| `graphSimilarity` n=1000, dim=768 | 3 MB | ~8 MB output + ~6 MB normalized | YES |
| `graphSimilarity` n=5000, dim=768 | 15 MB | ~100 MB output + ~30 MB work | MARGINAL |
| `graphSimilarity` n=10000, dim=768 | 30 MB | ~400 MB output | NO — exceeds 1.9GB budget |
| `clusterEmbeddings` n=1000, k=15, dim=768 | 3 MB | **~45 MB diff tensor** per iter | YES |
| `clusterEmbeddings` n=5000, k=15, dim=768 | 15 MB | **~220 MB diff tensor** per iter | MARGINAL |
| `computeCaseEmbedding` n=50, dim=768 | 150 KB | ~1 MB | YES |

### Recommended Safety Limits

```
graphSimilarity:     max n = 3000 (output = 36 MB)
clusterEmbeddings:   max n = 3000, max k = 30 (diff tensor = ~270 MB)
computeCaseEmbedding: max n = 5000 (always safe)
```

---

## 5. Wiring-Specific Recommendations

### 5.1 topic-cluster.ts → `clusterEmbeddings()`

**Current wiring**: `fit()` calls `clusterEmbeddings()`, checks `source === 'gpu'`, derives centroids + silhouette from GPU assignments.

**Audit concern**: The GPU k-means uses first-k-points init (no k-means++), so GPU clustering quality may be worse than the CPU fallback. For production use, the quality difference matters when computing silhouette scores for topic modeling.

**Recommendation**: Accept GPU assignments only when n > 500 (where GPU speed advantage outweighs init quality). For n < 500, the CPU k-means++ (with proper seeding) will converge to better clusters in <100ms anyway.

### 5.2 kmeans-service.ts → `clusterEmbeddings()`

**Current wiring**: `runKMeans()` tries GPU first, derives centroids from assignments.

**Audit concern**: Same k-means++ init issue. Additionally, this service clusters statutes (typically n < 200), where GPU overhead exceeds benefit.

**Recommendation**: Add a minimum-n threshold: only try GPU when `centroids.length > 300`. For typical statute clustering (n=50-200), CPU is faster.

### 5.3 qdrant-manager.ts → `graphSimilarity()` via `rerankWithGPU()`

**Current wiring**: New method takes search results + query embedding, builds [query + results] matrix, computes similarity via GPU.

**Audit concern**: Qdrant search typically returns 10-50 results. For n=51 (50 results + 1 query), the GPU launch overhead (~2ms) exceeds the computation time (~0.1ms for 51×51 matrix). GPU reranking only helps with n > ~200.

**Recommendation**: Add threshold: only use GPU when `results.length > 100`. For typical search results (10-50), the CPU cosine in libtorch-bridge.ts CPU fallback is faster.

### 5.4 multimodal-fusion.ts → `computeCaseEmbedding()`

**Current wiring**: Embeds each VLM/OCR/entity signal separately (3 Ollama calls), then GPU-fuses with weights.

**Audit concern**: The GPU fusion is fast (~0.5ms), but the 3 separate Ollama embedding calls add ~300ms total (vs ~100ms for 1 concatenated call). Net effect: **3x slower** for a marginal quality improvement.

**Recommendation**: Only use GPU fusion path when caller provides pre-computed embeddings (e.g., from cache). When generating fresh embeddings, the text-concat path (1 Ollama call) is better.

### 5.5 multi-modal-ranker.ts → `graphSimilarity()`

**Current wiring**: Precomputes NxN similarity matrix for all candidates, uses it for novelty scoring.

**Audit concern**: This is the **best GPU wiring target**. Ranking typically processes 50-200 candidates. The NxN similarity matrix is computed once and used N times in the loop, amortizing the GPU overhead. CPU serial cosine for 200 candidates = 200×200/2 = 20K operations.

**Recommendation**: This wiring is well-suited. Consider caching the similarity matrix in Redis (key: hash of candidate IDs) with 5min TTL for repeat queries.

### 5.6 similar-cases.service.ts → `graphSimilarity()`

**Current wiring**: Implemented the TODO stub with Qdrant vector search + GPU reranking.

**Audit concern**: Similar to qdrant-manager reranking — the limit is typically 5-10 similar cases, too few for GPU benefit. However, the implementation also queries Qdrant with `with_vector: true`, which adds significant payload to the response.

**Recommendation**: For small limit (< 20), skip GPU reranking and use Qdrant scores directly. For larger similarity searches (e.g., batch processing), the GPU path is beneficial.

---

## 6. Performance Optimization Roadmap

### Phase 1: Safety Guards (Low effort, high impact)

Add VRAM safety checks to the TS bridge (`libtorch-bridge.ts`):

```typescript
// Before calling GPU, check input size against VRAM budget
const MAX_SIMILARITY_N = 3000;
const MAX_CLUSTER_N = 3000;
const MIN_GPU_THRESHOLD = 100; // Don't bother with GPU for tiny inputs
```

### Phase 2: FP16 Matmul (Medium effort, high impact)

Modify `graphSimilarity` in `libtorch_graph.cc`:
```cpp
// Cast to FP16 for Tensor Core acceleration on SM 8.6
auto mat_fp16 = mat.to(torch::kFloat16);
auto norms = mat_fp16.norm(2, 1, true).clamp_min(1e-7f);
auto normalized = mat_fp16 / norms;
auto sim = torch::mm(normalized, normalized.t()).to(torch::kFloat32);
```
Expected speedup: ~2x for n > 500 (Tensor Cores kick in).

### Phase 3: Batched K-Means (Medium effort, medium impact)

Replace broadcasting distance with `torch::cdist`:
```cpp
auto dists = torch::cdist(data, centroids); // [n, k] — memory efficient
```
This avoids the O(n×k×dim) intermediate tensor.

### Phase 4: Async N-API (High effort, high impact)

Wrap GPU operations in `napi_create_async_work` to avoid blocking the Node.js event loop. This is critical for production where GPU operations take >10ms.

### Phase 5: Tensor Caching (High effort, high impact)

Store frequently-computed similarity matrices in Redis:
```
Key: gpu:sim:{hash(embedding_ids)}
Value: Float32Array[n*n] (msgpack or protobuf serialized)
TTL: 24h, invalidated on new evidence upload
```

---

## 7. CUDA Best Practices Reference

### Memory Hierarchy (fast → slow)

| Memory | Latency | Size (RTX 3060 Ti) | Use Case |
|--------|---------|---------------------|----------|
| Registers | 1 cycle | 65536 per SM | Thread-local variables |
| Shared Memory | ~5 cycles | 48-100 KB per SM | Block-cooperative data |
| L1 Cache | ~30 cycles | 128 KB per SM | Automatic caching |
| L2 Cache | ~200 cycles | 4 MB total | Cross-SM caching |
| Global Memory (VRAM) | ~400 cycles | 8 GB | Tensors, model weights |
| System Memory (PCIe) | ~10000 cycles | 32+ GB | Host↔Device transfers |

### Data Transfer Optimization

- **Pinned Memory**: `cudaHostAlloc()` → ~12 GB/s on PCIe Gen3 vs ~3 GB/s for pageable memory
- **Minimize transfers**: Keep intermediate results on GPU between operations
- **Batch transfers**: One large copy > many small copies
- **Async copies**: Use `cudaMemcpyAsync()` with streams to overlap compute and transfer

### Precision Trade-offs (SM 8.6 Tensor Cores)

| Precision | Throughput (TFLOPS) | Memory/element | Use Case |
|-----------|--------------------:|---------------:|----------|
| FP32 | 21.7 | 4 bytes | Default, exact matmul |
| FP16 | 43.5 | 2 bytes | Cosine similarity, embeddings |
| INT8 | 174.0 | 1 byte | Quantized inference |
| TF32 | 43.5 | 4 bytes (internal 19-bit) | PyTorch default since Ampere |

### LibTorch-Specific Tips

- **Caching allocator**: LibTorch reserves GPU memory and reuses it. `nvidia-smi` shows reserved, not used.
- **`torch::NoGradGuard`**: Disable autograd for inference-only ops (saves ~30% memory)
- **`torch::cuda::synchronize()`**: Only call when timing; adds overhead otherwise
- **`torch::from_blob()`**: Zero-copy tensor from existing memory (no allocation)
- **`mat.to(device)`**: Always copies. For repeated ops, keep tensors on GPU.

---

## 8. Sources

### NVIDIA CUDA Documentation
- [CUDA C++ Best Practices Guide (Release 13.1)](https://docs.nvidia.com/cuda/cuda-c-best-practices-guide/)
- [CUDA Compute Capability](https://developer.nvidia.com/cuda/gpus)

### PyTorch / LibTorch
- [PyTorch CUDA Semantics](https://docs.pytorch.org/docs/stable/notes/cuda.html)
- [Using the PyTorch C++ Frontend](https://docs.pytorch.org/tutorials/advanced/cpp_frontend.html)
- [Custom C++ and CUDA Extensions](https://docs.pytorch.org/tutorials/advanced/cpp_extension.html)
- [PyTorch GPU Memory Issue](https://github.com/pytorch/pytorch/issues/104564)
- [LibTorch Memory Usage](https://github.com/pytorch/pytorch/issues/17095)

### GPU K-Means
- [Large Scale K-means using GPUs (Springer)](https://link.springer.com/article/10.1007/s10618-022-00869-6)
- [torch_kmeans — GPU K-Means for PyTorch](https://github.com/jokofa/torch_kmeans)
- [kmcuda — K-means/K-nn on NVIDIA GPU](https://github.com/src-d/kmcuda)

### Node.js GPU
- [Native GPU for Node.js (2025)](https://github.com/toviszsolt/nodejs-native-gpu)
- [GPU Accelerating Node.js (NVIDIA Blog)](https://developer.nvidia.com/blog/gpu-accelerating-node-js-javascript-for-visualization-and-beyond/)
- [Node.js 22 CUDA ML Inference Guide](https://markaicode.com/nodejs-22-gpu-cuda-ml-inference/)

### RTX 3060 Ti Performance
- [RTX 3060 Ti Ollama Benchmarks](https://www.databasemart.com/blog/ollama-gpu-benchmark-rtx3060ti)
- [RTX 3060 vs 3060 Ti AI Comparison](https://www.bestgpusforai.com/gpu-comparison/3060-vs-3060-ti)
- [Optimizing LLMs for 8GB GPU](https://www.sitepoint.com/optimizing-local-llms-low-end-hardware-8gb/)
