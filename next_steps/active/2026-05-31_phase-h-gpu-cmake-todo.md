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
  - `cmake.defaultConfigurePreset` → `windows-cuda`
- Deleted stale `build/` at workspace root (had `CMAKE_GENERATOR_PLATFORM=win32`)
- `CMakePresets.json` `windows-cuda` preset already has `architecture: x64`, CUDA 13.0, LibTorch 2.9

### VS Code FolderOpen CMake Task ✅
- Replaced `CMake: Auto-Build on Startup` with `CMake: Configure + Build (x64 CUDA, folderOpen)`
- Runs `cmake --preset windows-cuda` (x64 + CUDA arch 86 + LibTorch) then `cmake --build --parallel 4`
- Skips if `.node` built <24h ago
- Probes CUDA availability after build via `checkCudaAvailable()`

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
| **CMake: Configure + Build (x64 CUDA)** | **cmake --preset windows-cuda → tensorrt_bridge.node** | **folderOpen** |
| Extension: Compile on Startup | vscode-extension compile | folderOpen |

---

## What Needs to Happen Next (Phase H4+)

### H4 — Atlas Codebase Semantic Indexing Integration
Wire `tensorrt_bridge.node` FP16 ops into the graphify pipeline for faster semantic indexing:

- [ ] `scripts/karpathy-gpu-enrich.mjs` — replace `attentionScoreGPU` calls with `attentionScoreGPU_fp16`
  - Expected: 2× faster blend scoring for top-200 files (currently ~30s → ~15s)
- [ ] `scripts/run-hypergraph.ts` — replace `batchCosineSimilarity` with `batchCosineSimilarityFp16`
  - Expected: 1.8× faster edge scoring for 2000-node hypergraph (currently ~128s → ~70s)
- [ ] `graphify:full` pipeline — add CUDA pre-flight check before heavy GPU stages
  - Read `gpu:karpathy:summary` from Redis to detect stale GPU index
  - Use `replayGraphOnStream` for concurrent rerank passes

### H5 — Error Agentic Workflow Kanban ACE Integration
Wire GPU scoring into the error analysis pipeline:

- [ ] `src/lib/server/ai/agentic-batch-fix.mjs` — use `batchCosineSimilarityFp16` for error cluster reranking
- [ ] `src/lib/server/ace/context-assembler.ts` — route H3 FP16 ops when `n > 256` (already has VRAM guard)
- [ ] Kanban board (`docs/graph/kanban-board.json`) — add H4/H5 cards as "In Progress" lane

### H6 — Memory Engram Injection + Graph Tree Synthesis
These require H4+H5 to be stable first:

- [ ] `gpu:karpathy:encoded` (Redis 64-dim) — feed into engram L1 KV cache once autoencoder is trained
- [ ] Neo4j `SIMILAR_TOPOLOGY` edges — compute similarity using `batchCosineSimilarityFp16` on SOM coordinates
- [ ] Synthesis lanes (cluster_context, shared_resource, agents_context, vault_link) — rerank using FP16 ops
- [ ] `AttentionScoreGPU_fp16` for final ACE context weighting in `fetchACPKnowledgeResults()` Stage A0

### Build Verification (do after next VS Code reload)
```powershell
# 1. Reload VS Code (Ctrl+Shift+P → "Developer: Reload Window")
#    → "CMake: Configure + Build (x64 CUDA, folderOpen)" fires automatically
#    → Watch output in terminal panel for:
#      [ RUN ] cmake --preset windows-cuda (x64 CUDA + LibTorch)
#      [ OK ] tensorrt_bridge.node ready
#      CUDA: GPU active (RTX 3060 Ti)

# 2. Manual test if auto-task skips (already built):
cd simd-bridge/cpp
cmake --preset windows-cuda    # Should show: CUDA compiler enabled: nvcc.exe
cmake --build build --config Release --parallel 4

# 3. Verify all 8 H3 exports (5 original + 3 new FP16):
$env:PATH = "C:\libtorch-win-shared-with-deps-2.9.0+cu130\libtorch\lib;$env:PATH"
node -e "
const b = require('./simd-bridge/cpp/build/Release/tensorrt_bridge.node');
const fns = ['checkCudaAvailable','relu','dotProduct','graphSimilarity','clusterEmbeddings',
             'attentionScoreGPU_fp16','rewardScoreGPU_fp16','batchCosineSimilarity_fp16'];
fns.forEach(f => console.log(f + ':', typeof b[f] === 'function' ? 'OK' : 'MISSING'));
"
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
  │   ├─ cmake --preset windows-cuda  (x64, CUDA 13.0, LibTorch 2.9, SM86)
  │   └─ cmake --build --parallel 4
  │
  ├─ graphify:daily                  (codebase map + Redis fast cache)
  └─ ACE Incremental Refresh         (dirty-file embedding refresh)

tensorrt_bridge.node exports (8 functions):
  FP32: checkCudaAvailable, relu, dotProduct, graphSimilarity, clusterEmbeddings
  FP16: attentionScoreGPU_fp16, rewardScoreGPU_fp16, batchCosineSimilarity_fp16
```

---

## Commit Reference
- `43656e46` → H2+H3 C++ + TS layer (pushed 2026-05-31 via force after LFS blob cleanup)
- `.vscode/settings.json` → cmake x64 settings (gitignored, local only)
- `.vscode/tasks.json` → CMake folderOpen task updated