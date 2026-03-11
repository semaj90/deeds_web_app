# GPU Infrastructure Roadmap — Deeds Web App

## Last Updated: February 23, 2026 (Session 93r9)

---

## File Audit — src/lib/gpu/ (11 files)

| File | Lines | Quality | WebGPU APIs | WGSL Shaders | Consumers | SSR-Safe | Verdict |
|------|-------|---------|-------------|--------------|-----------|----------|---------|
| `gpu-compute-pipeline.ts` | 709 | **Production** | 12+ (full pipeline) | 3 valid (cosine, L2, matmul) | 2 (client-embed, gpu-search-reranker) | Yes | **KEEP — core GPU engine** |
| `gpu-search-reranker.ts` | 178 | **Production** | 0 (delegates) | 0 | 1 (global-search) | Yes | **KEEP — wired to route** |
| `gpu-embedding-bridge.ts` | 185 | **Production** | 0 (server-side) | 0 | 0 | Yes | UNWIRED — wire to /api/rag/search |
| `global-gpu-manager.ts` | 131 | Clean | 4 (init only) | 0 | 0 | Yes | UNWIRED — wire to dev-tools GPU tab |
| `hybrid-gpu-context.ts` | 75 | Clean | 0 (types only) | 0 | 1 (global-gpu-manager) | Yes | KEEP — type provider |
| `chrrom-cache.ts` | 31 | Clean | 0 (Map wrapper) | 0 | 3 | Yes | KEEP — live consumers |
| `runtime-optimizations.ts` | 298 | Partial | 0 (config only) | 0 | 0 | No | UNWIRED — has perf monitor class |
| `env.ts` (config/) | 115 | **Fixed** | 0 | 0 | Multiple | Yes | FIXED — was broken import |
| `markdown-pipeline.ts` | 414 | **Broken** (syntax L392) | 0 (delegates) | 0 | 0 | No | **ARCHIVE — dead code** |
| `markdown-processor.ts` | 730 | Partial (bugs) | 10 via `as any` | 3 (1 buggy, 1 fake) | 0 | No | **ARCHIVE — dead code** |
| `nes-gpu-memory-bridge.ts` | 145 | Stub | 0 | 0 | 0 | Yes | **ARCHIVE — misnamed JSON shim** |
| `webgpu-cuda-bridge.ts` | 181 | Skeleton | 4 (init only) | 0 | 0 | No | **ARCHIVE — gutted, ts-morph dep** |

### Summary: 4 KEEP (production) + 3 KEEP (utility) + 4 ARCHIVE (dead)

---

## W3C WebGPU Spec Compliance Analysis

### Browser Support (2025-2026)

| Browser | Version | Compute Shaders | Notes |
|---------|---------|-----------------|-------|
| Chrome | 113+ (desktop), 121+ (Android) | Full | D3D12 backend, Linux in progress |
| Edge | 113+ | Full | Chromium-based, mirrors Chrome |
| Firefox | 141+ (Windows), 145+ (macOS) | Full | Linux/Android in progress |
| Safari | 26.0+ | Full | Metal backend, f16 support, iOS 26+ |

Sources: [Can I Use](https://caniuse.com/webgpu), [Implementation Status](https://github.com/gpuweb/gpuweb/wiki/Implementation-Status), [WWDC 2025](https://dev.to/arshtechpro/wwdc-2025-webgpu-on-apple-platforms-16pa)

### gpu-compute-pipeline.ts — Spec Audit

| Aspect | Our Code | W3C Spec | Status |
|--------|----------|----------|--------|
| Workgroup size (cosine) | `@workgroup_size(256)` | Min required max: 256 | **PASS** — spec minimum, portable |
| Workgroup size (matmul) | `@workgroup_size(16, 16)` = 256 | ≤ maxComputeInvocationsPerWorkgroup | **PASS** |
| Buffer creation | STORAGE + COPY_SRC, MAP_READ + COPY_DST | §6.1 buffer usage rules | **PASS** — correct staging pattern |
| Pipeline creation | `createComputePipeline()` (sync) | Async preferred | **WARN** — should use `createComputePipelineAsync()` |
| Bind group layout | Explicit layout construction | Both explicit and 'auto' valid | **PASS** — explicit is more robust |
| Buffer lifecycle | Create → use → destroy per dispatch | No auto-cleanup | **PASS** — explicit destroy prevents leaks |
| vec3 alignment | Not used (all f32 arrays) | vec3 aligns to 16 bytes (not 12) | **PASS** — avoided the pitfall |
| Memory barriers | Not needed (single workgroup per vector) | workgroupBarrier() for shared mem | **PASS** — N/A for our pattern |
| SSR guard | `if (!browser)` before GPU access | N/A (browser API) | **PASS** — clean browser guard |
| WASM SIMD detection | Validates magic bytes only | Should test SIMD opcodes | **MINOR** — label 'wasm-simd' is misleading |

### WGSL Shader Inventory (Production)

| Shader | Location | Workgroup | Purpose | Status |
|--------|----------|-----------|---------|--------|
| Cosine Similarity | gpu-compute-pipeline.ts:68-121 | 256 | Batch query vs N docs, 4-wide unroll | **Valid** |
| L2 Normalize | gpu-compute-pipeline.ts:127-157 | 256 | In-place unit vector normalization | **Valid** |
| Matrix Multiply | gpu-compute-pipeline.ts:163-188 | 16×16 | Tiled C=A×B | **Valid** |

### WGSL Shader Inventory (Dead Code — to archive)

| Shader | Location | Issue |
|--------|----------|-------|
| Heading Detection | markdown-processor.ts:94-125 | Bug: only detects `# ` (single hash), breaks on `##`/`###` |
| Section Detection | markdown-processor.ts:129-164 | Fake: only detects letter 'F', not section boundaries |
| Token Boundary | markdown-processor.ts:168-202 | Works but ASCII-only, no Unicode |

---

## Current Wiring Map

```
WIRED (Working)
═══════════════

global-search/+page.svelte
  └─ import { gpuRerank } from gpu-search-reranker.ts
       └─ import { embedText } from client-embed.ts
       └─ import { getGPUCompute } from gpu-compute-pipeline.ts
            └─ import from $lib/webgpu/init.js (WebGPU device)

client-embed.ts (batchCosineSimilarity)
  └─ import { getGPUCompute } from gpu-compute-pipeline.ts

admin/dev-tools/+page.svelte (GPU tab)
  └─ import GPUMetrics from GPUMetrics.svelte
       └─ reads appStore.systemMetrics?.gpu (simulated if unavailable)

UNWIRED (Functional but no consumers)
═════════════════════════════════════

gpu-embedding-bridge.ts ← server-side, gRPC+Ollama embedding batch pipeline
global-gpu-manager.ts ← browser WebGPU/WebGL2/WebGL/CPU singleton
runtime-optimizations.ts ← GPUMarkdownPerformanceMonitor, GPUMemoryManager
hybrid-gpu-context.ts ← HybridGPUContext interface (used by global-gpu-manager only)

DEAD CODE (Archive candidates)
══════════════════════════════

markdown-pipeline.ts ← syntax error L392, 0 importers
markdown-processor.ts ← buggy shaders, pervasive `as any`, 0 external importers
nes-gpu-memory-bridge.ts ← JSON.stringify wrapper, no GPU code, 0 importers
webgpu-cuda-bridge.ts ← gutted skeleton, non-standard features, ts-morph dep, 0 importers
```

---

## Bugs Fixed This Session

| Bug | File | Fix |
|-----|------|-----|
| Broken import: `$lib/gpu/types` doesn't exist | config/env.ts:2 | Inlined `clampMemoryMB()` + `normalizePerformanceProfile()` |
| Unused DrizzleTypes import | global-gpu-manager.ts:3 | Removed |
| `allocateBuffer()` passes `usage` as `size` | runtime-optimizations.ts:228 | Fixed to `{ size, usage }` |
| `declare global` shadows real WebGPU types | runtime-optimizations.ts:9-33 | Removed (TS already has WebGPU types) |

---

## Comprehensive TODO List

### Tier 1 — Quick Wins (Wire existing production code)

- [ ] **1.1 Wire `global-gpu-manager.ts` to dev-tools GPU tab**
  - Replace simulated metrics in GPUMetrics.svelte with real `globalGPUManager.initialize()` + `getContextType()`
  - Show actual WebGPU adapter info (vendor, architecture, device limits)
  - Add GPU capabilities detection (compute, f16, subgroups)
  - **Files:** `GPUMetrics.svelte` (197L), `global-gpu-manager.ts` (131L)
  - **Route:** `/admin/dev-tools` (GPU tab, already exists at line 629)

- [ ] **1.2 Wire `gpu-embedding-bridge.ts` to /api/rag/search**
  - Use `embedAndCompare()` for server-side batch similarity instead of sequential Ollama calls
  - Already has gRPC → Ollama fallback chain built in
  - **Files:** `gpu-embedding-bridge.ts` (185L), `src/routes/api/rag/search/+server.ts`

- [ ] **1.3 Add GPU compute benchmark to dev-tools**
  - New "Benchmark" button in GPU tab that runs cosine similarity on 100 synthetic 768-dim vectors
  - Display: backend (WebGPU/WASM/CPU), time (ms), throughput (vectors/sec)
  - Uses existing `getGPUCompute().cosineSimilarity()` API
  - **Files:** `GPUMetrics.svelte` or new `GPUBenchmark.svelte` component

- [ ] **1.4 Switch `createComputePipeline` → `createComputePipelineAsync`**
  - W3C best practice: async pipeline prevents GPU stall during shader compilation
  - Currently sync (line ~580 in gpu-compute-pipeline.ts)
  - Pre-warm all 3 pipelines during `initialize()` using async
  - **Source:** [MDN createComputePipelineAsync](https://developer.mozilla.org/en-US/docs/Web/API/GPUDevice/createComputePipelineAsync)

### Tier 2 — Archive Dead Code + Clean Up

- [ ] **2.1 Archive 4 dead GPU files to `deeds_labs/archived-gpu-stubs/`**
  - `markdown-pipeline.ts` — syntax error L392, 0 importers
  - `markdown-processor.ts` — buggy shaders, `as any` everywhere, 0 external importers
  - `nes-gpu-memory-bridge.ts` — JSON.stringify wrapper misnamed as GPU bridge, 0 importers
  - `webgpu-cuda-bridge.ts` — gutted skeleton with ts-morph dep + non-standard features, 0 importers
  - **Verify:** `grep -r` confirms 0 live imports in src/

- [ ] **2.2 Remove `runtime-optimizations.ts` global singleton exports**
  - Lines 324-326 export `performanceMonitor`, `memoryManager`, `optimizedProcessor` at module scope
  - These instantiate classes that call `process.memoryUsage()` (Node-only) and `navigator.gpu` (browser-only)
  - Either guard with `browser` check or remove singletons (keep classes for on-demand use)

- [ ] **2.3 Fix `GPUMetrics.svelte` data source**
  - Currently reads from `appStore.systemMetrics?.gpu` which is likely null
  - Falls back to `simulateMetrics()` (random data)
  - Should use real `navigator.gpu` adapter info + `gpu-compute-pipeline.ts` backend detection

### Tier 3 — New GPU Features

- [ ] **3.1 Add `subgroups` support for faster reductions**
  - Chrome 134+ ships subgroup operations (ballot, shuffle, broadcast)
  - Can replace per-thread dot-product accumulation with subgroup reduction
  - 2-4x speedup for cosine similarity on supported hardware
  - Guard behind `adapter.features.has('subgroups')` check
  - **Source:** [Chrome 134 subgroups](https://developer.chrome.com/blog/new-in-webgpu-134)

- [ ] **3.2 ONNX Runtime WebGPU optimizations**
  - Enable `enableGraphCapture: true` for static-shape embedding models
  - Add `freeDimensionOverrides: { batch_size: 1, sequence_length: 128 }` for embeddinggemma
  - Use IO binding for transformer decoder loop (keep tensors on GPU)
  - **Source:** [ORT WebGPU guide](https://onnxruntime.ai/docs/tutorials/web/ep-webgpu.html)
  - **Gotcha:** 4GB WASM memory limit, shader compilation timeout on Safari/iOS

- [ ] **3.3 New WGSL shader: batch embedding projection**
  - Matrix multiply for embedding dimensionality reduction (768 → 256 for display)
  - Uses existing matmul shader with appropriate dimensions
  - Wire to `/evidence-library` EvidenceAnalysisDashboard for t-SNE-like visualization

- [ ] **3.4 WebGPU device limits reporting API**
  - New `/api/gpu/capabilities` endpoint (or extend existing `/api/health/capabilities`)
  - Report: `maxComputeInvocationsPerWorkgroup`, `maxStorageBufferBindingSize`, `maxBufferSize`
  - Client calls during GPU init to select optimal workgroup sizes
  - **Source:** [WebGPU shader limits](https://hugodaniel.com/posts/webgpu-shader-limits/)

### Tier 4 — RabbitMQ Consumer Layer (Phase 2 from prior roadmap)

- [ ] **4.1 Enable RabbitMQ auto-init** (was commented out)
  - Uncomment consumer setup in `rabbitmq-manager-fixed.ts`
  - 5 consumer handlers already implemented (Session 93r8): evidence_process, vector_index, chat_context, analytics_track, codebase_index
  - 2 already existed: cache_invalidate, document_embed
  - **All 7 queues now have handlers** — just need auto-init enabled

- [ ] **4.2 Wire XState machine to RabbitMQ lifecycle**
  - `rabbitmq-xstate-integration.ts` already rewritten (Session 93r8) with full state machine
  - Wire `CONSUMERS_READY` event to emit actual queue names after `startAllConsumers()`
  - Add health check actor that pings RabbitMQ every 30s
  - Expose machine state via `/api/health/capabilities` (rabbitmq field)

- [ ] **4.3 Add dead-letter queue for failed messages**
  - Configure DLX (dead-letter exchange) on all 7 queues
  - Failed messages after 3 retries → `*.dead-letter` queue
  - Add `/api/rabbitmq/dead-letters` endpoint for monitoring

### Tier 5 — Server-Side WebGPU (Experimental)

- [ ] **5.1 Evaluate `webgpu` npm package for server compute**
  - [dawn-gpu/node-webgpu](https://github.com/dawn-gpu/node-webgpu) — Google Dawn bindings
  - Enables shared WGSL shaders between client and server
  - Replace `cpuBatchCosineSimilarity()` in `gpu-embedding-bridge.ts` with GPU dispatch
  - **Test:** Run cosine similarity shader on RTX 3060 Ti via Node.js
  - **Source:** [webgpu npm](https://www.npmjs.com/package/webgpu)

- [ ] **5.2 N-API Rust gRPC client (NaaE pattern)**
  - Replace `@grpc/grpc-js` protobuf deserialization with Rust N-API addon
  - Target: 400% throughput for embedding pipeline
  - Existing stub: `simd-bridge/binding.gyp` (never compiled)
  - **Source:** [NaaE pattern](https://blog.triton.one/grpc-js-alternative-napi-rust/)

- [ ] **5.3 SharedArrayBuffer for zero-copy worker transfer**
  - Requires COOP/COEP headers (check if already set in hooks.server.ts)
  - Zero-copy 768-dim Float32Array sharing between embedding workers
  - Replace `postMessage()` structured clone with shared memory
  - **Source:** [WebGPU multithreading](https://gpuweb.github.io/gpuweb/explainer/)

---

## Playwright Test Coverage

| Route | Has GPU Features | Tested | Status |
|-------|-----------------|--------|--------|
| `/global-search` | GPU reranking toggle + metrics | Yes | Screenshot validated |
| `/admin/dev-tools` | GPU tab (GPUMetrics.svelte) | Yes | Screenshot validated |
| `/ai-dashboard` | RAG pipeline (server-side) | Yes | Screenshot validated |
| `/evidence` | Evidence search (server RAG) | Yes | Screenshot validated |
| `/evidence-library` | Planned: GPU embedding viz | Yes | Screenshot validated |

### Validation Commands
```bash
# Quick test (7 routes)
node scripts/tests/test-screenshots.mjs

# Full test (22 routes including GPU-related)
node scripts/tests/test-screenshots.mjs --all

# Single route
node scripts/tests/test-screenshots.mjs --route /global-search
```

---

## Architecture Target

```
Browser (Client Tier)
├── WebGPU Compute (3 WGSL shaders)
│   ├── Cosine similarity (256 threads, 4-wide unroll)
│   ├── L2 normalization (256 threads, in-place)
│   └── Matrix multiply (16×16 tiled workgroups)
├── ONNX Runtime (WebGPU → WASM SIMD → CPU fallback)
│   ├── embeddinggemma 300M (768-dim, cached in IndexedDB)
│   └── gemma3-270m (418MB, local-only inference)
├── GPU Search Reranker (gpu-search-reranker.ts)
│   └── Embed query + chunks → GPU cosine sim → rerank results
├── XState v5 machines (9) → client orchestration
└── Client Router → health-aware (capabilities 30s cache)
    ├── Simple → local ONNX (WebGPU)
    └── Complex → server Ollama (SSE stream)
         ↕ HTTP/SSE + gRPC (when enabled)
SvelteKit Server
├── worker_threads pool → protobuf deser off event loop
├── p-limit gates (1-4 concurrent) → GPU resource protection
├── DB job queue (FOR UPDATE SKIP LOCKED) → atomic claiming
├── gRPC clients → embedding, retrieval, vector-cache
├── RabbitMQ consumers → 7 queues, XState orchestrated
├── GPU embedding bridge → gRPC→similarity→QLoRA compress
└── Server-side WebGPU (future) → shared WGSL kernels
         ↕ HTTP/gRPC
GPU + Services
├── Ollama RTX 3060 Ti → gemma3-legal 11.8B Q4_K_M
├── TensorRT (optional) → FlashAttention-2 + Q4 matmul
├── Qdrant → 6 collections, 768-dim
├── Redis → L3 cache (SSR + sessions + embeddings)
├── PostgreSQL → Drizzle ORM + pgvector
└── RabbitMQ → 7 queues, 5 exchanges, 7 consumers
```

---

## Hardware Constraints (RTX 3060 Ti)

| Resource | Budget | Notes |
|----------|--------|-------|
| **VRAM** | 8192 MB total | gemma3-legal alone = 7.3GB |
| **Model memory** | 7,300 MB | Q4_K_M (4-bit weights) |
| **KV cache** | 256 MB | Depends on sequence length |
| **Batch buffer** | 512 MB | batch_size=16, seq_len=2048 |
| **Workspace** | 192 MB | cuBLAS scratch |
| **Headroom** | ~350 MB | Tight — can't run TRT + Ollama simultaneously |
| **CUDA cores** | 4,608 | SM 8.6 Ampere |
| **Tensor cores** | Yes | FP16/BF16/INT8/INT4 |
| **Max workgroup** | 256 invocations | WebGPU spec minimum (RTX supports 1024) |
| **Shared memory** | 48 KB per SM | Lower than RTX 3090 |

---

## Key WGSL Best Practices (from W3C spec research)

| Rule | Detail | Source |
|------|--------|--------|
| Portable workgroup size | Use **64** for max compatibility (256 is our spec min) | [Shader Limits](https://hugodaniel.com/posts/webgpu-shader-limits/) |
| vec3 alignment trap | `vec3<f32>` aligns to **16 bytes** (not 12!) — prefer flat `array<f32>` | [WGSL spec §5.3](https://www.w3.org/TR/WGSL/#alignment-and-size) |
| No cross-workgroup sync | Only `workgroupBarrier()` and `storageBarrier()` (workgroup-scoped) | [WGSL spec §16.6](https://www.w3.org/TR/WGSL/#sync-builtin-functions) |
| Async pipeline creation | `createComputePipelineAsync()` avoids GPU stall during shader compilation | [MDN](https://developer.mozilla.org/en-US/docs/Web/API/GPUDevice/createComputePipelineAsync) |
| Staging buffer pattern | MAP_READ + COPY_DST for readback; MAP_READ cannot combine with STORAGE | [Buffer Uploads](https://toji.dev/webgpu-best-practices/buffer-uploads.html) |
| Subgroups (Chrome 134+) | `subgroupAdd()`, `subgroupBroadcast()` for fast reductions | [Chrome 134](https://developer.chrome.com/blog/new-in-webgpu-134) |
| ONNX + WebGPU | 4GB model limit (WASM addressing), shader compile timeout on iOS | [ORT docs](https://onnxruntime.ai/docs/tutorials/web/ep-webgpu.html) |

---

## Sources

- [Can I Use: WebGPU](https://caniuse.com/webgpu)
- [W3C WebGPU Spec](https://www.w3.org/TR/webgpu/)
- [W3C WGSL Spec](https://www.w3.org/TR/WGSL/)
- [WebGPU Fundamentals](https://webgpufundamentals.org/)
- [MDN WebGPU API](https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API)
- [WebGPU Shader Limits](https://hugodaniel.com/posts/webgpu-shader-limits/)
- [Buffer Upload Best Practices](https://toji.dev/webgpu-best-practices/buffer-uploads.html)
- [Chrome 134: Subgroups](https://developer.chrome.com/blog/new-in-webgpu-134)
- [Chrome 145: Subgroup Uniformity](https://developer.chrome.com/blog/new-in-webgpu-145)
- [ONNX Runtime WebGPU](https://onnxruntime.ai/docs/tutorials/web/ep-webgpu.html)
- [ONNX Large Models](https://onnxruntime.ai/docs/tutorials/web/large-models.html)
- [dawn-gpu/node-webgpu](https://github.com/dawn-gpu/node-webgpu)
- [@kmamal/gpu](https://github.com/kmamal/gpu)
- [NaaE: 400% gRPC boost](https://blog.triton.one/grpc-js-alternative-napi-rust/)
- [Cloudflare WebGPU Workers](https://blog.cloudflare.com/webgpu-in-workers/)
- [WWDC 2025 WebGPU on Apple](https://dev.to/arshtechpro/wwdc-2025-webgpu-on-apple-platforms-16pa)
- [Safari 26 WebGPU](https://webkit.org/blog/16993/news-from-wwdc25-web-technology-coming-this-fall-in-safari-26-beta/)
- [WebGPU Concurrency Guide](https://www.sitepoint.com/the-webgpu-concurrency-guide-mastering-async-compute-shaders/)
- [Connect-ES (gRPC-compatible RPC)](https://connectrpc.com/)
- [Piscina Worker Pool](https://github.com/piscinajs/piscina)
- [RabbitMQ Inference Architecture](https://medium.com/@anderson-3395/running-pytorch-inference-at-scale-with-fastapi-rabbitmq)
- [FlatBuffers JS Guide](https://flatbuffers.dev/flatbuffers_guide_use_javascript.html)
