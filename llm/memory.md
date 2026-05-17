# Memory.md — Workspace Telemetry & Retrieval State

This document catalogs vector dimensions, dimensional autoencoding models, active workstation benchmarks, and semantic index maps.

---

## 1. Vector Dimension Policy & Projections

- **768 Dimensions (Canonical):** Mapped for high-fidelity codebases, programming documents, and codebase similarity lookups. Embeddings generated via local Ollama `embeddinggemma:latest` endpoint.
- **64 Dimensions (Routing Bottleneck):** Used by our **Layer 2 (Routing)** pre-filtering lane to compress `768d` inputs down to `64d`, driving sub-millisecond Qdrant routing searches.
- **4 Dimensions (Manifold Coordinates):** Utilized for 4D topology mappings and Neo4j visual coordinate layouts.

---

## 2. Telemetry & Benchmark Baselines (RTX 3060 Ti)

Active query benchmark profiles comparing canonical `768d` against compressed `64d` routing lanes:

| Telemetry Metric | Raw 768d Lane | Compressed 64d Lane | Performance Optimization |
| :--- | :---: | :---: | :---: |
| **Vector Size** | `3072 Bytes` | `256 Bytes` | **91.7% VRAM space savings** |
| **P50 Query Latency** | `2.70ms` | `1.47ms` | **45.6% retrieval speedup** |
| **P99 Tail Latency** | `144.35ms` | `7.01ms` | **95.1% tail stable reduction** |
| **Indexing Model** | Cosine / pg17 | Cosine / pg17 | `on_disk: true` SSD paging active |

- **Autoencoder Bottleneck Projection Overhead:** `0.0054ms`
- **Reconstruction Error Gate:** Evaluated at query time to auto-fallback on raw 768d search if projection exceeds structural limits.

---

## 3. Active State Milestones & Checkpoints

- **0 High-Severity Gaps Remaining:** Successfully authored, seeded, and normalized high-fidelity reference guides for Svelte 5, WebGPU/WGSL, CUDA C++, TypeScript 5.4, Node.js 22, and PostgreSQL 17.
- **Unified Pipeline Built:** Consolidates all document processes, semantic chunking, master index rebuilding, and benchmarking under a single command `node scripts/docs-atlas/run-all-docs-pipeline.mjs`.

---
*Verified under Deeds Legal-AI Platform Guidelines.*
