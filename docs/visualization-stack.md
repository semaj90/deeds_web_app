# Visualization Stack — Deeds Legal AI

**Last Updated:** April 15, 2026  
**Status:** Production  

---

## Library Summary

| Library | Version | Role | Where Used |
|---------|---------|------|-----------|
| **D3.js** | 7.9.0 | Force-directed graphs, layouts | RouteGraph, EvidenceGraphPane, ProvenanceGraph |
| **Babylon.js** | 9.0.0 | 3D scene rendering | Memory Palace (WebGPU palace core) |
| **WebGPU (native)** | browser API | GPU compute + shaders | similarity, RAG, particles, SOM cache |
| **Canvas 2D (native)** | browser API | Drawing, annotation, retro | EvidenceCanvas, CollaborativeCanvas, N64Canvas |
| **Fabric.js** | types only | Canvas editor API | FabricCanvas.svelte (stub — types installed, lib not bundled) |
| **ONNX Runtime Web** | 1.23.2 | ML inference in browser | gemma270m WebGPU→WASM→CPU fallback chain |

---

## Component Map

### Charts & Pipelines (SVG/CSS, no external lib)

| Component | Route | Description |
|-----------|-------|-------------|
| [RAGPipelineChart.svelte](../sveltekit-frontend/src/lib/components/ai/RAGPipelineChart.svelte) | Used in admin/error-brain | Flow diagram: User Query → Router → Embed → Qdrant ANN → pgvector → KAG → Rerank → DAG → LLM → SSE Stream. Compact prop for sidebar use. |
| [ClusterVisualization.svelte](../sveltekit-frontend/src/lib/components/codebase/ClusterVisualization.svelte) | admin/kag-notebook | GPU k-means cluster membership display |
| [DependencyChart.svelte](../sveltekit-frontend/src/routes/(app)/couchdb-analytics/DependencyChart.svelte) | /couchdb-analytics | CouchDB MapReduce dependency chart |
| [ErrorPropagationGraph.svelte](../sveltekit-frontend/src/routes/(app)/couchdb-analytics/ErrorPropagationGraph.svelte) | /couchdb-analytics | Error propagation relationship graph |

### D3.js Graphs

| Component | Route | Description |
|-----------|-------|-------------|
| [RouteGraph.svelte](../sveltekit-frontend/src/lib/components/codebase/RouteGraph.svelte) | /demos/codebase-graph, /admin/codebase-graph | Force-directed graph: route + component + service + API nodes. Zoom/pan/filter. Node types: route, component, store, service, api, util. |
| [EvidenceGraphPane.svelte](../sveltekit-frontend/src/lib/features/evidence-command-center/EvidenceGraphPane.svelte) | /command-center | Evidence relationship network |
| [ProvenanceGraph.svelte](../sveltekit-frontend/src/lib/components/source-validation/ProvenanceGraph.svelte) | source-validation flows | Chain-of-custody provenance graph |
| [GraphVisualizationGallery.svelte](../sveltekit-frontend/src/lib/components/visualization/GraphVisualizationGallery.svelte) | /demos/knowledge-graph | Showcase of all graph types |

### WebGPU Compute + Rendering

| Module | Purpose | Shaders |
|--------|---------|---------|
| [webgpu-similarity-engine.ts](../sveltekit-frontend/src/lib/webgpu/webgpu-similarity-engine.ts) | GPU cosine similarity for embedding reranking | Custom WGSL compute |
| [webgpu-rag-service.ts](../sveltekit-frontend/src/lib/webgpu/webgpu-rag-service.ts) | GPU-accelerated RAG pipeline | Custom WGSL compute |
| [som-webgpu-cache.ts](../sveltekit-frontend/src/lib/webgpu/som-webgpu-cache.ts) | Self-organizing map (SOM) error prioritization | Compute shaders |
| [gpu-compute-pipeline.ts](../sveltekit-frontend/src/lib/gpu/gpu-compute-pipeline.ts) | General GPU compute orchestrator | — |
| [shaders/particle-system.wgsl](../sveltekit-frontend/src/lib/gpu/shaders/particle-system.wgsl) | Particle effects (evidence canvas overlay) | WGSL |
| [shaders/crt-postprocess.wgsl](../sveltekit-frontend/src/lib/gpu/shaders/crt-postprocess.wgsl) | CRT scanline postprocessing (retro themes) | WGSL |
| [gpu-search-reranker.ts](../sveltekit-frontend/src/lib/gpu/gpu-search-reranker.ts) | GPU-accelerated search result reranking | WGSL compute |

#### Memory Palace (Babylon.js + WebGPU)

| Module | Description |
|--------|-------------|
| [webgpu-palace-core.ts](../sveltekit-frontend/src/lib/gpu/webgpu-palace-core.ts) | Spatial knowledge indexing — nodes placed in 3D by embedding similarity |
| [webgpu-palace-shaders.ts](../sveltekit-frontend/src/lib/gpu/webgpu-palace-shaders.ts) | WGSL shaders for palace rendering |
| [webgpu-palace-compression.ts](../sveltekit-frontend/src/lib/gpu/webgpu-palace-compression.ts) | LOD compression for large knowledge graphs |

Route: `/demos/webgpu-memory-palace` — Babylon.js scene + WebGPU compute, N64 LOD levels (1024→512→256→128px) by distance.

### Canvas 2D

| Component | Route | Description |
|-----------|-------|-------------|
| [EvidenceCanvas.svelte](../sveltekit-frontend/src/lib/components/evidence/EvidenceCanvas.svelte) | /cases/[id]/canvas | Evidence annotation — draw, tag, overlay forensic markers |
| [CollaborativeEvidenceCanvas.svelte](../sveltekit-frontend/src/lib/components/canvas/CollaborativeEvidenceCanvas.svelte) | /demos/collab-canvas | Real-time multi-user annotation via SSE |
| [EvidenceCanvasEditor.svelte](../sveltekit-frontend/src/lib/components/canvas/EvidenceCanvasEditor.svelte) | /demos/evidence-canvas | Full annotation editor (12th visualization engine) |
| [WebGPUTextureStreamingDemo.svelte](../sveltekit-frontend/src/lib/components/evidence/WebGPUTextureStreamingDemo.svelte) | /demos/evidence-canvas | NES-inspired texture atlas: 2KB RAM / 40KB total, priority-based loading |
| [N64Canvas.svelte](../sveltekit-frontend/src/lib/components/ui/gaming/n64/N64Canvas.svelte) | /demos/nier-showcase | N64-era canvas renderer (retro UI theme) |
| [NESGraphRenderer.svelte](../sveltekit-frontend/src/lib/components/NESGraphRenderer.svelte) | /demos/nes-graph | NES PPU-style graph with tile-based rendering |

### WebGPU Similarity Demo

| Component | Route |
|-----------|-------|
| [WebGPUSimilarityDemo.svelte](../sveltekit-frontend/src/lib/components/WebGPUSimilarityDemo.svelte) | /webgpu-similarity |

---

## Demo Routes

| Route | Tech | Purpose |
|-------|------|---------|
| `/demos/codebase-graph` | D3.js | Route dependency force graph |
| `/demos/knowledge-graph` | D3.js | Knowledge base graph gallery |
| `/demos/nes-graph` | Canvas 2D | NES PPU-style renderer |
| `/demos/evidence-canvas` | Canvas 2D + WebGPU | Evidence annotation + texture streaming |
| `/demos/collab-canvas` | Canvas 2D + SSE | Collaborative multi-user canvas |
| `/demos/memory-palace` | Babylon.js | 3D spatial knowledge index |
| `/demos/webgpu-memory-palace` | Babylon.js + WebGPU | GPU-accelerated 3D palace + N64 LOD |
| `/demos/webgpu-showcase` | WebGPU | SOM + texture + LOD tabbed showcase |
| `/demos/particles` | WebGPU WGSL | Particle system shader demo |
| `/demos/courtroom-sim` | Canvas/SVG | Interactive courtroom simulation |
| `/demos/embedding-stream` | D3/SVG | Live embedding stream visualization |
| `/demos/vector-search` | D3/SVG | Vector search results layout |

---

## GPU Compute Pipeline (Server-Side)

The server-side GPU acceleration runs through the **LibTorch CUDA N-API bridge**:

```
TypeScript call
  → libtorch-bridge.ts (computeGpuSimilarity)
  → tensorrt_bridge.node (N-API, C++)
  → LibTorch CUDA 12.1 on RTX 3060 Ti
```

**Performance vs client WebGPU:**

| Operation | Client WebGPU | Server LibTorch | Use Case |
|-----------|--------------|-----------------|---------|
| Cosine sim (1000 vecs) | ~50ms | ~25ms | Search reranking |
| Batch embed 500 files | N/A | ~500ms | Codebase indexing |
| SOM clustering (k=20) | ~200ms | ~3.5s (full k-means) | Error cluster detection |

---

## Admin Visualization Pages

| Route | Visualization | Data Source |
|-------|-------------|-------------|
| `/admin/gpu-evidence-graph` | D3.js force graph | Neo4j + PostgreSQL evidence relationships |
| `/admin/codebase-graph` | D3.js force graph | Qdrant `codebase_chunks_768`, Neo4j edges |
| `/admin/kag-notebook` | CSS grid cards | Qdrant `phase90_error_clusters` + CouchDB `graph_clusters` |
| `/couchdb-analytics` | D3 bar/line + SVG | CouchDB MapReduce views |

---

## Adding a New Visualization

1. **Simple chart (no external lib):** Use SVG + UnoCSS utilities directly in `.svelte`. See `RAGPipelineChart.svelte` as reference.
2. **Force graph (D3):** Copy `RouteGraph.svelte` pattern — import D3 in `onMount`, destroy on `$effect` cleanup.
3. **GPU compute:** Add a WGSL shader to `src/lib/gpu/shaders/`, register in `shader-registry.ts`, consume via `gpu-compute-pipeline.ts`.
4. **3D scene:** Import `@babylonjs/core` in a `ssr = false` route under `/demos/`.
5. **Canvas annotation:** Extend `EvidenceCanvas.svelte` — uses Canvas 2D API, guarded by `onMount`.

**SSR rule:** All canvas/WebGL/WebGPU must be behind `onMount()` or on a route with `export const ssr = false`.
