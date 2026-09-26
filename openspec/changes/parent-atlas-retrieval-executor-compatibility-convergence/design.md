## Context

Parent Atlas has multiple existing OpenSpec owners rather than one missing search subsystem. The canonical path is source/workspace revision → PostgreSQL identity and evidence → lexical/dense/AST/graph retrieval → bounded candidates → classifiers/rerankers → ACE and model synthesis. Go Retrieval, Qdrant, NetworkX/cuGraph, cuTile, TensorRT-RTX, Valkey/BitFrost, and llama-server are executors or projections and must not create canonical identity.

TensorRT-RTX 1.6 provides separate CUDA 12.9 Update 1 and CUDA 13.4 packages. The target workstation is Ampere SM86, but the existing WSL2/RAPIDS/CUDA installation is independently owned. CUDA 13.4 is therefore a compatibility target for an isolated Windows TensorRT-RTX proof, not an instruction to replace the working stack.

## Goals / Non-Goals

**Goals:**

- Define one cross-lane `ExecutorCompatibilityReceiptV1` with source, packet, representation, model, runtime, device, shape, checksum, parity, residency, and authority fields.
- Prove identity propagation from qualified PostgreSQL rows through Go Retrieval and derived executor receipts.
- Prove lexical, semantic, AST/CST, and graph lanes remain distinct and receive one logical fusion contribution per lane.
- Prove PyTorch CPU reference parity before CUDA, ONNX, TensorRT-RTX, cuTile, or learned-ranker promotion.
- Add a TensorRT-RTX CUDA 13.4 isolated ladder: prerequisites → AOT engine → device JIT → runtime cache → bounded parity benchmark.
- Add a safe llama-server `:8090` compatibility census without changing the binary, model, port, or model state.
- Produce a workboard that links existing OpenSpec changes and identifies the actual first blocking gate.

**Non-Goals:**

- No global OpenSpec task auto-completion or rewriting of other changes.
- No PostgreSQL DDL, packet backfill, Qdrant/Valkey/Neo4j writes, model promotion, or online training.
- No CUDA/RAPIDS/WSL2 upgrade in this change.
- No new AST parser, search index, RRF owner, cache owner, or model-serving owner.

## Decisions

1. **PostgreSQL remains canonical.** Use PostgreSQL 18 for source/revision identity, FTS state, and canonical `semantic_768`; GIN/B-tree/pgvector indexes are query structures, not identity owners.
2. **AST evidence is revision-bound.** Tree-sitter supplies CST/AST structure and ast-grep supplies structural queries; every output must carry source revision, byte span, parser/producer revision, and checksum.
3. **Go Retrieval is read-only.** It may read PostgreSQL, pgvector, Qdrant, and cache projections, but it returns normalized evidence and never owns packet identity or final RRF.
4. **PyTorch CPU is the numerical oracle.** XGBoost is a supervised ranking/classification consumer; it cannot train or promote without revision-qualified labels and held-out receipts.
5. **CUDA 13.4 is isolated.** TensorRT-RTX must use its matching CUDA 13.4 package. CUDA 12.9 and 13.4 artifacts must never be mixed. A failed proof leaves the current WSL2/RAPIDS lane unchanged.
6. **cuTile is a challenger kernel lane.** Use cuTile for bounded tile kernels and CUDA SIMT for kernels needing thread-level control; neither becomes an indexing or identity owner.
7. **One residency budget owner.** GPU jobs, llama-server, PyTorch, cuGraph/cuTile, and TensorRT-RTX must request bounded leases. Cache swaps move descriptors and manifests, never hidden state, tensors, or model KV state.
8. **llama-server remains pinned at `:8090`.** Compatibility is proven by `/health`, `/v1/models`, `/props`, model checksum, context configuration, and a request/replay receipt before any upgrade.

## Risks / Trade-offs

- **[Risk] CUDA 13.4 is incompatible with the current driver or RAPIDS environment.** → Run TensorRT-RTX in an isolated environment and record `nvidia-smi`, `nvcc`, package, driver, and engine checksums before installation.
- **[Risk] Approximate HNSW filtering changes recall.** → Compare exact pgvector results against HNSW on a bounded, revision-qualified cohort before promotion.
- **[Risk] Duplicate executor votes inflate RRF.** → Normalize by logical lane and deduplicate before the single SearchRuntime fusion owner.
- **[Risk] AST output is treated as source authority.** → Reject evidence lacking source revision, exact span, parser revision, or canonical source binding.
- **[Risk] Runtime cache is reused across incompatible GPUs or runtimes.** → Key cache identity by GPU SKU, driver, TensorRT-RTX, CUDA, engine, and model checksums; invalidate on mismatch.
- **[Risk] llama-server upgrade breaks clients despite a healthy port.** → Require endpoint/model/API replay before changing the pinned runtime.

## Migration Plan

1. Run read-only owner and lineage audits.
2. Add focused contract tests and receipts only.
3. Run CPU/reference replay and executor capability probes.
4. Run isolated TensorRT-RTX 13.4 AOT/JIT/cache proof.
5. Review receipts and update owning OpenSpec changes; do not auto-close them.
6. Any later mutation requires the owning change's explicit authorization and independent readback.

Rollback is deletion of unpromoted receipts and disabling challenger routing; canonical PostgreSQL, Qdrant, Valkey, WSL2, and llama-server state is untouched by this change.

## Open Questions

- Which operator decision will admit the current Graphify execution and packet digest producer?
- Which exact driver/toolkit pair is installed on Windows and WSL2 at proof time?
- Is the current llama-server binary compatible with the desired CUDA/runtime upgrade without changing the `:8090` API contract?

## Unified analyze-this boundary

The production coordinator remains SvelteKit plus read-only Go Retrieval. A dirty-worktree analyzer may use `rg --files`, bounded `rg`, Tree-sitter, and AST-grep, but every result is labeled `WORKTREE_DIAGNOSTIC` and `canonicalAuthority=false`. Only revision-qualified PostgreSQL/Go Retrieval evidence may enter an authoritative ACE packet.

The coordinator order is: intent classification, worktree inventory, lexical/structural search, PostgreSQL lexical and semantic candidates, Go identity normalization, same-lane deduplication, deterministic top-K file selection, then ACE ContextManifest/PromptPlan assembly. Raw search results are never injected directly into synthesis.

## Cache and provider boundary

BitFrost/Valkey stores revisioned metadata and replayable context artifacts only. Model KV, recurrent state, hidden reasoning, and raw tensors remain model-owned or ephemeral. Cache keys include model, adapter, candidate, representation, graph/feature, workspace/source/packet revision, and checksums.

SvelteKit and the production synthesis path use llama-server `:8090`. Ollama `:11434` is reserved for EmbeddingGemma. The LangGraph synthesis service must either use the `:8090` OpenAI-compatible endpoint or fail closed; it must not silently create a second Ollama chat owner.

## Runtime evidence

TurboVec installation/importability and Python worker behavior are receipts, not assumptions. The runtime receipt records CPython version, free-threaded build/GIL state, worker strategy, and GPU ownership. TurboVec remains a prefilter/challenger and never canonical identity or an additional semantic vote.
