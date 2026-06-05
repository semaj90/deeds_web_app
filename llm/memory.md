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

## 4. Redis/Valkey Password Configuration Pattern (The "Redis Trick")

- **Constructor Config Over URL Strings:** Standalone scripts (smoke tests, offline indexers) must avoid manually constructing `REDIS_URL` connection strings with password interpolation (which frequently breaks on special characters like `:` or `@`). Instead, read variables from `.env` and pass them as a configuration object to the `ioredis` constructor:
  ```javascript
  const redis = new Redis({
    host: env.REDIS_HOST || '127.0.0.1',
    port: parseInt(env.REDIS_PORT || '6379', 10),
    password: env.REDIS_PASSWORD || undefined,
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    retryStrategy: () => null,
  });
  ```

---

## 5. Parent Atlas Lineage & Synthesis Rules

- **Task Joining Mechanics:** `task_semantic_packets` currently joins safely by `feature_id`.
- **Mixed Source References:** `source_ref` values are mixed and can represent actual file references (e.g. `src/lib/...`), task references (e.g. `task:123`), and feature aggregation references (e.g. `feature:auth`, `feature:ui`).
- **Feature Aggregation:** `atlas_feature_synthesis` is a feature-level aggregation table.
- **Lineage Boundaries:** `atlas_source_ref_synthesis` must not trust `feature:*` source references as physical file system paths.

---
*Verified under Deeds Legal-AI Platform Guidelines.*
