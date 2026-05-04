# Compiler Landscape — tsgo vs PyTorch vs WASM

These are three different kinds of "compiler" solving different problems.

---

## tsgo / TypeScript 7 Compiler

`tsgo` is a TypeScript type checker and code transformer written in Go. It reads `.ts`, `.tsx`, and Svelte-related TypeScript source, builds a graph of files and types, checks structural compatibility, and emits JavaScript and declaration output.

The hard problem is dependency and type-graph traversal: resolving whether type A satisfies interface B across many files, imports, generics, unions, and circular dependencies.

`tsgo` gets faster because Go can parallelize compiler work across CPU cores with goroutines and shared memory. It does not use CUDA, tensor cores, cuBLAS, VRAM, PyTorch, or GPU matrix math.

**In this repo:**

- `tsgo` / TypeScript 7 is for type health and developer speed.
- It outputs JavaScript, declaration files, and `.tsbuildinfo`.
- It may benefit indirectly from CPU string/scanning optimizations in the Go runtime.
- It never performs ML tensor computation.

---

## PyTorch / TorchInductor / Triton

PyTorch's compiler stack solves a different problem: tensor computation.

When `torch.compile(model)` is used, PyTorch can trace tensor operations, lower them through TorchInductor, fuse operations, generate Triton kernels, and compile GPU code for NVIDIA hardware. The hard problem is efficient tensor execution: matrix multiplication, memory layout, kernel fusion, batching, and reducing unnecessary GPU memory traffic.

This is where CUDA, cuBLAS, tensor cores, and PTX matter.

**In this repo, the equivalent production lane is not Python PyTorch itself, but the native GPU bridge:**

- `tensorrt_bridge.node`
- LibTorch / C++ / N-API
- CUDA / cuBLAS-backed operations
- k-means, PageRank, cosine similarity, attention scoring

That bridge is effectively the repo's PyTorch-style tensor runtime for Node.js production paths.

---

## WASM / WebAssembly

WASM is a portable binary target for running compiled C, C++, Rust, or similar code in browsers and Node.js. It is good for portability and sandboxing.

Baseline WASM is not a GPU tensor runtime. It does not directly expose CUDA, tensor cores, GPU shared memory, or cuBLAS. WASM SIMD exists — it is 128-bit SIMD — but it is still far below WebGPU or CUDA for large matrix multiplication. The practical bottleneck is that WASM cannot directly access tensor cores or GPU shared memory, and it cannot fuse kernel launches the way Triton does.

**For ML in the browser, the correct acceleration ladder is:**

1. WebGPU (preferred — can access GPU compute shaders)
2. WASM SIMD (fallback — portable but limited for large GEMM)
3. CPU scalar (last resort)

That is why ONNX Runtime browser execution should prefer WebGPU when available. WASM SIMD is useful as a fallback, not a target.

---

## Actual Runtime Split in This Repo

```
RTX 3060 Ti / CUDA
├─ Gemma4 GGUF inference
│  └─ llama-server.exe / llama.cpp
│     ├─ CUDA backend
│     ├─ cuBLAS GEMM
│     ├─ tensor-core matmul where supported
│     ├─ KV cache q8_0 (default)
│     ├─ KV cache q4_0 (experimental memory saver)
│     └─ TurboQuant tq4_0 (benchmark-only until smoke-tested)
│
├─ EmbeddingGemma
│  └─ Ollama / local runtime
│     └─ 768-dimensional retrieval vectors
│
├─ Native graph/tensor bridge
│  └─ tensorrt_bridge.node (C++ N-API, simd-bridge/cpp/)
│     ├─ kmeansWithCentroids
│     ├─ pageRankGPU
│     ├─ attentionScoreGPU
│     └─ cosine similarity operations
│
└─ Browser ONNX fallback (static/ort/, static/gemma3_270m_onnx/)
   ├─ WebGPU (preferred)
   ├─ WASM SIMD (fallback)
   └─ CPU scalar (last resort)

tsgo / TypeScript 7
└─ CPU-only compiler / type checker
   ├─ Go goroutines
   ├─ type graph traversal
   ├─ source parsing
   ├─ JavaScript / declaration emit
   ├─ .tsbuildinfo reuse
   └─ no CUDA / no VRAM / no cuBLAS
```

---

## PyTorch vs Native N-API GPU Bridge

| Area | PyTorch Python | Native N-API Bridge (`tensorrt_bridge.node`) |
|------|---------------|----------------------------------------------|
| Language | Python | C++ N-API called from TypeScript |
| Compiler path | `torch.compile` → TorchInductor → Triton/PTX | Precompiled CUDA/cuBLAS-backed operations |
| Best use | Training, research, flexible experimentation | Production fixed ops |
| Startup overhead | Higher (Python process + GIL) | Lower (native addon in same process) |
| Runtime control | PyTorch-managed | App-managed |
| Good for | Model experimentation | k-means, PageRank, cosine, attention scoring |

For fixed operations like k-means, PageRank, cosine similarity, and attention scoring, the native bridge can be faster and simpler than invoking Python because it avoids Python process/GIL/startup overhead and can call optimized native operations directly.

---

## Key Rule

The word "compiler" means different things here:

- **tsgo**: compiles and checks TypeScript source. No linear algebra needed.
- **WASM**: compiles portable bytecode. Can run math, but is not a GPU tensor runtime.
- **PyTorch / LibTorch / Triton**: compiles or executes tensor graphs. This is the linear-algebra/GPU lane.

**For this repo:**

| Task | Use |
|------|-----|
| Fast type checking and CI feedback | `tsgo` / `npm run check:ts7` |
| Retrieval vectors | EmbeddingGemma → Qdrant |
| Memory and graph state | Redis / Postgres / Neo4j |
| Synthesis and agent reasoning | llama-server / Gemma4 / Ollama |
| Graph and tensor acceleration | Native CUDA/LibTorch bridge (`tensorrt_bridge.node`) |
| Browser inference | ONNX Runtime WebGPU → WASM SIMD → CPU fallback |
