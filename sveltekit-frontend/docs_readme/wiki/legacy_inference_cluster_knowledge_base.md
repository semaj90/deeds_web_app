# 🏛️ Legacy WebGPU Inference Architecture

## Overview
This architectural cluster represents an early, highly experimental phase of the application where AI inference, Semantic Caching, and Markdown processing were executed **client-side directly on the user's GPU** rather than piped to a Python/Triton backend.

It is heavily optimized for `NVIDIA H100` and modern WebGPU environments but was later superseded by robust backend LLM architectures.

---

## ⚡ Core Systems

### 1. The WebGPU Compute Pipeline
**Location:** `/src/lib/gpu` & `/src/lib/webgpu`

Instead of relying on an external Vector Database (like Qdrant or Pinecone), this architecture built raw mathematical compute shaders (`WGSL`) directly into the frontend.

* **[[som-webgpu-cache.ts]]**: A monumental engineering feat. This file loads a raw string of C-like `WGSL` shader code containing a hand-written **PageRank Algorithm**. It injects Svelte/NPM errors into the user's GPU, parallel-calculates their dot-product similarity against raw adjacency matrices, and dumps the prioritized results straight into local `IndexedDB`.
* **[[markdown-processor.ts]]**: Rather than using a standard library like `marked`, this file streams actual Markdown strings into the GPU buffer. The GPU parallel-scans the raw bytes (checking ASCII code `35u` for `#`) to chunk legal sections (`FACTS`, `REASONING`) at lightning speed.

### 2. The Native C++ / NVCC Bindings
**Location:** `/src/native`

* **[[ast-error-vectorizer.cc]]**: A raw C++ library utilizing `libtorch` (PyTorch C++ API) and `cuBLAS`. It ingests Svelte compiler errors, tokenizes them, runs them through a localized BERT model, and executes L2 normalization on the GPU before passing the 768-d tensor back to Node.js.

### 3. The XState Machine Farm
**Location:** `/src/lib/machines`

A massive cluster of state machines (`auth-machine.ts`, `retrieval-machine.ts`, `evidence-lifecycle.ts`) built to rigorously control the flow of data between the UI and the asynchronous GPU operations. 

---

## 🛑 Why Was This Superseded?

### 1. The Bottlenecks of Native Architecture
The goal of this codebase was to build a **"Bifrost" bridge to forcefully execute Directed Acyclic Graph (DAG) RAG and 1-bit LLM quantization directly inside the user's browser.**
- **WASM Constraints**: While WASM executes near-native CPU speeds, it historically lacked direct hardware GPU acceleration (WebNN was too experimental). 
- **WebGPU Limitations**: The WGSL computation was deeply brilliant but deeply brittle. It required raw byte manipulations (like matching ASCII `70u` for 'F' to find "FACTS"), meaning standard non-legal documents would instantly break the memory bridge.
- **Node C++ Binding Isolations**: Using NVIDIA cuBLAS bindings in the Svelte frontend heavily handcuffed the UI to strict backend environments.

### 2. The Move to External Services
By migrating to standard external Python backends (like Dockerized Triton servers or FastMCP agent systems), the frontend UI achieved the exact same RAG processing power while boosting stability across all edge-network devices.

## 🔗 Connections
- Tags: #webgpu #wgsl #libtorch #legacy-code #inference
- Replaced By: [[ContextualService]] & [[TritonBackend]]
