# Parent Atlas End-to-End Missing Gaps & Architecture Report (v1)

**Generated:** 2026-11-22  
**Authority:** `canonicalAuthority: false` (read-only engineering audit; no DB or Graphify mutations).

---

## 1. Batch `openspec/*/tasks.md` & Batch JSON File Editing (Scaffolded v2)
- **What exists:**
  - `docs/reports/openspec-workboard-v1.json` (`13,974` `taskInventory` rows), `openspec_task_source_index_v1` (`241,036` rows in Postgres 18), `run-agentic-error-fixing-v1.mjs` + `error-fix-task-receipt-v1.ts` (5 ACP/A2A lane phases), `task-to-ace-vertical-slice-v1.ts`, and `a2aConflictFreeBatchProposalRequestV1Schema` (`kanban-acp-dag-contracts.ts`).
- **What is missing:**
  1. **Conflict-Free Batch Patch & Checksum Commit Gate:** `a2aConflictFreeBatchProposalRequestV1Schema` and `build-error-fixing-kanban-tasks-v1.mjs` produce `PROPOSED` tasks, but there is no single **batch `tasks.md` / JSON patch applier** that locks by `(sourceRef, sourceFileSha256, taskRevision)`, validates `openspec validate --strict` + `git diff --check` after each batch, and rolls back atomically on any conflict.
  2. **Batch `title_id` / Metadata Repair:** `atlas:summary:envelopes:build:dry` still quarantines `58 / 61,718` tuples missing `title_id`.

---

## 2. Tournament-Style CPU-vs-CPU Testing (Parity & Challenger Evaluation)
- **What exists:**
  - CPU-vs-CPU / challenger tournament harnesses already exist in `python/atlas_compute/gpu_mini_fabric/som_cache_tournament_01.py` (`SOM-BMU-neighbor` vs `graph-neighbor` vs `plain-LRU`), `scripts/atlas/admit-workspace-revision-tournament-v1.mts`, and `python/atlas_compute/aligned_snapshot_experiment_v2.py`.
- **What is missing:**
  1. **Unified Tournament Harness Across Retrieval & Reranking Challengers:** A single deterministic CPU-vs-CPU tournament runner comparing `lexical` vs `hybrid_rrf` vs `graphrag_oak_matrix_compiler_v1` (XGBoost / GRPO) vs `train-policy-reranker.py` (MLP) vs `ewin_tang_low_rank` on a **30–50 human-reviewed query suite** (currently `eval-doc14-topk-lanes-v1.py` uses `30` auto-generated cross-file queries).
  2. **TensorRT-RTX 1.7 vs CPU `onnxruntime-node` Challenger Match:** Needs a `batch=32` parity + warm-latency tournament after freeing `:8090` VRAM.

---

## 3. Finite State Machines (NES `$01–$20` Registers & `SafeTileResidencyStateV1`)
- **What exists:**
  - `sveltekit-frontend/src/lib/server/atlas/fsm/nes-fsm-native-runtime-v1.ts` (enforces `BINARY_DESCRIPTOR_STALE_SOURCE_REVISION`).
  - `sveltekit-frontend/src/lib/server/atlas/tensors/tensor-handle-4x4x6-v1.ts` (`SafeTileResidencyStateV1` 7-state FSM + `assertGpuTileReadableV1` lease TTL / `evictedAtMs` check + 160-byte `THV1` codec parity across TS / C++ N-API / Python pybind11).
- **What is missing:**
  1. **Live VRAM-Pressure Callback Wiring:** `assertGpuTileReadableV1` is unit-tested (`10/10` Vitest), but live GPU memory-pressure callbacks are not yet wired to evict `EVICTABLE` tiles and stamp `evictedAtMs` before `IN_USE` reads.
  2. **C++ / Python Native Buffer Finalizer & Lifetime Stress Tests:** Per `AGENTS.md` § 6, add explicit native external-buffer lifetime/finalizer tests alongside the 160-byte codec parity tests.

---

## 4. Tiered Data Stores & Caching (`L2–L3 CPU → RAM → SSD/NVMe → GPU → Postgres/Qdrant/Valkey`)
- **What exists:**
  - **Truth / Canonical Store:** PostgreSQL 18 (`:5434`, `codebase_chunk_index`, `atlas_external_doc_chunks`, `atlas_packet_chunk_lineage`, `openspec_task_source_index_v1`).
  - **Rebuildable Projections & Caches:** Qdrant (`:6333`, `50` collections including `codebase_chunks_eg2_768_q8`), Valkey RediSearch (`:6379`, `atlas_hot_vectors_v1`, `AcePacketWriter` / `AcePacketReader` TTL+readback proven), TurboVec (`:8791`).
- **What is missing:**
  1. **Qdrant `--commit` & Tooling Docs `--apply`:** `codebase_chunks_eg2_768_q8` has `0` points (ready for the `200` `PROVEN` chunks in `docs/reports/doc14-admitted-chunks.jsonl`); `57` tooling-docs pages await `ATLAS_DOC_VERSIONED_RECRAWL_AUTHORIZED`.
  2. **Reviewed Ontology & `IMPORTS`/`CALLS` Admission:** `atlas_ontology_concepts` and `atlas_ontology_relations` have `0` rows; `graphify_files` is stale (`39,825` min) and `audit-current-structural-edge-contract-v1.mjs` reports `0` admitted edges (`CONTRACT_INCOMPLETE`).
  3. **NVMe `mmap` / Centroid Durable Artifacts:** `buildCentroidManifestV1` passes `12/12` unit tests, but still needs a live model-versioned vector membership manifest before persisting centroids.

---

## 5. CSR / SSR / `ServiceWorker` / `WebWorker` Boundaries (`AGENTS.md` § SSR/CSR Residency)
- **What exists:**
  - `sveltekit-frontend/src/lib/workers/browser-context-embed.worker.ts` + `static/embeddinggemma_300m_onnx/model.onnx` (`290.7 MB`, text-only client WebWorker).
  - `sveltekit-frontend/src/lib/server/evidence/eg2-onnx-worker-client.ts` (server Node worker thread for multimodal ONNX).
- **What is missing:**
  1. **SSR-to-CSR `expandLOD()` Route & Abort/Byte-Budget Gate:** Wire `expandLOD()` so SSR returns only compact manifests/cards while CSR fetches L2/L3 representations on demand with abort/cancellation, byte limits, checksum checks, and resource release when the last consumer finishes.
  2. **ServiceWorker Offline Revision-Keyed Cache Policy:** Enforce that any `ServiceWorker` caches only revision-keyed authorized bytes for offline use (never acting as a compute worker or authorization authority).
  3. **Full-Repo `npm run check` (`svelte-check`) + IDE `atlas-tools` MCP Reload:** Separate verification/host gates.

---

## 6. Session-Built Artifacts & Exact `source_ref` Index (Parent Atlas Workstation)

| `source_ref` | Role / Owner | OpenSpec Change | Verified Status |
| :--- | :--- | :--- | :--- |
| `AGENTS.md` | `MLP, DSPy RLM, ACE, and Residency v2` + § 8 ML Matrix Building | `parent-atlas-openspec-workstation-synthesis` | `git diff --check` passed |
| `sveltekit-frontend/src/lib/server/atlas/openspec-board/error-fix-task-receipt-v1.ts` | ACP/A2A 5-phase recommendation lane router (`classifyAcpA2aRecommendationLanePhaseV1`) | `parent-atlas-openspec-workstation-synthesis` | Filtered `tsc --noEmit` (0 errors) |
| `scripts/atlas/run-agentic-error-fixing-v1.mjs` | Emits `lanePhase`, `blockedByStaleness`, `acpTarget`, `a2aTarget` | `parent-atlas-openspec-workstation-synthesis` | `run-agentic-error-fixing-kanban-v1.test.mjs` (`9/9`) |
| `sveltekit-frontend/src/lib/server/atlas/tensors/tensor-handle-4x4x6-v1.ts` | `assertGpuTileReadableV1` + lease TTL / `evictedAtMs` FSM checks | `parent-atlas-tensor-residency-integration` | `tensor-handle-4x4x6-v1.spec.ts` (`5/5`, 10/10 suite) |
| `python/atlas_graph_runtime/dependency_lookup_v1.py` | `CALL_TARGET_SYMBOL_REVISION_MISMATCH` & `CALL_TARGET_SPAN_HASH_MISMATCH` | `parent-atlas-openspec-workstation-synthesis` | `test_dependency_lookup_v1.py` (`4/4`) |
| `python/atlas_graph_runtime/document_relation_rrf_v1.py` | `SUPERSEDED_DOC_CHUNK`, `STALE_CRAWL_REVISION`, `DOMAIN_TAGS_UNPOPULATED` gates | `parent-atlas-versioned-doc-intelligence` | `test_document_relation_rrf_v1.py` (`3/3`) |
| `python/atlas_graph_runtime/firecrawl_lexical_api_recommender_v1.py` | Firecrawl API/module/import extractor + concurrent `rg` + SIMD cosine | `parent-atlas-versioned-doc-intelligence` | `test_firecrawl_lexical_api_recommender_v1.py` (`3/3`) |
| `scripts/atlas/compile-okf-docs-openspec-relations-v1.py` | `--review-top-k 50` + `repairPriorityScore` + `atlas.lexical-source-analysis.v1` | `parent-atlas-versioned-doc-intelligence` | `test_compile_okf_docs_openspec_relations_v1.py` (`6/6`) |
| `scripts/atlas/prove-doc14-outside-scan-cohort-ace-v1.py` | PG18 `atlas_packet_chunk_lineage` join + `200` `PROVEN` JSONL export | `parent-atlas-versioned-doc-intelligence` | `test_prove_doc14_outside_scan_cohort_ace_v1.py` (`1/1`) |
| `scripts/atlas/run-tooling-docs-automation-dryrun-v1.mjs` | Read-only E2E tooling-docs + DOC-26 + `SEMANTIC-DOC-01` dry-run | `parent-atlas-versioned-doc-intelligence` | `tooling-docs-e2e-automation-dryrun-v1.json` |
| `scripts/atlas/prove-ollama-embeddinggemma-parity-v1.py` | Ollama `:11434` vs `:8081` parity (`0.999656` mean cosine, `24` chunks) | `parent-atlas-versioned-doc-intelligence` | `EMBEDDING_PARITY_PROVEN` |
| `python/atlas_graph_runtime/api_document_fact_v1.py` | `atlas.api-document-fact.v1` + 6-case fail-closed citation verifier | `parent-atlas-versioned-doc-intelligence` | `test_api_document_fact_v1.py` (`2/2`) |
| `scripts/atlas/doc14-embedding-upsert-v1.py` | `embeddinggemma2:q8_0` `[10, 768]` matrix dry-run + Qdrant `:6333` preflight | `parent-atlas-versioned-doc-intelligence` | `test_doc14_embedding_upsert_v1.py` (`2/2`) |
| `sveltekit-frontend/scripts/atlas/prove-doc14-valkey-ace-roundtrip-v1.mts` | Live `:6379` Valkey `AcePacketWriter` / `AcePacketReader` TTL + stale rejection | `parent-atlas-prefill-routing-residency-convergence` | `doc14-valkey-ace-readback-v1.json` (`HIT`, `staleRejected: true`) |
| `scripts/atlas/eval-doc14-topk-lanes-v1.py` | Cross-file `30`-query Exact/Lexical/Graph/Hybrid RRF eval | `parent-atlas-versioned-doc-intelligence` | `doc14-topk-lane-eval-v1.json` (`lexical 1.0`, `hybrid 0.8667`) |
| `python/atlas_graph_runtime/doc14_bounded_rlm_recommender_v1.py` | Bounded RLM recommender (`max_iters=6`, `:8090` `--live-llm` + UTF-8 spans) | `parent-atlas-openspec-workstation-synthesis` | `test_doc14_bounded_rlm_recommender_v1.py` (`3/3`) |
| `python/atlas_graph_runtime/graphrag_oak_matrix_compiler_v1.py` | Live `embeddinggemma2:q8_0` + NetworkX PageRank + OAKLib -> XGBoost CSV & GRPO JSONL | `parent-atlas-workstation-domain-classifier` | `test_graphrag_oak_matrix_compiler_v1.py` (`1/1`) |
