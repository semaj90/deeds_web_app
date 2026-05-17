# VRAM Hygiene & Workstation GPU Memory Policy

This document establishes the official Parent Atlas VRAM hygiene boundaries, memory budget structures, and native locking policies for the **RTX 3060 Ti 8GB** workstation inference architecture.

---

## 1. Architectural Principles

1. **Qdrant 768d is the Canonical Truth**: Vector embeddings generated and persisted to the Qdrant `codebase_chunks_768` collection remain the authoritative high-dimensional semantic indexing layer.
2. **Redis/BitFrost is Rebuildable Hot Cache**: Cache namespaces (`llms:`, `ace:`, `gpu:`) exist strictly to accelerate routing and bypass redundant GPU/embedding calls. They must be strictly ephemeral and rebuildable at any time.
3. **No GPU-Resident Retrieval Without sourceRefs**: All retrievals, whether lexical, somatic, or vector-based, must preserve explicit file and chunk lineages (`sourceRefs`) to the user interface.
4. **Strict Zero-Hidden-Thought Rule**: No raw tensors, CUDA pointers, key-value caches (`kv_cache`), or intermediate model "hidden thoughts" may enter browser-visible outputs or persisted log files.

---

## 2. RTX 3060 Ti 8GB Memory Allocation Budget

To ensure continuous OS responsiveness and prevent device-level Out-Of-Memory (OOM) fatal crashes, VRAM must be strictly partitioned:

| Allocation Category | VRAM Allocated | Purpose / Constraints |
| :--- | :--- | :--- |
| **TurboQuant / `llama-server.exe`** | **4,608 MB** (56.25%) | Primary quantized LLM model storage (Gemma4/TurboQuant). Set `n_gpu_layers` to fix this boundary. |
| **VLM mmproj / Vision Projector** | **1,024 MB** (12.50%) | Compact vision and multimodal projection cache for workstation analysis. |
| **SIMD Addon Scratch Tensors** | **512 MB** (6.25%) | Host for dynamic native operations (SOM BMU calculations, KMeans clustering, LibTorch Graph PageRank). |
| **OS Display / Desktop Composition** | **1,024 MB** (12.50%) | Reserved boundary to prevent Windows/WSL2 desktop UI freezing or stuttering. |
| **Workstation Safety Reserve** | **1,024 MB** (12.50%) | Safety headroom to absorb peak allocation spikes during batch reranking jobs. |
| **Total Available VRAM** | **8,192 MB** (100.0%) | Bounded physical ceiling of the RTX 3060 Ti. |

---

## 3. Concurrency Governance & Thread Locks

> [!CRITICAL]
> **Strict No-Overlap Rule**: Concurrent invocations of high-overhead CUDA kernels or native tensor operations are strictly forbidden.

1. **Javascript Queue Lock**: All native addon entrypoints mapped in [binding.cc](file:///c:/Users/james/Videos/deeds-web-app/simd-bridge/cpp/binding.cc) (specifically PageRank, SOM training, KMeans, and Autoencoders) must be wrapped under an async queue mutex in Node.js.
2. **Serialized Execution**: If a somatic centroid routing calculation is requested while an LLM synthesis generation is active, the somatic job must wait or fall back gracefully to CPU calculations.

---

## 4. In-Situ CPU Fallback Policy

If the workstation detects GPU congestion, VRAM saturation, or lack of CUDA hardware, the system must trigger immediate CPU execution fallbacks:

* **Somatic Centroid Adjacencies**: If `checkCudaAvailable()` returns `0`, centroid cosine similarity calculations must fall back instantly to high-speed single-threaded CPU JS loops.
* **PCA Manifold Projections**: CPU fallbacks must utilize optimized Javascript math vectors to compute principal axes from compressed 64d representations.
* **Graceful Degradation**: In no event may a native VRAM allocation failure crash the SvelteKit Node.js worker process. The system must log a warning and fallback gracefully to CPU execution.

---
*Document approved and locked under Parent Atlas Governance.*
