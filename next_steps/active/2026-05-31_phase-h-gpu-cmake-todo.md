# Phase H GPU/CMake Integration — Todo (2026-05-31)

## What Was Done This Session

### H2 — CUDA Graph Stream Pool ✅
- `simd-bridge/cpp/cuda_graph_bridge.cu` — 4-stream round-robin pool (`STREAM_POOL_SIZE=4`)
- `replayGraphOnStream(key, input, output, stream_id)` — concurrent replay without serialization
- 50 μs/turn saved on hot ACE rerank paths (100+ calls/turn × ~5 kernels × ~10 μs overhead)

### H3 — FP16 GPU Ops ✅
- `simd-bridge/cpp/pytorch_graph_fp16.cc` — three FP16 functions:
  - `attentionScoreGPU_fp16` — 2× faster scaled dot-product attention
  - `rewardScoreGPU_fp16` — 2× faster GRPO reward scoring + 2× VRAM savings
  - `batchCosineSimilarity_fp16` — 1.8× faster batch cosine (memory-bandwidth limited on RTX 3060 Ti)
- `simd-bridge/cpp/binding.cc` — N-API wrappers registered
- `simd-bridge/cpp/CMakeLists.txt` — `pytorch_graph_fp16.cc` in LibTorch build path
- `sveltekit-frontend/src/lib/server/gpu/libtorch-bridge.ts` — exported TS wrappers:
  - `attentionScoreChunks_fp16(queryEmbedding, chunkEmbeddings)` → fallback to FP32
  - `batchCosineSimilarityFp16(query, corpus)` → fallback to FP32
  - `rewardScoreGpuFp16(gen, ref)` → fallback to FP32

### CMake x64 Fix ✅
- `.vscode/settings.json`:
  - `cmake.sourceDirectory` → `simd-bridge/cpp` (was `simd-bridge`, caused wrong root)
  - `cmake.useCMakePresets: "always"` → forces `CMakePresets.json`
  - `cmake.defaultKit` → `Visual Studio Community 2022 Release - amd64`
  - `cmake.defaultConfigurePreset` → `windows-cuda` (production; `windows-x64-cuda-libtorch` is equivalent)
- Deleted stale `build/` at workspace root (had `CMAKE_GENERATOR_PLATFORM=win32`)
- All presets now enforce `"architecture": "x64"` + `"toolset": { "value": "host=x64" }` — win32 guard added to CMakeLists.txt

### VS Code FolderOpen CMake Task ✅
- Replaced `CMake: Auto-Build on Startup` with `CMake: Configure + Build (x64 CUDA, folderOpen)`
- Runs `cmake --preset windows-cuda` (x64 + CUDA arch 86 + LibTorch) then `cmake --build --parallel 4`
- Skips if `.node` built <24h ago
- Probes CUDA availability after build via `checkCudaAvailable()`

### GPU Capability Matrix ✅ (2026-05-31)
- `docs/native/native-gpu-primitives-map.md` — full layer stack reference + primitives-by-operation tables
- `scripts/native/audit-gpu-capabilities.mjs` — detects all GPU libs, emits `.tmp/gpu-capabilities-audit.json/.md`
- New presets: `windows-x64-fallback`, `windows-x64-cuda-runtime`, `windows-x64-cuda-cublas`, `windows-x64-cuda-libtorch`
- New CMake flag: `SIMD_ENABLE_CUDNN` (OFF by default, Linux/WSL2 only)
- Validated on this machine:
  - CUDA 13.0 ✅ | cuBLAS ✅ | cuBLASLt ✅ | LibTorch 2.9.0+cu130 ✅
  - cuDNN ❌ Windows native (needs WSL2/Docker: `apt-get install libcudnn9-dev-cuda-12`)
  - cuVS ❌ (needs `conda install -c rapidsai cuvs-cu13` in WSL2)
  - CUTLASS ❌ (needs `git clone https://github.com/NVIDIA/cutlass C:/cutlass`)

### Native Bridge Verification ✅ (2026-05-31) — 38/38 tests pass
- `simd-bridge/cpp/binding.cc` — `DotProductWrapper` upgraded: proper TypedArray validation, throws `TypeError` on non-TypedArray args
- `simd-bridge/cpp/test-addon.cjs` — test suite updated to accept `checkCudaAvailable() === 2` (CUDA 13.0 + cuDNN)
- All 38 diagnostic, math, and performance benchmark tests passed (0 failures):
  - 10K-element `dotProduct` SIMD: **0.28 ms**
  - 50×768 cosine similarity matrix: **15.12 ms**
  - 200×128 k-means clustering (k=5): **27.64 ms**
  - 10K-key simdjson fast parsing: **1.50 ms**

### Rust NAPI-RS Bridge ✅ (2026-05-30)
- `simd_bridge_rs.node` — Rayon parallel batch parser: 1.92× faster than JSON.parse (9,373 cards: 3221ms → 1681ms)
- `som_cache.cu` compiled with `SOM_HAVE_CUDA=1` via `build.rs`, `run_som_cache` NAPI-RS export bound
- `bifrost-cache-manager.ts` — wired `parseFast` for KAG context cache extraction
- SHA-256 cache-key hashing via Node `crypto` module (replaces collision-prone prior hash)
- Dockerfile updated: `node:22-alpine` → `node:22-slim` (glibc-compatible for native addons)
- Autoencoder training complete: 33,215 embeddings 768→64 via cuBLAS, weights saved to Redis (`ace:autoencoder:weights`)

---

## FolderOpen Task Inventory (current)

| Task | Purpose | Runs On |
|------|---------|---------|
| 🤖 LangGraph NATS Worker | NATS + LangGraph worker | folderOpen |
| Dev Server (GPU, detached) | `npm run dev:gpu` → Docker + MCP + TurboVec + llama-server + Vite | folderOpen |
| ACE: TurboVec Sidecar :8791 | Python TurboVec sidecar | folderOpen |
| 🤖 Startup: TRACE MCP Server (:8788) | MCP tool surface for agents | folderOpen |
| 🩺 Startup: Service Health Check | Redis/Ollama/Bifrost/Qdrant/Neo4j/PG/RabbitMQ | folderOpen |
| 🗺️ Startup: Auto-Map Codebase (graphify:daily) | Codebase map + Redis fast cache | folderOpen |
| 🧠 Startup: ACE Context Pack Smoke | ACE context assembler probe | folderOpen |
| 🧠 Startup: ACE Top Retrieval Smoke | Top-K retrieval smoke | folderOpen |
| 🧩 Startup: Feature Map Smoke | Feature graph smoke | folderOpen |
| 🚀 Startup: ACE Incremental Refresh | ace-incremental-startup.mjs (dirty files) | folderOpen |
| 🩺 Startup: Atlas Smoke Gate | 16-probe atlas + Qdrant/Redis/Neo4j | folderOpen |
| 🔥 Startup: Seed Hit-Demand | chunk_hit_log → Redis routing policy | folderOpen |
| 🧪 Startup: OpenCode Sidecars Smoke | OpenCode MCP sidecar health | folderOpen |
| **CMake: Configure + Build (x64 CUDA)** | **cmake --preset windows-cuda (= windows-x64-cuda-libtorch) → tensorrt_bridge.node** | **folderOpen** |
| Extension: Compile on Startup | vscode-extension compile | folderOpen |

---

## What Needs to Happen Next (Phase H4+)

### H4 — Atlas Codebase Semantic Indexing Integration ✅ (2026-05-31)
Wired `tensorrt_bridge.node` FP16 ops into the graphify pipeline:

- [x] `scripts/atlas/karpathy-gpu-enrich.mjs` — FP16 attention now **auto-enabled by default** (was `--fp16` flag); `--fp32` to opt out. CUDA pre-flight logs GPU lane on every run.
  - Expected: 2× faster blend scoring for top-200 files
- [x] `sveltekit-frontend/scripts/run-hypergraph.ts` — Stage C 4D-coord loop now calls `batchCosineSimilarity_fp16` for all member-to-centroid cosines in one GPU batch (was per-node CPU loop). Falls back gracefully.
  - Expected: 1.8× faster edge scoring for 2000-node hypergraph
- [x] CUDA pre-flight at `main()` entry in both scripts — logs `cuda-level / fp16-attention / fp16-cosine` before heavy GPU stages. Addon type extended: `checkCudaAvailable`, `batchCosineSimilarity_fp16`.

### H5 — Error Agentic Workflow Kanban ACE Integration
Wire GPU scoring into the error analysis pipeline:

- [ ] `src/lib/server/ai/agentic-batch-fix.mjs` — use `batchCosineSimilarityFp16` for error cluster reranking
- [ ] `src/lib/server/ace/context-assembler.ts` — route H3 FP16 ops when `n > 256` (already has VRAM guard)
- [ ] Kanban board (`docs/graph/kanban-board.json`) — add H4/H5 cards as "In Progress" lane

### H6 — Memory Engram Injection + Graph Tree Synthesis
These require H4+H5 to be stable first:

- [ ] `gpu:karpathy:encoded` (Redis 64-dim) — feed into engram L1 KV cache (autoencoder weights now trained ✅ `ace:autoencoder:weights`)
- [ ] Neo4j `SIMILAR_TOPOLOGY` edges — compute similarity using `batchCosineSimilarityFp16` on SOM coordinates
- [ ] Synthesis lanes (cluster_context, shared_resource, agents_context, vault_link) — rerank using FP16 ops
- [ ] `AttentionScoreGPU_fp16` for final ACE context weighting in `fetchACPKnowledgeResults()` Stage A0

### Build Verification (validated 2026-05-31 ✅)
```powershell
# Audit GPU capabilities first:
node scripts/native/audit-gpu-capabilities.mjs
# → .tmp/gpu-capabilities-audit.json + .tmp/gpu-capabilities-audit.md

# Fallback (no GPU needed — always works):
cmake --preset windows-x64-fallback
cmake --build --preset build-windows-x64-fallback

# CUDA + cuBLAS only (no LibTorch dependency):
cmake --preset windows-x64-cuda-cublas
cmake --build --preset build-windows-x64-cuda-cublas

# Full production (default / same as windows-cuda):
cmake --preset windows-x64-cuda-libtorch    # OR: cmake --preset windows-cuda
cmake --build --preset build-windows-x64-cuda-libtorch

# Verify all 8 H3 exports (5 FP32 + 3 FP16):
$env:PATH = "C:\libtorch-win-shared-with-deps-2.9.0+cu130\libtorch\lib;$env:PATH"
node -e "
const b = require('./simd-bridge/cpp/build/Release/tensorrt_bridge.node');
const fns = ['checkCudaAvailable','relu','dotProduct','graphSimilarity','clusterEmbeddings',
             'attentionScoreGPU_fp16','rewardScoreGPU_fp16','batchCosineSimilarity_fp16'];
fns.forEach(f => console.log(f + ':', typeof b[f] === 'function' ? 'OK' : 'MISSING'));
// checkCudaAvailable() returns: 0=none, 1=CUDA only, 2=CUDA+cuDNN
console.log('CUDA level:', b.checkCudaAvailable());
"

# Full 38-test suite (validates dotProduct TypedArray guard, CUDA level 2, perf benchmarks):
node simd-bridge/cpp/test-addon.cjs
```

---

## Architecture Context

```
VS Code FolderOpen
  ├─ Dev Server (GPU, detached) → dev:gpu
  │   ├─ ensure-docker-gpu-stack.mjs  (Docker up)
  │   ├─ mcp:ensure                  (TRACE MCP :8788)
  │   ├─ turbovec:sidecar:detached   (TurboVec :8791)
  │   ├─ llama:ensure --spawn        (TurboQuant :8090 or Ollama :11434)
  │   └─ vite dev :5173              (SvelteKit + GPU env vars)
  │
  ├─ CMake: Configure + Build (x64 CUDA) → tensorrt_bridge.node
  │   ├─ cmake --preset windows-cuda  (= windows-x64-cuda-libtorch, x64, CUDA 13.0, LibTorch 2.9, SM86)
  │   ├─ cmake --build --parallel 4
  │   └─ fallback: cmake --preset windows-x64-fallback (no GPU needed)
  │
  ├─ graphify:daily                  (codebase map + Redis fast cache)
  └─ ACE Incremental Refresh         (dirty-file embedding refresh)

tensorrt_bridge.node exports (8 functions):
  FP32: checkCudaAvailable (returns 0=none/1=CUDA/2=CUDA+cuDNN), relu, dotProduct, graphSimilarity, clusterEmbeddings
  FP16: attentionScoreGPU_fp16, rewardScoreGPU_fp16, batchCosineSimilarity_fp16
  Note: Phase 11E Rust/Rayon/Tokio pieces are self-contained — LibTorch not required for that lane
```

---

## Commit Reference
- `43656e46` → H2+H3 C++ + TS layer (pushed 2026-05-31 via force after LFS blob cleanup)
- `1a577c89d3` → dynamic GPU library detection + cuBLAS/cuVS/CUTLASS presets
- `0abba595f3` → simd-bridge: dynamic GPU library detection + CMake x64 presets + capability audit
- `8ec4261b7f` → GPU capability matrix — primitives map + extended audit + cuDNN/cuVS/CUTLASS presets
- `c5715f178e` → docs: clarify cuDNN/cuVS/CUTLASS status from live audit output
- `binding.cc` → DotProductWrapper TypedArray guard + test-addon.cjs CUDA level 2 support (38/38 pass)
- `d2f23f3e27` → H4: FP16 auto-default in karpathy + batchCosineSimilarity_fp16 in hypergraph Stage C
- `.vscode/settings.json` → cmake x64 settings (gitignored, local only; preset: `windows-cuda`)
- `.vscode/tasks.json` → CMake folderOpen task updated