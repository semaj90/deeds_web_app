# TS -> N-API -> C++ AST GRAPH AUDIT CHECKLIST — March 31, 2026
## Legal AI Platform (Deeds Web App)

---

## Purpose

This checklist is for auditing native-code and cross-language wiring as a tooling and architecture-visibility program, not as a live runtime dependency review.

Use it to answer five questions:

1. Which TypeScript routes and services depend on graph or native acceleration paths?
2. Which Node.js modules call native boundaries, or are intended to?
3. Which C++ files export N-API entrypoints?
4. Which native paths require CUDA or LibTorch, and where are CPU fallbacks?
5. Where are exceptions swallowed, health checks faked, or runtime assumptions undocumented?

---

## Current Repo Signals

### Verified Native and Graph-Relevant Files

- `sveltekit-frontend/src/native/libtorch_inference.cc`
- `sveltekit-frontend/src/routes/api/error-brain/diagnose/+server.ts`
- `sveltekit-frontend/src/lib/server/graph/pg-neo4j-sync.ts`
- `sveltekit-frontend/src/lib/server/graph/graph-centrality.ts`
- `sveltekit-frontend/src/lib/server/graph/user-interaction-sync.ts`
- `sveltekit-frontend/src/lib/server/graph/neo4j-schema.ts`
- `sveltekit-frontend/src/lib/server/graph/evidence-graph-service.ts`
- `sveltekit-frontend/src/routes/api/graph/relationships/+server.ts`
- `sveltekit-frontend/src/routes/api/graph/connections/+server.ts`
- `sveltekit-frontend/src/routes/api/graph/sync/+server.ts`
- `sveltekit-frontend/src/lib/server/inference/inference-router.ts`
- `sveltekit-frontend/src/routes/api/health/capabilities/+server.ts`
- `.vscode/settings.json`
- `.github/workflows/error-analysis.yml`
- `simd-bridge/cpp/` as the configured CMake native workspace

### Verified Native Signals

From `sveltekit-frontend/src/native/libtorch_inference.cc`:

- Uses `torch/torch.h`
- Uses `cuda_runtime.h`
- Uses `napi.h`
- Declares `InferenceAddon` as a `Napi::ObjectWrap`
- Exposes `forward`, `getErrorCount`, and `exportErrors`
- Registers `NODE_API_MODULE(libtorch_inference, InitAll)`

### Verified Build and Tooling Signals

- `.vscode/settings.json` points CMake at `simd-bridge/cpp`
- `.vscode/settings.json` sets LibTorch and CUDA include paths
- `.github/workflows/error-analysis.yml` contains CMake configuration steps
- Repo notes indicate `simd-bridge/cpp/build/Release/tensorrt_bridge.node` has been built before

---

## Audit Scope

Split the work into four graphs.

### 1. TypeScript Route Graph

Goal: identify every route that participates in graph analysis, diagnosis, GPU inference, or native-adjacent orchestration.

Checklist:

- [ ] Enumerate all routes under `sveltekit-frontend/src/routes/api/graph/`
- [ ] Enumerate all routes under `sveltekit-frontend/src/routes/api/error-brain/`
- [ ] Enumerate all routes under `sveltekit-frontend/src/routes/api/ai/` that mention CUDA, TensorRT, or GPU
- [ ] Enumerate all routes under `sveltekit-frontend/src/routes/api/health/` that expose GPU or graph capability
- [ ] Record which routes are user-facing, admin-facing, background-only, or diagnostic-only
- [ ] Record which routes are synchronous and which enqueue work via RabbitMQ
- [ ] Record which routes degrade gracefully and which return hard failure

Deliverable:

- A route dependency table: `route -> service -> store -> fallback`

---

## 2. TypeScript Service Graph

Goal: map the Node.js orchestration layer before touching native code.

Checklist:

- [ ] Trace imports from `error-brain/diagnose/+server.ts` into AST, cache, and reranking modules
- [ ] Trace imports from `inference-router.ts` into TRT-LLM, Ollama, and GPU lease logic
- [ ] Trace imports from graph routes into `neo4j-driver.ts`, `pg-neo4j-sync.ts`, and graph service modules
- [ ] Identify every service that claims CUDA, TensorRT, LibTorch, SIMD, or native acceleration
- [ ] Mark each service as one of: active, partial, stub, archived, or proof-of-concept
- [ ] Identify whether each service is in the live request path or only in a maintenance/diagnostic path

Key files to inspect first:

- `sveltekit-frontend/src/routes/api/error-brain/diagnose/+server.ts`
- `sveltekit-frontend/src/lib/server/inference/inference-router.ts`
- `sveltekit-frontend/src/lib/server/graph/pg-neo4j-sync.ts`
- `sveltekit-frontend/src/lib/server/graph/graph-centrality.ts`
- `sveltekit-frontend/src/lib/server/neo4j-driver.ts`

Deliverable:

- A service graph: `route -> TS service -> external boundary`

---

## 3. TS -> N-API Boundary Audit

Goal: prove whether Node actually calls any native addon today.

Checklist:

- [ ] Search for `.node` loading in TypeScript or JavaScript files
- [ ] Search for `require()` or dynamic `import()` that references native build output
- [ ] Search for wrapper modules around `tensorrt_bridge.node`, `InferenceAddon`, or LibTorch-related exports
- [ ] Verify whether `simd-bridge/cpp/build/Release/*.node` is consumed by any active TS file
- [ ] Verify whether native code is loaded only in diagnostics, build scripts, or dead code
- [ ] Distinguish “configured for build” from “loaded at runtime”

Expected result today:

- Native build tooling appears configured.
- A direct live TS -> N-API call path is not yet proven.

Deliverable:

- A boundary map: `TS module -> native wrapper -> exported symbol -> runtime status`

---

## 4. C++ Export Graph Audit

Goal: capture what the native layer exports and what it expects from the environment.

Checklist:

- [ ] List all C++ and CUDA source files under `simd-bridge/cpp/` and `sveltekit-frontend/src/native/`
- [ ] For each file, record whether it is example-only, actively built, or runtime-loaded
- [ ] Identify all `NODE_API_MODULE`, `Init`, `DefineClass`, and `InstanceMethod` entrypoints
- [ ] Record all exported methods and expected argument types
- [ ] Record all direct dependencies on CUDA, LibTorch, TensorRT, or filesystem model paths
- [ ] Record all logging and exception behavior

Based on current verified example file:

- Exported class: `InferenceAddon`
- Exported methods: `forward`, `getErrorCount`, `exportErrors`
- CUDA dependency: hard-required for `module_.to(torch::kCUDA)` and CUDA kernel execution
- CPU fallback: not implemented in the example file

Deliverable:

- A symbol table: `C++ file -> export -> dependency -> fallback -> exception policy`

---

## 5. CUDA Requirement and Fallback Audit

Goal: distinguish hard CUDA paths from graceful degradation paths.

Checklist:

- [ ] Mark every path that hard-codes CUDA device transfer, such as `torch::kCUDA`
- [ ] Mark every path that compiles only when CUDA toolkit and LibTorch are installed
- [ ] Mark every Node route that already falls back to Ollama, WebGPU, WASM SIMD, or CPU
- [ ] Identify where GPU lease policy exists and where it does not
- [ ] Identify where TensorRT and PyTorch are expected to be remote services instead of in-process native modules

Current expectation:

- Browser path already has WebGPU -> WASM SIMD -> CPU fallback
- Server inference router already has TRT-LLM -> LiteLLM -> Ollama fallback
- Native C++ example path appears CUDA-hard, not fallback-safe

Deliverable:

- A fallback table: `path -> hard dependency -> fallback available -> operational risk`

---

## 6. Exception and Silent-Failure Audit

Goal: find the places where native or cross-language failures disappear instead of surfacing clearly.

Checklist:

- [ ] Inspect all native wrappers for catch-all exception handling
- [ ] Inspect all TS native boundary modules for empty catches or `return null` behavior
- [ ] Inspect health endpoints for success signals that do not prove real work execution
- [ ] Inspect runtime capability endpoints for configuration-only truth instead of execution truth
- [ ] Inspect queue consumers and graph sync jobs for best-effort failure swallowing

Red flags to capture:

- hard-coded `catch {}` without logging
- health probes that only check port reachability
- routes that imply acceleration but silently route to fallback every time
- build artifacts present but never imported

Deliverable:

- A silent-failure register with file paths and severity

---

## 7. Build Proof Audit

Goal: separate “configured” from “proven.”

Checklist:

- [ ] Verify `simd-bridge/cpp/CMakeLists.txt` exists and record its targets
- [ ] Verify whether `simd-bridge/cpp/build/Release/*.node` exists now
- [ ] Verify whether CI builds native targets or only configures CMake
- [ ] Verify whether production startup depends on those artifacts
- [ ] Record required environment assumptions: CUDA version, LibTorch version, MSVC, WSL2, GPU arch, driver version

Current repo signals already indicate:

- CMake workspace is configured in VS Code
- CUDA arch is set to RTX 3060 Ti SM 8.6
- LibTorch path is configured in editor settings
- Native build is treated as specialized tooling, not standard app bootstrap

Deliverable:

- A build-proof table: `target -> built in CI? -> built locally? -> loaded in app?`

---

## 8. Recommended Output Artifacts

After running the audit, produce these artifacts:

1. `route-service-dependency-map.json`
2. `ts-native-boundary-map.json`
3. `cpp-export-symbols.json`
4. `cuda-fallback-matrix.json`
5. `silent-failure-register.md`
6. `cross-language-call-graph.mmd`

The Mermaid graph should show:

- TS routes
- TS services
- queue boundaries
- graph boundaries
- native wrapper boundaries
- C++ export nodes
- CUDA-only nodes
- fallback nodes

---

## 9. Priority Order

Run the audit in this sequence:

1. Prove the TS live request path.
2. Prove the TS service graph.
3. Prove whether any native addon is actually loaded.
4. Prove what native exports exist.
5. Prove CUDA-hard versus fallback-safe boundaries.
6. Record silent failures and misleading health signals.

Do not start by reading C++ in isolation. Start from active routes and work downward.

---

## Bottom Line

This repo already has strong TypeScript graph and inference orchestration layers. The missing visibility is the cross-language map between:

- SvelteKit routes
- Node services
- optional native addons
- C++ exports
- CUDA and LibTorch assumptions
- fallback boundaries

That is the right audit to perform before promoting TRT-LLM, PyTorch VLM, or native AST acceleration into a stricter production role.