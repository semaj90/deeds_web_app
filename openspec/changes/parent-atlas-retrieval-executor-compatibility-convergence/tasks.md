## 1. Owner and workboard census

- [x] 1.1 Inventory the owning OpenSpec changes for lineage, code ingestion, retrieval reconciliation, semantic-768, candidate features, GPU ABI, tensor residency, prefill, and llama-server; record each owner and dependency edge. Receipt: `docs/reports/retrieval-executor-compatibility-workboard-v1.json`.
- [x] 1.2 Add a read-only workboard receipt distinguishing `WRITTEN`, `WIRED`, `PROVEN`, and `PROMOTED` for every compatibility gate. The receipt records `canonicalAuthority=false`, `promotionAllowed=false`, and `writesPerformed=false`.
- [x] 1.3 Record the current first failure boundary from workspace/execution/packet lineage and keep downstream promotion gates closed. Current boundary: `EXECUTION_SOURCE_AUTHORITY`; next decision: `EXPLICIT_GRAPHIFY_EXECUTION_OWNER_DECISION`.

## 2. Identity and retrieval contract tests

- [x] 2.1 Add a focused test that verifies source/workspace/packet identity survives Go Retrieval responses without synthetic fallback.
- [ ] 2.2 Add a lexical PostgreSQL read-only replay test covering tsvector/GIN results, source-revision filters, and stable evidence metadata. Read-only proof added at `scripts/atlas/prove-postgres-fts-replay-v1.mjs`; it must remain open until the live replay returns revision-qualified rows rather than only unqualified FTS hits. Receipt: `docs/reports/postgres-fts-replay-v1.json`.
- 2026-09-19 replay evidence: query `Graphify` returned 5,153 unqualified hits and 0 revision-qualified hits. GIN index evidence was unavailable for `codebase_chunk_index`; stable evidence metadata and checksums were produced. Status: `POSTGRES_FTS_BLOCKED_SOURCE_REVISION`; writes performed: false. Keep 2.2 open until canonical source revisions and qualifying index evidence are available.
- [ ] 2.3 Add a semantic pgvector exact-versus-HNSW bounded replay test for `semantic_768`; record recall, filtering behavior, and index settings without creating a live index.
- 2026-09-19 replay evidence: added `scripts/atlas/prove-postgres-pgvector-exact-hnsw-replay-v1.mjs` and `atlas:pgvector:exact-hnsw-replay`. Live schema exposes `content_embedding_768` and `idx_codebase_chunk_content_embedding_768_hnsw`, but the revision-qualified vector cohort is 0. Status: `PGVECTOR_REPLAY_BLOCKED_SOURCE_REVISION`; exact/HNSW recall and filtered parity remain unproven; writes performed: false. Keep 2.3 open.
- [x] 2.4 Add an AST/CST fixture test proving Tree-sitter/ast-grep output includes exact byte spans, parser revisions, source revisions, and evidence checksums.
- [x] 2.5 Add a lane-deduplication test proving Qdrant/cuVS/Go Retrieval executors cannot create multiple semantic RRF votes.

## 3. Classifier and XGBoost readiness

- [x] 3.1 Add a revision-qualified feature/label admission test for PyTorch CPU reference data.
- [x] 3.2 Add an XGBoost train/evaluation receipt test requiring held-out source-revision splits and explicit evaluation metrics.
- [x] 3.3 Keep classifier training and promotion false when packet/source lineage or label coverage is unresolved.

## 4. GPU and residency compatibility

- [x] 4.1 Add a capability receipt schema test for PyTorch CUDA, ONNX, cuGraph, cuTile, TensorRT-RTX, and WebGPU/DirectML challengers.
- [x] 4.2 Add a residency lease test enforcing one GPU budget owner and explicit `GPU_RESIDENCY_BUDGET_EXCEEDED` behavior.
- [x] 4.3 Add a descriptor-only cache-swap test rejecting mismatched model, representation, graph, feature, prompt, GPU, or runtime revisions.
- [x] 4.4 Add a cuTile/SIMT classification receipt proving kernels are benchmarked as challengers and do not become canonical identity or ranking owners.

## 5. TensorRT-RTX CUDA 13.4 isolated proof

- [ ] 5.1 Capture read-only Windows/WSL2 prerequisite evidence: GPU SM86, driver, CUDA toolkit, Python, TensorRT-RTX version, and package checksum. Partial receipt captured; TensorRT-RTX package/version/checksum remain unavailable.
- [x] 5.2 Add a fail-closed CUDA-line compatibility test for TensorRT-RTX; live package/toolkit matching remains blocked until TensorRT-RTX is installed and proven.
- [ ] 5.3 Build a bounded ONNX AOT engine without changing the existing RAPIDS/WSL2 environment.
- [ ] 5.4 Run device JIT and runtime-cache replay; record engine, GPU SKU, driver, runtime, cache, warmup, steady-state latency, and peak VRAM.
- [ ] 5.5 Compare TensorRT-RTX output against PyTorch CPU and ONNX references; keep `canonicalAuthority=false` until parity passes.
- [ ] 5.6 Add rollback evidence showing the TensorRT-RTX lane can be disabled without changing canonical retrieval or llama-server behavior.

## 6. Llama-server `:8090` compatibility

- [x] 6.1 Verify `/health`, `/v1/models`, `/props`, model ID, context length, runtime flags, and model checksum on the existing `:8090` service. The audit now computes a read-only SHA-256 from the exact local model path when the endpoint omits a digest; `ornith-1.5-9b` is bound to `PRESENT_LOCAL_MODEL_HASH`, and `:8080/health` remains non-interchangeable.
- [x] 6.2 Reconcile all `:8080` and `:8090` health/config consumers without changing the live service. Corrected stale TurboQuant fallback defaults from `:8080` to `:8090`; `:8080` remains assigned to API/proxy/SeaweedFS services.
- [x] 6.3 Add a request/replay compatibility test for chat, tool, and bounded synthesis paths.
- [x] 6.4 Define an upgrade receipt and rollback plan; do not upgrade the binary or model in this change.

## 7. Cross-lane OpenSpec integration

- [x] 7.1 Link each gate to its owning OpenSpec change and record whether the dependency is proven, blocked, or downstream. Refreshed `docs/reports/retrieval-executor-compatibility-workboard-v1.json` with 10 owner rows and the current execution/source authority boundary.
- [x] 7.2 Add strict validation and focused test commands to the workboard receipt. The generated receipt now carries the strict OpenSpec command plus the focused Vitest matrix.
- [x] 7.3 Review all generated receipts for `writesPerformed=false`, `canonicalAuthority=false`, and no hidden-state persistence. Receipt: `docs/reports/retrieval-executor-receipts-v1.json`; 72 receipts reviewed with zero violations.
- [x] 7.4 Update the compatibility ledger only with evidence-backed status; downstream/blocked owner ledgers were not auto-closed. Evidence is recorded in `docs/reports/retrieval-executor-compatibility-convergence-v2.json` and the compatibility workboard.

## 8. Promotion review

- [x] 8.1 Produce a final compatibility matrix for PostgreSQL, Go Retrieval, AST/CST, PyTorch, XGBoost, WSL2, cuTile/SIMT, TensorRT-RTX, residency, and llama-server. Refreshed `docs/reports/retrieval-executor-compatibility-workboard-v1.json` with 13 owner rows and the new analyze-this/cache/runtime lanes.
- [x] 8.2 Identify the first remaining authority blocker and its owning change. Current blocker remains `EXECUTION_SOURCE_AUTHORITY`, owned by `parent-atlas-retrieval-lineage-dag-convergence`.
- [ ] 8.3 Obtain explicit operator approval before any later DDL, packet backfill, projection write, cache mutation, model upgrade, or promotion.

## 9. Unified "analyze this" diagnostic coordinator

- [x] 9.1 Add a pure coordinator contract for worktree, AST/CST, PostgreSQL, Go Retrieval, and web evidence with explicit `WORKTREE_DIAGNOSTIC` provenance and `canonicalAuthority=false`. Implemented in `src/lib/server/retrieval/analyze-this-coordinator.ts`.
- [x] 9.2 Add deterministic top-K file selection and same-source deduplication tests; raw search results must not be passed directly to synthesis. Focused Vitest proof passed.
- [x] 9.3 Add bounded `rg --files`/`rg` and AST-grep adapter receipts that preserve source paths, revisions when available, parser revisions, byte spans, and checksums. Receipt: `docs/reports/analyze-this-adapters-v1.json`; unavailable providers remain explicit.
- [x] 9.4 Add a compatibility integration receipt connecting the coordinator to existing ACE ContextManifest/PromptPlan assembly without database, Qdrant, Valkey, Graphify, or source writes. Pure adapter and focused proof: `src/lib/server/retrieval/analyze-this-ace-adapter.ts`.

## 10. ACE/BitFrost cache and provider ownership

- [x] 10.1 Add cache identity tests covering model, adapter, candidate, representation, graph/feature, workspace/source/packet revisions, and checksums. Revision dimensions are included in the cache identity and focused tests passed.
- [x] 10.2 Add a negative persistence test proving hidden reasoning, raw tensors, model KV state, and recurrent state are not serialized into ACE/BitFrost payloads. Recursive sanitizer test passed.
- [x] 10.3 Produce a read-only centroid/cluster warming reconciliation receipt covering `centroid:*`, `ace:cluster:*`, `som:*`, and `gpu:autoencoder:*` key families. Receipt: `docs/reports/centroid-cache-families-v1.json`; no keys were promoted or written.
- [x] 10.4 Reconcile LangGraph synthesis ownership with llama-server `:8090`; Ollama `:11434` remains embedding-only and chat fallback fails closed. LangGraph now uses the OpenAI-compatible llama-server adapter for chat.

## 11. Python/TurboVec runtime alignment

- [x] 11.1 Add a Python runtime receipt for CPython version, free-threaded build/GIL state, worker strategy, concurrency limits, and GPU ownership. Receipt: `docs/reports/python-runtime-capability-v1.json`.
- [x] 11.2 Add a TurboVec installation/importability and endpoint receipt; missing wheel or sidecar remains `NOT_INSTALLED_OR_PROVEN`. Receipt: `docs/reports/turbovec-runtime-v1.json`.
- [x] 11.3 Add a challenger-only receipt proving TurboVec, NetworkX/cuGraph, KMeans, SOM, Hamming, and Hilbert cannot create identity or extra semantic votes. Receipt: `docs/reports/derived-executor-roles-v1.json`.

## 12. Final compatibility review

- [x] 12.1 Extend the compatibility matrix with analyze-this, ACE cache, provider ownership, TurboVec, Python runtime, HyperGraphRAG, and graph projection status. Included in the refreshed workboard receipt.
- [x] 12.2 Re-run strict validation and focused tests; record the first remaining authority blocker and owning OpenSpec. Focused frontend proof passed 4 files/12 tests; strict validation passed; first blocker remains `EXECUTION_SOURCE_AUTHORITY` owned by `parent-atlas-retrieval-lineage-dag-convergence`.
- [x] 12.3 Preserve the no-mutation gate: no DDL, packet backfill, Qdrant/Valkey canonical promotion, Graphify refresh, CUDA upgrade, or model-state persistence. Receipt review found no prohibited writes or hidden-state persistence.
