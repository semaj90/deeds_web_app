# Emscripten SDK (emsdk) — Archive Analysis

## Date: March 9, 2026
## Verdict: DELETE — no longer needed

---

## What This Was

A cloned copy of the [Emscripten SDK](https://github.com/emscripten-core/emsdk) at `src/lib/wasm/deps/emsdk/`. Emscripten compiles C/C++/Rust to WebAssembly (`.wasm`) via its `emcc` compiler toolchain.

This was used during early development (2024-2025) to experiment with custom WASM builds for browser-side inference — compiling C++ inference code to run in the browser before the ONNX Runtime WebGPU approach was adopted.

### Explained Like I Was 5

Normally, web browsers can only run JavaScript. But what if you have a really fast program written in C++? Emscripten is a magic translator that turns that C++ program into something the browser CAN run (called WebAssembly). We used it early on to try running AI stuff directly in the browser. But then we found a better way — ONNX Runtime already comes with its own pre-translated browser files, so we don't need to do the translating ourselves anymore. It's like buying pre-sliced bread instead of owning a bread slicer.

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

## Unbuilt WASM Scaffolding (Future Opportunity)

The codebase has 6 custom WASM modules scaffolded with JS mock fallbacks — none have real `.wasm` binaries:

| Scaffolded Module | File | What It Would Do | Current Status |
|-------------------|------|-----------------|----------------|
| `simdjson.wasm` | `lib/wasm/webassembly-accelerator.ts` | SIMD-accelerated JSON parsing | **Mock** — JS fallback |
| `vector-ops.wasm` | `lib/wasm/webassembly-accelerator.ts` | Fast vector math (dot product, cosine) | **Mock** — JS fallback |
| `ocr-processor.wasm` | `lib/wasm/webassembly-accelerator.ts` | Client-side OCR text extraction | **Mock** — JS fallback |
| `ultra-json.wasm` | `lib/utils/ultra-json-parser.ts` | Ultra-fast JSON parser | **Mock** — `JSON.parse` fallback |
| Legal processor | `lib/wasm/legal-processor.ts` | PDF extraction, entity detection, citations | **Mock** — `createMockWasmModule()` |
| Graph engine | `lib/wasm/graphEngine.ts` | Graph query/traversal engine | **Mock** — `loadMockWasmModule()` |

If these custom WASM modules are ever built, install a fresh emsdk:
```bash
git clone https://github.com/emscripten-core/emsdk
cd emsdk && ./emsdk install latest && ./emsdk activate latest
source ./emsdk_env.sh
emcc my_module.c -o static/wasm/my_module.wasm -O3 -s WASM=1
```

## Active WASM Setup (for reference)

```bash
# After cloning, copy ONNX Runtime WASM binaries:
cp node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded*.wasm sveltekit-frontend/static/ort/

# Three .wasm files needed (11-24 MB each, gitignored):
# ort-wasm-simd-threaded.wasm          (11.4 MB)
# ort-wasm-simd-threaded.jsep.wasm     (22.7 MB)
# ort-wasm-simd-threaded.asyncify.wasm (24.3 MB)
```