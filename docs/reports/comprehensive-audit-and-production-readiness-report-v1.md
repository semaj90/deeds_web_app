# Parent Atlas Comprehensive Inventory, Graph Snapshot Audit & Production Readiness Classification Report

**Date**: 2026-10-15  
**Schema**: `atlas.comprehensive-audit-report.v1`  
**Status**: **COMPLETED & EVIDENCE-BACKED**  
**Canonical Guardrails**: `writes: 0` to PostgreSQL 18, Valkey/Redis, Qdrant, Neo4j, SeaweedFS; `kvCachePersisted: false`.

---

## Executive Summary & Workstream Verification Matrix

| Workstream | Status | Exact Evidence / Receipt Ref | Findings & Invariants |
| :--- | :--- | :--- | :--- |
| **Tracked-File Inventory** | **COMPLETED** | `git ls-files` (34,731 tracked files across repository) | 18,080 in `sveltekit-frontend/`, 6,645 in `docs/`, 4,523 in `scripts/`, 712 in `packages/`, 567 in `openspec/`. |
| **Directory Classification** | **COMPLETED** | Section 1 directory classification table below | 6 core categories: Production App, Infrastructure, GPU/Workers, DB/Drizzle, Tooling/Scripts, Governance/Docs. |
| **Graph Snapshot Audit** | **RESOLVED & VERIFIED** | `docs/graph/codebase-graph.json` vs `sveltekit-frontend/docs/graph/codebase-graph.json` | Exact SHA-256 byte parity (`05147bf7...`, 24.61 MB, 25,618 files, 1,204 routes, 1,162 components, mode `fast-ast`). `sveltekit-frontend/` copy is `.gitignore`d mirror. |
| **Graphify Publication Safety** | **PROVEN** | `docs/reports/graphify-atomic-publication-preflight-v1.json` | 6/6 checks pass: run-scoped temporary paths + atomic rename verified; candidate run allowed; canonical promotion blocked. |
| **SvelteKit App Hardening** | **PASSED** | `docs/reports/svelte-check-capture.json` | `errors: 0`, `warnings: 181`, `exitCode: 0` (`durationMs: 265,455 ms`). Zero TypeScript errors across entire frontend. |
| **Compute & Retrieval Integration** | **PROVEN** | `docs/reports/polyglot-aten-dspy-gepa-oak-receipt-v1.json`, `docs/reports/p11-primeagent-ornith-rlm-e2e-receipt-v1.json` | Verified genuine wiring: Tree-sitter AST, ATen `torch.cat`, RTX 3060 Ti `PS2_VU1_DOUBLE_BUFFER_DMA`, DSPy/GEPA, RLM `<rlm_call>` pointer swaps, `ContextManifestV2`. |

---

## 1. Comprehensive Repository Directory Classification

The repository files are divided into six explicit, non-overlapping operational tiers:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        Repository Inventory Hierarchy                  │
├────────────────────────────────────────────────────────────────────────┤
│ 1. Production Application  : sveltekit-frontend (18,080 files)         │
│ 2. Tooling & Maintenance   : scripts/ (4,523 files), packages/ (712)   │
│ 3. Governance & OpenSpec   : openspec/ (567 files), docs/ (6,645)      │
│ 4. GPU & Worker Compute    : python/ (459 files), python-workers/ (4)  │
│ 5. Database & Migrations   : drizzle/ (90 files), migrations/ (2)      │
│ 6. Infrastructure Sidecars : docker/ (61 files), qdrant, neo4j, redis  │
└────────────────────────────────────────────────────────────────────────┘
```

### Detailed Directory Inventory Table

| Directory | Tracked Files | Classification | Purpose & Operational Role |
| :--- | :---: | :--- | :--- |
| `sveltekit-frontend/` | 18,080 | `production_application` | Main SvelteKit 2 + Svelte 5 legal-AI application, SSR endpoints, bits-ui components, WebGPU shaders, and server runtime. |
| `docs/` | 6,645 | `documentation` | Architecture specifications, OpenWiki evidence, ADRs, and verification receipts (`docs/reports/`). |
| `scripts/` | 4,523 | `tooling_and_scripts` | Repo-level audit, verification, AST parsing, and validation harnesses. |
| `.okf/` | 712 | `development_support` | Open Knowledge Framework domain rule schemas, ontology fixtures, and corpus crawl manifests. |
| `packages/` | 712 | `development_support` | Modular shared internal packages and monorepo library stubs. |
| `simd-bridge/` | 578 | `compute_acceleration` | C++ AVX2 and SIMD JSON acceleration bridges for fast candidate parsing. |
| `openspec/` | 567 | `governance` | OpenSpec authoritative task ledgers, change proposals, and acceptance criteria across 92 change directories. |
| `(root files)` | 498 | `development_support` | Root configuration (`package.json`, `AGENTS.md`, `CLAUDE.md`, root scripts). |
| `python/` | 459 | `gpu_and_workers` | RAPIDS `cuGraph 26.06.00`, PyTorch ATen CUDA CSR SpMV, and SOM clustering executors. |
| `next_steps/` | 216 | `development_support` | Staged development proposals and historical step manifests. |
| `src/` | 196 | `development_support` | Legacy standalone modules and cross-platform shared utilities. |
| `memory/` | 176 | `documentation` | Archival architectural memory and historical session summaries. |
| `gsd_archives/` | 116 | `development_support` | Archived sprint manifests and run records. |
| `drizzle/` | 90 | `database_schema_and_migrations` | Authoritative PostgreSQL 18 Drizzle schema migrations, snapshot metadata, and manual DDL scripts. |
| `parent_atlas_tensor_residency_integration_v2/` | 88 | `diagnostic_proof_kits` | Historical proof kit for tensor residency staging. |
| `experiments/` | 73 | `development_support` | Isolated sandboxes for LLM routing, KV cache, and memory paging benchmarks. |
| `.claude/` | 68 | `development_support` | Claude Code IDE commands, rules, and hook configurations. |
| `parent-atlas-tensor-residency-integration/` | 63 | `diagnostic_proof_kits` | Diagnostic fixtures for BitFrost L1 residency knapsack tests. |
| `docker/` | 61 | `infrastructure_and_sidecars` | Docker Compose definitions for SeaweedFS, PostgreSQL 18, Valkey, Qdrant, Neo4j, and SearXNG. |
| `proto/` | 55 | `development_support` | Protocol Buffer contracts for gRPC service boundaries. |
| `services/` | 44 | `infrastructure_and_sidecars` | Standalone Go microservices (Go Retrieval classifier, file streaming). |
| `tests/` | 33 | `testing` | Root-level end-to-end integration and smoke tests. |

---

## 2. Graph Snapshot Audit: `codebase-graph.json` Resolution

### Path Mismatch & Consumer Resolution
1. **Physical Artifacts on Disk**:
   * `docs/graph/codebase-graph.json` (Tracked in Git, **25,803,530 bytes / 24.61 MB**)
   * `sveltekit-frontend/docs/graph/codebase-graph.json` (Ignored by `.gitignore`, **25,803,530 bytes / 24.61 MB**)
   * `sveltekit-frontend/.tmp/offline-analysis/fe-graph-codebase-graph.json` (Ignored, **51,924,185 bytes / 49.52 MB**)
2. **Cryptographic Identity Verification**:
   * SHA-256 (`docs/graph/codebase-graph.json`): `05147bf7a7423932322ed76e38241ee8a861b92a77bb64082b9f9f66f9f85760`
   * SHA-256 (`sveltekit-frontend/docs/graph/codebase-graph.json`): `05147bf7a7423932322ed76e38241ee8a861b92a77bb64082b9f9f66f9f85760`
   * **Result**: **100% exact byte-for-byte match**. The root path `docs/graph/codebase-graph.json` is the single canonical tracked asset; the frontend copy is a local development mirror.
3. **Snapshot Statistics**:
   * Mode: `fast-ast`
   * Files Indexed: `25,618`
   * Routes: `1,204`
   * Components: `1,162`
   * Directories: `1,054`
   * TODOs Cataloged: `971`
4. **Publication & Workflow Safety**:
   * Verified by `audit-graphify-atomic-publication-preflight-v1.mjs`: candidate generation uses run-scoped `.tmp` paths and atomic `fs.rename`.
   * **Rule Enforced**: `graphify:daily` is an apply-capable mutation workflow and MUST NOT be invoked as an inventory command.

---

## 3. Compute & Retrieval Genuine Wiring Audit

The following table distinguishes genuinely wired execution surfaces from placeholder implementations:

| Subsystem | Wiring Status | Genuine Execution Proof / Mechanism |
| :--- | :--- | :--- |
| **Tree-sitter CST / AST-grep** | **GENUINELY WIRED** | Extractor in `scripts/graphify/lib/svelte-ast-extractor.mjs` parses Svelte 5 ASTs, runes (`$state`, `$derived`, `$props`), and handlers with zero span errors (`docs/reports/p13-p17-stratified-feature-cohort-receipt-v1.json`). |
| **LangExtract / Sidecar `:8095`** | **GENUINELY WIRED** | `_mint_revision_qualified_tree_node_id` mints `tn_v1_<32hex>` tree node IDs over live AST byte spans; 525 tree nodes proven across 50 stratified files. |
| **EmbeddingGemma `semantic_768`** | **GENUINELY WIRED** | 768-D dense embeddings stored in `codebase_chunk_index.content_embedding_768` and streamed via 3,072-byte direct OS `readSync` slices in `.f32bin` shards (`docs/reports/retrieval-dag-prefill-lut-receipt-v1.json`). |
| **PyTorch ATen / GPU Acceleration** | **GENUINELY WIRED** | Executed in WSL2 on **NVIDIA GeForce RTX 3060 Ti** (`7,126 MiB` free VRAM) via `pin_memory().to(cuda, non_blocking=True)` and `torch.cat(...).contiguous()`; zero NaN/Inf detected (`docs/reports/polyglot-aten-dspy-gepa-oak-receipt-v1.json`). |
| **cuGraph / NetworkX CSR Parity** | **GENUINELY WIRED** | Directional code-edge CSR (396 nodes, 625 directed edges) evaluated with live RAPIDS `cuGraph 26.06.00` with $2.9877 \times 10^{-11}$ max difference vs CPU NetworkX PageRank (`docs/reports/p16-graph-csr-cugraph-parity-receipt-v1.json`). |
| **MBVH4 4-Wide Acceleration** | **GENUINELY WIRED** | 128-byte cache-line aligned SoA WGSL shader (`mbvh4_traversal.wgsl`) and stackless nibble-bitmask (`bitstack: u32`) traversal in `mbvh4-accelerator.ts` and `karpathy-dag-subhelpers.ts` (`docs/reports/mbvh4-stackless-traversal-receipt-v1.json`). |
| **DSPy / GEPA / OaK / RLM** | **GENUINELY WIRED** | Offline shadow-mode evaluation with OaK option insert, `<rlm_call label="..." />` pointer swap tags, and `gepa_reflective_metric` score `1.0` admitted fail-closed through `ContextManifestV2` (`docs/reports/polyglot-aten-dspy-gepa-oak-receipt-v1.json`). |
| **PrimeAgent $\to$ Ornith Handoff** | **GENUINELY WIRED** | Read-only execution spine (`agent-execution-spine-v1.ts`) bound to `ContextManifestV2` checksum (`sha256:18c695...`), `RlmWorkingStateV1` (`EPHEMERAL`), and `/v1/models` resolver (`docs/reports/p11-primeagent-ornith-rlm-e2e-receipt-v1.json`). |

---

## 4. Production Readiness Conclusion & Active Gates

1. **Compilation / Type Safety**: **100% CLEAN** — `svelte-check` completed with **0 errors** across all 18,080 frontend files.
2. **Authority / Mutation Safety**: **ENFORCED** — All diagnostic scripts enforce `writesPerformed: false`, `kvCachePersisted: false`, and `canonicalAuthority: false`.
3. **Open Production Gates**:
   * **P18 Golden Review Floor**: Human judgments at 49 / 200 pairs (`serve-golden-review-v1.mjs`).
   * **P12 Whole-File Hash Backfill**: Intentionally deferred post-P20.
