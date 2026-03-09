# Emscripten SDK (emsdk) — Archive Analysis

## Date: March 9, 2026
## Verdict: DELETE — no longer needed

---

## What This Was

A cloned copy of the [Emscripten SDK](https://github.com/emscripten-core/emsdk) at `src/lib/wasm/deps/emsdk/`. Emscripten compiles C/C++/Rust to WebAssembly (`.wasm`) via its `emcc` compiler toolchain.

This was used during early development (2024-2025) to experiment with custom WASM builds for browser-side inference — compiling C++ inference code to run in the browser before the ONNX Runtime WebGPU approach was adopted.

## Why It's No Longer Needed

The active WASM/GPU stack uses three completely different approaches, none requiring Emscripten:

| Layer | Technology | How WASM Is Provided |
|-------|-----------|---------------------|
| **Browser inference** | ONNX Runtime WebGPU | Pre-built `.wasm` binaries from `node_modules/onnxruntime-web/dist/` → copied to `static/ort/` |
| **GPU compute** | WebGPU WGSL shaders | Pure GPU shader language — no WASM compilation needed |
| **Native acceleration** | simd-bridge (LibTorch/CUDA) | CMake + N-API C++ addon — compiles to `.node`, not `.wasm` |

**Zero active source files** in `sveltekit-frontend/src/` or `go-microservice/` import or reference `emsdk`, `emscripten`, or `emcc`.

## Location

- **Original path**: `src/lib/wasm/deps/emsdk/` (root-level `src/`, archived to `deeds_labs/legacy-projects/`)
- **Size**: ~4.1 MB (partial clone, not the full 500MB+ installed SDK)
- **Type**: Embedded git repository (has its own `.git/`) — cannot be tracked by parent repo

## Active WASM Setup (for reference)

```bash
# After cloning, copy ONNX Runtime WASM binaries:
cp node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded*.wasm sveltekit-frontend/static/ort/

# Three .wasm files needed (11-24 MB each, gitignored):
# ort-wasm-simd-threaded.wasm          (11.4 MB)
# ort-wasm-simd-threaded.jsep.wasm     (22.7 MB)
# ort-wasm-simd-threaded.asyncify.wasm (24.3 MB)
```