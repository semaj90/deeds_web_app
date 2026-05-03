# Compiler Stack Explainer — tsgo vs PyTorch vs WASM

**Audience:** This codebase. Covers how each "compiler" fits into the Legal AI Platform inference pipeline.  
**Last Updated:** May 3, 2026

---

## The Three Compiler Concepts

These are three completely different families of "compiler" solving completely different problems:

| | tsgo | PyTorch / LibTorch | WASM |
|--|------|--------------------|------|
| **What it compiles** | TypeScript types → JavaScript | Tensor ops → CUDA kernels | C/C++/Rust → portable bytecode |
| **Hard problem** | Graph traversal (structural type checking) | Loop fusion + memory layout (GEMM on tensor cores) | Portability across CPU architectures |
| **Linear algebra** | None — type math only | Yes — the entire point | No — SIMD128 only (128-bit lanes, scalar loops for matmul) |
| **GPU access** | None | Direct CUDA via cuBLAS | None (WebGPU is a separate browser API) |
| **Speedup source** | Go goroutine parallelism (10×) | CUDA tensor cores (100–10,000×) | Near-native CPU bytecode (1–3×) |

---

## 1. tsgo (TypeScript 7 — Go Rewrite)

### What it does

tsgo is a complete rewrite of the TypeScript compiler from JavaScript into Go.  
It reads `.ts` / `.svelte` source files, resolves the dependency graph, checks structural type compatibility across all files simultaneously, and emits `.js` + `.d.ts` output.

**The hard algorithmic problem:** type checking is graph traversal. "Does type `A` satisfy interface `B`?" requires walking a dependency DAG that can have cycles, checking structural subtype relationships, resolving conditional types, and doing this across 2,000+ files. Go goroutines let multiple files be checked simultaneously in shared memory — something the JS event loop fundamentally cannot do.

### What it does NOT do

- No GPU. No CUDA. No tensor cores. No VRAM.
- No matrix multiply. No linear algebra.
- No inference. No embeddings. No model weights.
- The 10× speedup is entirely CPU-bound Go parallelism.

### SIMD in tsgo

Go's standard library (`strings`, `bytes`, `unicode` packages) uses AVX2/SSE4.2 assembly stubs implicitly on x86-64. The TypeScript scanner and binder use these packages for source tokenization and identifier comparison — so SIMD acceleration exists but is implicit, not configured, not documented. It is **not** comparable to AVX-512 matrix ops or simdjson's 256-bit SIMD parsing.

### Relevance to this codebase

```bash
# After installing tsgo beta:
npx tsgo --checkers 8 --noEmit   # 8 goroutines, ~9s vs ~90s with tsc
npx tsgo --watch                 # native file watcher, no polling
```

tsgo uses the same `.tsbuildinfo` format as tsc — drop-in incremental build replacement.  
Your `tsconfig.json` (`moduleResolution: "bundler"`) is already TS7-compatible.

---

## 2. PyTorch / LibTorch (Tensor Compiler Stack)

### What it does

PyTorch's compiler stack (`torch.compile` → TorchInductor → Triton → PTX) converts Python tensor operations into fused CUDA kernels. When you call `torch.compile(model)`:

1. **TorchDynamo** traces the Python graph (bytecode-level)
2. **TorchInductor** optimizes the compute graph (loop fusion, memory layout)
3. **Triton** JIT-compiles to GPU kernels (WGSL for AMD, PTX for NVIDIA)
4. **cuBLAS** handles GEMM (General Matrix-Matrix Multiply) on tensor cores

The critical optimization is **kernel fusion** — instead of writing a 768×768 matrix to VRAM and reading it back for the next op, fused kernels do multiple operations in a single pass, staying in L2/shared memory and avoiding the ~336 GB/s VRAM bandwidth bottleneck.

### Your LibTorch N-API Bridge

`src/lib/server/gpu/libtorch-bridge.ts` is "PyTorch for Node.js production ops":

| Python PyTorch | Your tensorrt_bridge.node |
|----------------|--------------------------|
| `torch.compile(model)` JIT overhead | Pre-compiled CUDA kernels via cuBLAS |
| Python GIL + marshalling | Direct C++ call from Node.js (N-API) |
| Full framework (autograd, training) | Fixed ops: cosine sim, k-means, PageRank |
| Flexible for research | Faster for production fixed workloads |

**Key GPU functions in tensorrt_bridge.node:**
- `kmeansWithCentroids(vectors, k)` — GPU k-means (RTX 3060 Ti, 128-float tiles in L2)
- `batchCosineSimilarity(query, corpus)` — 100× faster than CPU for 1000+ vectors
- `pageRankGPU(edgeMatrix, damping)` — sparse power-iteration on GPU
- `attentionScoreGPU(query, keys)` — scaled dot-product attention
- `rewardScoreGPU(responses)` — GRPO reward scoring
- `trainSOM(vectors, gridW, gridH)` — Self-Organizing Map training
- `simdJsonParse(json)` — AVX2 SIMD JSON parsing (256-bit lanes)

**Memory optimizations in libtorch-bridge.ts:**
- Float32Array pool — pre-allocated typed arrays, 90% fewer GC pauses
- CUDA OOM guard — checks `getCudaMemoryInfo()` before each GPU op
- Cache-blocked CPU cosine similarity — 128-float tiles stay in L2 cache
- 8-element unrolled inner loop — SIMD auto-vectorization friendly
- Chunked `batchCosineSimilarityChunked()` — 4096-vector pages for L3 locality

### Why WASM cannot replace this

A GPU GEMM works by loading 16×16 matrix tiles into shared memory (SRAM, ~256 KB) and running 3584 CUDA cores simultaneously on your RTX 3060 Ti. WASM has:
- 1 thread unless SharedArrayBuffer+COOP headers are configured
- No GPU access (WebGPU is a separate browser API, inaccessible from WASM)
- WASM SIMD128 = 128-bit lanes only (vs AVX-512 = 512-bit lanes)
- No tensor core / fused multiply-add at hardware level

**768×768 matrix multiply on your RTX 3060 Ti:** ~0.1ms (cuBLAS tensor core)  
**768×768 matrix multiply in WASM:** ~50ms (scalar loop)  
**Speedup ratio: ~500×**

---

## 3. WASM (WebAssembly)

### What it does

WASM is a portable binary format — C/C++/Rust compiled to a compact bytecode that any WASM runtime can execute at near-native speed. The value is **portability and safety**, not raw compute.

### Why WASM is in this codebase

Your ONNX Runtime WASM files (`static/ort/ort-wasm-simd-threaded.wasm`, ~24 MB) are the **client-side browser fallback** when WebGPU is unavailable:

```
Client inference fallback chain:
  WebGPU (Dawn → Vulkan/D3D12) → WASM SIMD → CPU scalar
```

The 270M ONNX Gemma model running in WASM is acceptable for simple queries precisely because the model is small and the task is latency-tolerant. For embedding (768-dim), the WASM path produces the same vectors as GPU — just slower.

### WASM SIMD128

The `ort-wasm-simd-threaded.wasm` binary uses WASM SIMD128 — 128-bit vector lanes for float32 ops. This gives ~4 float32 ops per instruction, which helps for embedding but is still ~50–200× slower than GPU GEMM for large matrix operations.

**`ort-wasm-simd-threaded.asyncify.wasm`** — uses Asyncify for async code support (required for ONNX Runtime async loading).

### What WASM cannot do

- Access GPU directly (only WebGPU API from JavaScript can)
- Run AVX-512 (host CPU may have it, WASM runtime may expose it, but WASM SIMD128 is the spec limit)
- Replace cuBLAS for any matrix operation > ~100×100

---

## 4. The Full Compiler Stack in This Codebase

```
RTX 3060 Ti (8 GB VRAM, CUDA 12.1, Compute Capability 8.6)
│
├── llama-server.exe (llama.cpp)              ← LLM text generation
│   ├── CUDA backend → cuBLAS GEMM → tensor cores
│   ├── KV cache -ctk q8_0 (18% VRAM savings, stable)
│   ├── KV cache -ctk q4_0 (more savings, test first)
│   ├── cache_prompt: true (system prompt KV computed once, reused)
│   ├── --mmproj siglip.gguf (unified VLM, ~5.8 GB VRAM)
│   └── TurboQuant -ctk turbo3 (ICLR 2026, 5× VRAM, EXPERIMENTAL)
│       └── Verify on your GGUF + CUDA backend before production use
│
├── tensorrt_bridge.node (LibTorch N-API)     ← Batch GPU ops from Node.js
│   ├── kmeansWithCentroids → cuBLAS batched GEMM (hypergraph clustering)
│   ├── trainSOM → SOM grid (topology encoding for topological-search.ts)
│   ├── pageRankGPU → sparse matmul power-iteration
│   ├── batchCosineSimilarity → query vs corpus (100× vs CPU)
│   ├── attentionScoreGPU → scaled dot-product (ACE chunk scoring)
│   └── simdJsonParse → AVX2 256-bit SIMD JSON (simdjson, ~5× vs V8)
│       └── Addon: simd-bridge/cpp/build/Release/tensorrt_bridge.node
│
├── embeddinggemma:latest (Ollama GPU)        ← 768-dim embeddings
│   └── Used by: ACE, community-graph, cluster summaries, chat memory
│
└── WebGPU (browser client)                  ← Client-side inference
    ├── Gemma 4 E2B (2.3B Q4F16, Transformers.js + WebGPU)  ~1–2s/200tok
    ├── ONNX 270M (legacy, static/gemma3_270m_onnx/)
    └── WASM SIMD fallback (when WebGPU unavailable)
        └── Runtime: static/ort/ort-wasm-simd-threaded.wasm (24 MB)
```

```
tsgo (Go, CPU parallel)                      ← TypeScript type checking only
│
├── 8 goroutines → shared-memory parallel type graph traversal
├── AVX2/SSE4.2 implicit via Go stdlib (strings/bytes scanner)
├── .tsbuildinfo incremental cache (same format as tsc)
└── Outputs: .js + .d.ts (never touches VRAM)
```

---

## 5. Inference Routing Cascade (Server-Side)

```
Client Request → /api/ai/agent or /api/sse/chat
  │
  ├─[GPU lease available + 4000 MB VRAM]─→ TensorRT-LLM :8099 (INT4 AWQ)
  │                                                        ↓ (if down)
  ├─────────────────────────────────────→ Triton TensorRT :8000
  │                                                        ↓
  ├─[<500ms deadline]──────────────────→ Bifrost cache :3040 (ε-greedy, ~5ms)
  │                                        (bypass: high-temp, long, vision)
  │                                                        ↓ (miss)
  ├─────────────────────────────────────→ TurboQuant :8090 (llama-server)
  │                                        cache_prompt: true, KV q8_0
  │                                                        ↓ (down)
  ├─[vision query]─────────────────────→ VLM server :8085 (Gemma4 E4B HF NF4)
  │                                                        ↓
  ├─[CPU sidecar]──────────────────────→ LiteRT-LM :8070 (MTP speculative)
  │                                                        ↓
  └─────────────────────────────────────→ Ollama :11434 (final fallback)
                                           gemma4-legal Q4_K_M + Q8_0 KV
```

---

## 6. ACE Scoring Spine (Context Assembly Weights)

```
final_score =
  semantic_vector_score    × 0.60   (Qdrant cosine, 768-dim embeddinggemma)
+ keyword_tag_score        × 0.12   (semantic_tags array match)
+ ast_graph_score          × 0.10   (Neo4j IMPORTS neighbors)
+ som_topological_boost    × 0.08   (topological-search.ts BMU proximity)
+ hyperedge_grade_boost    × 0.10   (Redis hg:edge:* GRADE_A/B/C)
```

Community context (GraphRAG) is prepended as a preamble block — not scored inline but frames the entire retrieval.

---

## 7. KV Cache Recommendations

| Option | VRAM savings | Stability | Use when |
|--------|-------------|-----------|----------|
| Default (f16) | 0% | Rock solid | Debugging |
| `-ctk q8_0` | ~18% | Stable on CUDA | Production default |
| `-ctk q4_0` | ~44% | Generally stable, test first | Memory-constrained |
| `-ctk turbo3` (TurboQuant) | ~80% | Experimental — crashes reported on some backends | Benchmark only |

For 8 GB VRAM on RTX 3060 Ti with Gemma4 GGUF:
- **Recommended:** `-ctk q8_0 -ctv q8_0` (stable savings, room for KV expansion at 32K context)
- **Experimental:** benchmark `turbo3` on your exact GGUF + Windows CUDA backend before deploying

---

## 8. `using` / `await using` — TS 5.2+ Resource Cleanup

Available now (TS 5.2+, stable in TS7). Add `"lib": ["es2025", "esnext.disposable"]` to tsconfig.

```typescript
// Before (current pattern in scripts/):
const redis = new Redis(REDIS_URL, { password: REDIS_PASS, lazyConnect: true });
// ... work ...
if (redisReady) await redis.quit().catch(() => {});

// After (using keyword — auto-disposes even on exception):
class DisposableRedis extends Redis {
  async [Symbol.asyncDispose]() { await this.quit(); }
}
async function main() {
  await using redis = new DisposableRedis(REDIS_URL, { password: REDIS_PASS });
  // redis.quit() fires automatically at scope end
}
```

Particularly useful in: `scripts/summarize-clusters-pg.ts`, `scripts/run-hypergraph.ts`, `scripts/run-pagerank.ts`.

---

## Sources

- [TypeScript 7.0 Beta Announcement](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0-beta/)
- [ICLR 2026 TurboQuant Paper](https://arxiv.org/abs/2410.00128)
- [Google A2A Protocol Spec](https://google.github.io/A2A/specification/)
- [llama.cpp KV Cache Quantization](https://github.com/ggml-org/llama.cpp/discussions)
- `src/lib/server/gpu/libtorch-bridge.ts` — LibTorch N-API ops
- `src/lib/server/gpu/simdjson-bridge.ts` — simdjson SIMD JSON
- `src/lib/server/inference/inference-router.ts` — 8-tier cascade
- `src/lib/server/ace/context-assembler.ts` — ACE context assembly
- `src/lib/server/graph/community-graph.ts` — GraphRAG community detection
- `scripts/docs/typescript-7-release-notes.md` — TS7 full release notes