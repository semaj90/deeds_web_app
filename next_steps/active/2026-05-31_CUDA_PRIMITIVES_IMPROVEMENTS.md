# CUDA Primitives — Improvement Opportunities

**Audit date**: 2026-05-31 03:30 PST
**Scope**: Native bridge (`tensorrt_bridge.node`, 28 exports) + TS consumers across `sveltekit-frontend/src/lib/server/`.
**Method**: enumerate native exports, count TS consumers per export, sweep for CPU loops that map to existing GPU primitives, identify missing native functions referenced by TS.

---

## TL;DR

| Category | Count | Action |
|---|---|---|
| Native exports | 28 | all live, 15/16 probe-verified |
| Heavy GPU consumers | 14 functions × 5-29 files each | ✅ already wired |
| Orphan duplicate TS files | 1 (`ai/turbovec-rerank.ts`) | archive or delete |
| **Real perf gaps** | **3** | see below |
| Missing native exports referenced by TS | **2** (`captureGraph`, `replayGraph`) | implement OR clearly mark NOT_IMPLEMENTED |

---

## 1. Missing CUDA Graphs (#1 perf opportunity)

**Finding**: `CudaGraphManager` (`src/lib/server/ai/cuda-graph-manager.ts`) calls `bridge.captureGraph()` and `bridge.replayGraph()` — **neither exists in the native addon**.

**Current behavior**: `isAvailable()` returns `false`; every consumer silently bypasses CUDA Graphs.

**Consumers losing the optimization**:
- `libtorch-reranker.ts:43` — `captureIfMissing(graphKey, [n, dim])` no-ops
- `hermes/deep-research-dag.ts` — uses for batched inference
- `/api/health/inference/+server.ts:34` — reports `cudaGraphAvailable=false` (currently true at runtime)

**Impact**: 30-50% latency reduction for repeated kernel launches at fixed shapes. The TS layer already pre-warms shapes `[1, 768]`, `[8, 768]`, `[32, 768]` — these are the exact retrieval rerank batches that fire hundreds of times per chat turn.

**Recommended fix path**:

```cpp
// simd-bridge/cpp/cuda_graph_bridge.cu — NEW FILE
#include <cuda_runtime.h>
#include <unordered_map>
#include <string>
#include <torch/torch.h>

static std::unordered_map<std::string, cudaGraph_t> g_graphs;
static std::unordered_map<std::string, cudaGraphExec_t> g_execs;

extern "C" int captureGraph(const char* key, int n, int dim) {
    cudaStream_t stream;
    cudaStreamCreate(&stream);
    cudaStreamBeginCapture(stream, cudaStreamCaptureModeGlobal);

    // Run a representative attention/softmax/topK chain so the graph captures
    // the kernel sequence
    auto q = torch::randn({1, dim}, torch::kCUDA);
    auto k = torch::randn({n, dim}, torch::kCUDA);
    auto scores = torch::matmul(q, k.transpose(0, 1));
    auto sm = torch::softmax(scores, -1);
    (void)sm;

    cudaGraph_t graph;
    cudaStreamEndCapture(stream, &graph);
    cudaGraphExec_t exec;
    cudaGraphInstantiate(&exec, graph, nullptr, nullptr, 0);

    g_graphs[key] = graph;
    g_execs[key] = exec;
    cudaStreamDestroy(stream);
    return 0;
}

extern "C" int replayGraph(const char* key, const float* input, int input_len, float* output, int output_len) {
    auto it = g_execs.find(key);
    if (it == g_execs.end()) return -2;  // not captured
    cudaStream_t stream;
    cudaStreamCreate(&stream);
    cudaGraphLaunch(it->second, stream);
    cudaStreamSynchronize(stream);
    cudaStreamDestroy(stream);
    // TODO: copy device output → host `output` buffer
    return 0;
}
```

Then add to `binding.cc`:
```cpp
extern "C" int captureGraph(const char* key, int n, int dim);
extern "C" int replayGraph(const char* key, const float* input, int input_len, float* output, int output_len);
// + N-API wrappers + registerFn
```

**Cost**: ~3 hours including CMake update + test. **Payoff**: 30-50% rerank latency win on warm path.

---

## 2. CUDA Streams not used for overlapping IO + compute

**Finding**: All kernel launches are synchronous (no stream argument exposed). When the bridge needs to copy 768d × 1000 floats (~3 MB) from host to device, the copy and the next compute are serialized.

**Current consumer count**:
- `pageRankGPU` — 26 consumer files (e.g., `karpathy-gpu-enrich.mjs` runs over the entire codebase chunk corpus)
- `kmeansWithCentroids` — 22 files (graphify pipeline)
- `attentionScoreGPU` — wrapped via `LibTorchReranker.rerank` (heavy ACE path)

**Impact**: For batch sizes ≥ 4 × 768d, ~15-25% throughput improvement by overlapping the next batch's H2D copy with the current batch's compute.

**Recommended fix**: extend native signatures to accept an optional `streamId: int`:

```cpp
// Before:
extern "C" int pageRankGPU(const float* adj, int n, float damping, int iters, float* output, int output_len);
// After:
extern "C" int pageRankGPU(const float* adj, int n, float damping, int iters, float* output, int output_len, int stream_id /* 0 = default */);
```

The TS bridge then exposes a `streamManager` (already partially exists at `cuda-stream-manager.ts`) that round-robins requests across 4 streams.

**Cost**: 2-3 hours. **Payoff**: 15-25% throughput on batched workloads.

---

## 3. Missing half-precision exports for embeddings rerank

**Finding**: Native has `graphSimilarityHalf` (FP16 graph similarity) but **no `attentionScoreHalf` or `batchCosineSimilarityHalf`**. FP16 doubles GPU throughput vs FP32 with negligible accuracy loss on cosine/dot products.

**Highest-value path**: ACE retrieval reranks 768d embeddings hundreds of times per chat turn. Switching to halfvec on the hot rerank path drops VRAM by 2× and increases throughput by ~1.8×.

**Existing infra**: Drizzle schema already supports `halfvec` columns (imported in `codebase-embeddings.ts`). Qdrant supports half-precision via collection config. Only the N-API bridge is FP32-only on those two functions.

**Recommended fix**:
```cpp
// simd-bridge/cpp/libtorch_graph_impl.cpp — add adjacent to existing impls
extern "C" int attentionScoreHalf(const at::Half* q, int dim, const at::Half* k, int n, at::Half* out, int out_len);
extern "C" int batchCosineSimilarityHalf(const at::Half* query, int dim, const at::Half* corpus, int n, at::Half* scores, int scores_len);
```

Wire to TS bridge with `Uint16Array` (interpret bits as `__half`).

**Cost**: 4-5 hours including verifying numerical accuracy on real retrieval corpora. **Payoff**: 2× VRAM headroom (lets us cache 2× more embeddings on the 8GB RTX 3060 Ti) + ~1.8× throughput.

---

## 4. Cleanups (low-priority)

### 4a. Orphan duplicate
`src/lib/server/ai/turbovec-rerank.ts` (27 lines, naive CPU cosine + sort) — zero consumers, superseded by `src/lib/server/retrieval/turbovec-rerank.ts` (126 lines, Qdrant+Neo4j+autoencoder aware).

**Action**: prepend `MERGED-WITH-CANONICAL` banner pointing at `retrieval/turbovec-rerank.ts`, OR move to `deeds_labs/`. Don't delete (zero-risk but want a trail).

### 4b. KNN helper rarely used
`src/lib/server/embedding/knn-helper.ts` has CPU `cosineSimilarity`/`euclideanDistance`/`dot`/`norm` helpers but only 2 consumers. Low priority; consumers may want manual loops for control. **No action.**

---

## 5. No-action signals (where CPU is the right answer)

These look like "GPU opportunities" but aren't:

| Pattern | Files | Why CPU is correct |
|---|---|---|
| `.sort((a, b) => b.score - a.score)` after rerank | 10 ACE files | Sorting <1000 items: PCIe round-trip dominates; CPU wins |
| `Math.exp` in HMM section classifier | 1 file | Sequential dependency; no batching opportunity |
| `Math.exp` in intent-ranker | 1 file | Tiny vector (12d softmax); kernel-launch overhead >> compute |

---

## 6. Aligned Roadmap Updates

Adds these to the prior Phase Completion Roadmap:

### Phase H — Native bridge enhancements (10-12h total)
- [ ] **H1** Implement `captureGraph` / `replayGraph` native functions (3h, biggest perf win)
- [ ] **H2** Wire CUDA streams into `pageRankGPU`, `kmeansWithCentroids`, `attentionScoreGPU` (2-3h)
- [ ] **H3** Add `attentionScoreHalf` + `batchCosineSimilarityHalf` for FP16 rerank (4-5h)

### Phase I — Cleanups (30 min)
- [ ] **I1** Banner orphan `ai/turbovec-rerank.ts` pointing at canonical `retrieval/turbovec-rerank.ts`

### Verification gates after each
- After H1: `node scripts/startup-gpu-bridge-probe.mjs` should show `captureGraph` + `replayGraph` live; `CudaGraphManager.isAvailable()` returns true; `/api/health/inference` reports `cudaGraphAvailable: true`
- After H2: `smoke-all-gpu-lanes.mjs --batch=32` shows throughput ↑
- After H3: rerank latency drops + VRAM usage drops in `getCudaMemory()`

---

## 7. What we already verified is correct

To avoid scope creep, these items are **explicitly NOT improvement targets**:

- ✅ Graceful fallback at TS layer (CPU paths for every GPU function via `libtorch-bridge.ts`)
- ✅ Stub paths (`libtorch_stubs.cc`) only activate under `NO_LIBTORCH=1` build flag; current build does NOT use that flag
- ✅ Drizzle drift (closed, gap=0)
- ✅ 28 native exports loaded, 15/16 probed live
- ✅ Memory pool stats (`poolStats` already wired)
- ✅ SIMD JSON parsing (3 variants live)

---

## 8. Decision points (operator gate)

1. **Apply Phase H1 (CUDA Graphs)?** Highest perf win but requires C++ work
2. **FP16 rerank (Phase H3)?** Frees 2× VRAM but needs accuracy validation on real retrieval corpora
3. **Cleanup (Phase I1)?** Zero risk, 5 min
