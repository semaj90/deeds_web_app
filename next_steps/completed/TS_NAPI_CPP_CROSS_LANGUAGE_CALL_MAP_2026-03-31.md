# TS -> N-API -> C++ CROSS-LANGUAGE CALL MAP — March 31, 2026
## Current Verified Wiring Plus Mermaid Skeleton

---

## Verified Active TS Consumers

### Native JSON Acceleration Path

`tensorrt_bridge.node` is actively loaded by:

- `sveltekit-frontend/src/lib/server/gpu/simdjson-bridge.ts`

TS consumers of that bridge:

- `sveltekit-frontend/src/lib/server/cache.ts`
- `sveltekit-frontend/src/lib/server/vector/qdrant-manager.ts`
- `sveltekit-frontend/src/routes/api/codebase-index/analyze/+server.ts`
- `sveltekit-frontend/src/routes/api/codebase-index/graph/+server.ts`
- `sveltekit-frontend/src/routes/api/codebase-index/stats/+server.ts`

Fallback behavior:

- falls back to `JSON.parse`
- small payloads skip native path
- native load failure is non-fatal

### Native Graph / CUDA Path

`tensorrt_bridge.node` is also actively loaded by:

- `sveltekit-frontend/src/lib/server/gpu/libtorch-bridge.ts`

TS consumers of that bridge:

- `sveltekit-frontend/src/lib/server/gpu/cuda-bridge.ts`
- `sveltekit-frontend/src/lib/server/gpu/background-analyzer.ts`
- `sveltekit-frontend/src/routes/api/gpu/compute/+server.ts`
- `sveltekit-frontend/src/routes/api/health/gpu/+server.ts`

Fallback behavior:

- `graphSimilarity` falls back to CPU cosine similarity
- `clusterEmbeddings` falls back to CPU k-means
- `computeCaseEmbedding` falls back to CPU weighted average + normalize
- `isCudaAvailable()` returns false when addon is unavailable

---

## Verified Native Build Layer

### Build Configuration

- `simd-bridge/cpp/CMakeLists.txt`
- `.vscode/settings.json`
- `.github/workflows/error-analysis.yml`

### Verified Build Artifact

- `simd-bridge/cpp/build/Release/tensorrt_bridge.node`

### Verified Export Layer In `binding.cc`

Exports or wrapper functions present for:

- `bridgeSIMD`
- `checkCudaAvailable`
- `graphSimilarity`
- `clusterEmbeddings`
- `computeCaseEmbedding`
- `lstmAdd`
- `somCache`
- `dotProduct`
- `scale`
- simdjson registration functions

### Verified C++ Example Layer

- `sveltekit-frontend/src/native/libtorch_inference.cc`

This file is useful for understanding intended architecture, but the active addon build path in this repo is centered on `simd-bridge/cpp/`.

---

## Cross-Language Boundary Table

| TS Entry | TS Bridge | Native Artifact | Native Export Group | Fallback |
|---------|-----------|-----------------|---------------------|----------|
| `/api/codebase-index/analyze` | `simdjson-bridge.ts` | `tensorrt_bridge.node` | simdjson parse/validate/extract | V8 JSON |
| `/api/codebase-index/graph` | `simdjson-bridge.ts` | `tensorrt_bridge.node` | simdjson parse/validate/extract | V8 JSON |
| `/api/codebase-index/stats` | `simdjson-bridge.ts` | `tensorrt_bridge.node` | simdjson parse/validate/extract | V8 JSON |
| `/api/gpu/compute` | `libtorch-bridge.ts` | `tensorrt_bridge.node` | graphSimilarity / clusterEmbeddings / computeCaseEmbedding | CPU JS |
| `/api/health/gpu` | `libtorch-bridge.ts` | `tensorrt_bridge.node` | checkCudaAvailable / graphSimilarity benchmark | CPU JS |
| background analyzer | `libtorch-bridge.ts` | `tensorrt_bridge.node` | graph and embedding math | CPU JS |

---

## Mermaid Skeleton

```mermaid
flowchart LR
  subgraph Routes
    R1[/api/codebase-index/analyze]
    R2[/api/codebase-index/graph]
    R3[/api/codebase-index/stats]
    R4[/api/gpu/compute]
    R5[/api/health/gpu]
  end

  subgraph TS_Bridges
    B1[simdjson-bridge.ts]
    B2[libtorch-bridge.ts]
    B3[cuda-bridge.ts]
    B4[background-analyzer.ts]
  end

  subgraph Native_Artifact
    N1[tensorrt_bridge.node]
  end

  subgraph Cpp_Binding
    C1[binding.cc]
  end

  subgraph Native_Exports
    E1[simdJsonParse / simdJsonValidate / simdJsonExtractNumbers]
    E2[checkCudaAvailable]
    E3[graphSimilarity]
    E4[clusterEmbeddings]
    E5[computeCaseEmbedding]
    E6[lstmAdd / somCache / dotProduct / scale]
  end

  subgraph Native_Impl
    I1[simdjson_bridge.cc]
    I2[libtorch_graph.cc]
    I3[som_cache.cu]
    I4[lstm_gpu.cu]
    I5[tensor_bridge.cc]
    I6[libtorch_stubs.cc]
  end

  subgraph Fallbacks
    F1[JSON.parse]
    F2[CPU cosine similarity]
    F3[CPU k-means]
    F4[CPU weighted embedding]
  end

  R1 --> B1
  R2 --> B1
  R3 --> B1
  R4 --> B3
  R4 --> B2
  R5 --> B2
  B4 --> B2

  B1 --> N1
  B2 --> N1
  B3 --> B2
  N1 --> C1

  C1 --> E1
  C1 --> E2
  C1 --> E3
  C1 --> E4
  C1 --> E5
  C1 --> E6

  E1 --> I1
  E3 --> I2
  E4 --> I2
  E5 --> I2
  E6 --> I3
  E6 --> I4
  E6 --> I5

  B1 -. fallback .-> F1
  B2 -. fallback .-> F2
  B2 -. fallback .-> F3
  B2 -. fallback .-> F4
  I2 -. no libtorch .-> I6
```

---

## Audit Notes

### What Is Proven

- The native addon is built.
- The TS wrappers exist.
- The TS wrappers actively load the addon.
- The GPU route and GPU health route use the wrapper.
- CPU fallback paths are implemented for the graph operations.

### What Is Still Unproven

- whether GPU execution is consistently used in production instead of CPU fallback
- whether all native exports beyond the graph subset are exercised by live code
- whether Windows and WSL2 native assumptions stay stable across deployments
- whether simdjson and graph acceleration paths are benchmark-positive under real workload

### Immediate Next Audit Step

Use this map as the starting point for a deeper runtime truth audit:

1. instrument addon-load success rate
2. log whether graph calls return `source: 'gpu'` or `source: 'cpu'`
3. benchmark `/api/gpu/compute` under realistic embedding sizes
4. compare codebase-index routes with and without native simdjson enabled
# TS -> N-API -> C++ CROSS-LANGUAGE CALL MAP — March 31, 2026
## Current Verified Wiring Plus Mermaid Skeleton

---

## Verified Active TS Consumers

### Native JSON Acceleration Path

`tensorrt_bridge.node` is actively loaded by:

- `sveltekit-frontend/src/lib/server/gpu/simdjson-bridge.ts`

TS consumers of that bridge:

- `sveltekit-frontend/src/lib/server/cache.ts`
- `sveltekit-frontend/src/lib/server/vector/qdrant-manager.ts`
- `sveltekit-frontend/src/routes/api/codebase-index/analyze/+server.ts`
- `sveltekit-frontend/src/routes/api/codebase-index/graph/+server.ts`
- `sveltekit-frontend/src/routes/api/codebase-index/stats/+server.ts`

Fallback behavior:

- falls back to `JSON.parse`
- small payloads skip native path
- native load failure is non-fatal

### Native Graph / CUDA Path

`tensorrt_bridge.node` is also actively loaded by:

- `sveltekit-frontend/src/lib/server/gpu/libtorch-bridge.ts`

TS consumers of that bridge:

- `sveltekit-frontend/src/lib/server/gpu/cuda-bridge.ts`
- `sveltekit-frontend/src/lib/server/gpu/background-analyzer.ts`
- `sveltekit-frontend/src/routes/api/gpu/compute/+server.ts`
- `sveltekit-frontend/src/routes/api/health/gpu/+server.ts`

Fallback behavior:

- `graphSimilarity` falls back to CPU cosine similarity
- `clusterEmbeddings` falls back to CPU k-means
- `computeCaseEmbedding` falls back to CPU weighted average + normalize
- `isCudaAvailable()` returns false when addon is unavailable

---

## Verified Native Build Layer

### Build Configuration

- `simd-bridge/cpp/CMakeLists.txt`
- `.vscode/settings.json`
- `.github/workflows/error-analysis.yml`

### Verified Build Artifact

- `simd-bridge/cpp/build/Release/tensorrt_bridge.node`

### Verified Export Layer In `binding.cc`

Exports or wrapper functions present for:

- `bridgeSIMD`
- `checkCudaAvailable`
- `graphSimilarity`
- `clusterEmbeddings`
- `computeCaseEmbedding`
- `lstmAdd`
- `somCache`
- `dotProduct`
- `scale`
- simdjson registration functions

### Verified C++ Example Layer

- `sveltekit-frontend/src/native/libtorch_inference.cc`

This file is useful for understanding intended architecture, but the active addon build path in this repo is centered on `simd-bridge/cpp/`.

---

## Cross-Language Boundary Table

| TS Entry | TS Bridge | Native Artifact | Native Export Group | Fallback |
|---------|-----------|-----------------|---------------------|----------|
| `/api/codebase-index/analyze` | `simdjson-bridge.ts` | `tensorrt_bridge.node` | simdjson parse/validate/extract | V8 JSON |
| `/api/codebase-index/graph` | `simdjson-bridge.ts` | `tensorrt_bridge.node` | simdjson parse/validate/extract | V8 JSON |
| `/api/codebase-index/stats` | `simdjson-bridge.ts` | `tensorrt_bridge.node` | simdjson parse/validate/extract | V8 JSON |
| `/api/gpu/compute` | `libtorch-bridge.ts` | `tensorrt_bridge.node` | graphSimilarity / clusterEmbeddings / computeCaseEmbedding | CPU JS |
| `/api/health/gpu` | `libtorch-bridge.ts` | `tensorrt_bridge.node` | checkCudaAvailable / graphSimilarity benchmark | CPU JS |
| background analyzer | `libtorch-bridge.ts` | `tensorrt_bridge.node` | graph and embedding math | CPU JS |

---

## Mermaid Skeleton

```mermaid
flowchart LR
  subgraph Routes
    R1[/api/codebase-index/analyze]
    R2[/api/codebase-index/graph]
    R3[/api/codebase-index/stats]
    R4[/api/gpu/compute]
    R5[/api/health/gpu]
  end

  subgraph TS_Bridges
    B1[simdjson-bridge.ts]
    B2[libtorch-bridge.ts]
    B3[cuda-bridge.ts]
    B4[background-analyzer.ts]
  end

  subgraph Native_Artifact
    N1[tensorrt_bridge.node]
  end

  subgraph Cpp_Binding
    C1[binding.cc]
  end

  subgraph Native_Exports
    E1[simdJsonParse / simdJsonValidate / simdJsonExtractNumbers]
    E2[checkCudaAvailable]
    E3[graphSimilarity]
    E4[clusterEmbeddings]
    E5[computeCaseEmbedding]
    E6[lstmAdd / somCache / dotProduct / scale]
  end

  subgraph Native_Impl
    I1[simdjson_bridge.cc]
    I2[libtorch_graph.cc]
    I3[som_cache.cu]
    I4[lstm_gpu.cu]
    I5[tensor_bridge.cc]
    I6[libtorch_stubs.cc]
  end

  subgraph Fallbacks
    F1[JSON.parse]
    F2[CPU cosine similarity]
    F3[CPU k-means]
    F4[CPU weighted embedding]
  end

  R1 --> B1
  R2 --> B1
  R3 --> B1
  R4 --> B3
  R4 --> B2
  R5 --> B2
  B4 --> B2

  B1 --> N1
  B2 --> N1
  B3 --> B2
  N1 --> C1

  C1 --> E1
  C1 --> E2
  C1 --> E3
  C1 --> E4
  C1 --> E5
  C1 --> E6

  E1 --> I1
  E3 --> I2
  E4 --> I2
  E5 --> I2
  E6 --> I3
  E6 --> I4
  E6 --> I5

  B1 -. fallback .-> F1
  B2 -. fallback .-> F2
  B2 -. fallback .-> F3
  B2 -. fallback .-> F4
  I2 -. no libtorch .-> I6
```

---

## Audit Notes

### What Is Proven

- The native addon is built.
- The TS wrappers exist.
- The TS wrappers actively load the addon.
- The GPU route and GPU health route use the wrapper.
- CPU fallback paths are implemented for the graph operations.

### What Is Still Unproven

- whether GPU execution is consistently used in production instead of CPU fallback
- whether all native exports beyond the graph subset are exercised by live code
- whether Windows and WSL2 native assumptions stay stable across deployments
- whether simdjson and graph acceleration paths are benchmark-positive under real workload

### Immediate Next Audit Step

Use this map as the starting point for a deeper runtime truth audit:

1. instrument addon-load success rate
2. log whether graph calls return `source: 'gpu'` or `source: 'cpu'`
3. benchmark `/api/gpu/compute` under realistic embedding sizes
4. compare codebase-index routes with and without native simdjson enabled
