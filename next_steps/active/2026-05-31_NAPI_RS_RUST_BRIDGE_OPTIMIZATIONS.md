# N-API.rs & Rust Native Bridge Optimization Plan

This document outlines the architectural next steps for transitioning the native acceleration layer (`simd-bridge/`) from C++ (`node-addon-api`) to Rust (`napi-rs`) and aligning production runtime containers.

## Context & Background
- **Yesterday**: Drizzle schema drift, foreign key mismatches, and orphan column cleanups were successfully audited and corrected.
- **Today**: Native C++ bridge (`tensorrt_bridge.node`) and GPU CUDA `LibTorch` builds were fixed, resolving type assertions and cuDNN initialization codes (38/38 test suite passing).
- **Core Need**: Improve pipeline throughput, implement safe CPU multi-threading, and prevent network timeouts on heavy batch runs.

---

## Proposed Optimizations

### 1. Rayon-powered Card Processing (OpenCode Ingestion)
- **Problem**: Ingestion of 9,372 OpenCode cards parses large JSON lists in a single-threaded Node.js block.
- **Optimization**: Transition card directory scrolling to a Rust-native threadpool using `napi-rs` and `Rayon`. Concurrently parse card buffers with zero-copy binary mappings.

### 2. Async Non-blocking GPU Jobs (Tokio Runtime)
- **Problem**: Heavy GPU matrix operations (e.g., k-means, SOM grid training) block the Node.js event loop during intensive calculations.
- **Optimization**: Run active inference tasks using thread-safe Rust workers communicating over tokio channels.

### 3. Unified Production Container Target
- **Problem**: DLL/shared object path discrepancies between Windows, WSL2, and Docker host runtimes.
- **Optimization**: Build a single target container sharing aligned pre-compiled binaries:
  - `libsimdjson.so`
  - `libtorch_cuda.so`
  - `libcuvs.so` (CAGRA / IVF-PQ search engines)

### 4. Client-Side WebGPU & Speculative Decoding
- **Problem**: Large model inference round-trips to the server introduce network latency.
- **Optimization**: Run client-side draft model inference (e.g. Granite-Docling 258M) using browser WebGPU shaders, and implement server-side Speculative Decoding token validation cascades. Use `SharedArrayBuffer` for zero-copy weight passing between SvelteKit Web Workers, Service Workers, and IndexedDB.

---

## Active TODO Checklist

- [ ] **Phase 1 — Setup Rust Crate & NAPI-RS scaffolding**
  - Create `simd-bridge/rust/` with Cargo manifest.
  - Configure `napi-rs` compile boundaries.
- [ ] **Phase 2 — Port simdjson parses to Rust**
  - Implement `fast_json_parse` using Rust's `simd-json` crate.
  - Benchmark V8 translation speedups.
- [ ] **Phase 3 — Wrap CUDA SOM autoencoder**
  - Bind existing `som_cache.cu` CUDA kernels into the Rust build chain.
- [ ] **Phase 4 — Container Alignment**
  - Setup unified production Dockerfile referencing identical runtime shared library versions.
- [ ] **Phase 5 — Client-Side WebGPU & Speculative decoding**
  - Deploy local WebGPU draft inference engine inside a Web Worker.
  - Setup Service Worker caching of tensors via IndexedDB.
  - Establish `SharedArrayBuffer` thread boundary for zero-copy memory transfers.
  - Wire speculative decoding token verification cascade to SvelteKit's generation router.
