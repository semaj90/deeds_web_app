# Parent Atlas — Code Ingestion Pipeline (Chunking → Embedding → Rerank → Synthesis)

**Status**: Architecture frozen 2026-08-12, not yet implemented/audited. No code written for this change.

## Frozen architecture

```
SOURCE CODE
  → Tree-sitter (parser, structural truth) + chunker (chunk boundaries)
  → StructuralChunkV1 (chunk boundary, NOT identity)
  → GIS enrichment: parse_node_id, symbol_id, symbol_version_id, chunk_id, packet_key
  → semantic card compiler
      → EmbeddingGemma → semantic_768 (CANONICAL dense representation)
      → Jina embeddings-v2-base-code → jina_code_768 (EXPERIMENTAL second dense lane)
      → BM25 → lexical_bm25 (sparse)
  → AST graph facts
  → Qdrant (dense + sparse projection, same canonical chunk_id across all vector spaces)
  → canonical fusion (Parent Atlas RRF owner — NOT Qdrant's internal RRF, NOT a second fusion owner)
  → Mixedbread reranker (top-50 → top-10, fail-open: never turn nonempty input into empty output silently)
  → FeatureRow → ACE bounded packet
  → Ornith 9B (synthesis/enrichment ONLY — summarize, pattern-extract, explain, hypothesize; never scan the corpus directly)

DOCS / LOGS / RESEARCH (separate lane, same downstream machinery)
  → LangExtract (schema-grounded entity/relation extraction, rejects ungrounded char_interval-less extractions)
  → semantic card → EmbeddingGemma semantic_768 → sparse+dense retrieval → Mixedbread → Ornith
```

## Hard rules (do not violate)

- **EmbeddingGemma is the canonical `semantic_768` owner.** 768-dim native, Matryoshka-truncatable to 512/256/128, 2048-token input. Do not replace it; do not make MiniLM-384 or Jina a second canonical dense owner.
- **Jina (`jina_code_768`) is an experimental, separate representation space** — never cosine-compare against EmbeddingGemma vectors directly (`cosine(embeddinggemma_vector, jina_code_vector)` is invalid — unrelated learned spaces). Fuse ranked candidate lists, not raw vectors.
- **MiniLM-L6-v2 (384d) is demoted**: legacy throughput baseline / optional `cheap_candidate_prefilter_384` only. Never pad or reinterpret as `semantic_768`.
- **Tree-sitter is the structural-truth parser backend.** ast-grep is a structural query/rewrite tool, not an identity owner — it must not mint `symbol_id`/`parse_node_id`.
- **The chunker chooses spans; GIS chooses identity.** `StructuralChunkV1` is a chunk-boundary contract, not an identity contract — `parse_node_id`/`symbol_id`/`symbol_version_id`/`chunk_id`/`packet_key` are assigned downstream by GIS, never by the chunker itself.
- **LangExtract owns prose/log/research entity extraction, never code identity.** Ungrounded extractions (no `char_interval`) must not be promoted to canonical evidence.
- **Every representation gets its own index + its own exact oracle** — `turbovec_semantic_768_v1` (EmbeddingGemma) and `turbovec_jina_code_v1` (Jina, if promoted) are separate TurboVec indexes, each compared only against its own cuVS brute-force oracle. Never mix representations in one index.
- **Existing evidence pipeline is reused, not replaced.** `SourcePosConceptPacket` → `CodeEvidenceSynthesizer` → `analysis_pass_results` → outbox → board already exists and is live (per Session 199-200 memory + this session's readback/outbox work) — extend it with provenance/identity fields, don't build a parallel `CodeSemanticUnitV1` subsystem.

## Audit tasks (do first — do not add a new chunker/encoder/transport before these run)

| Task | State | What it answers |
|---|---|---|
| **CHUNK0** `/audit-duplication chunking` | PARTIAL_PROVEN | Which structural extraction path is `CANONICAL_OWNER`: in-process TS bridge (`ast-langextract-bridge.ts`, confirmed live — `code_feature_registry` worker routes through it), Python `treesitter-chunker` sidecar (:8095, also real — installs `tree-sitter`, `tree-sitter-language-pack`, `ast-grep-py`, `langextract`), or legacy `ast-chunker.ts` (ts-morph-based)? Live worker wiring now uses the bridge; the Python NLP sidecar now prefers `treesitter-chunker` for structural spans when installed and keeps local tree-sitter only as compatibility fallback. Canonical ownership still needs the duplication audit. |
| **CHUNK1** compare output contracts | NOT STARTED | Do the TS bridge and Python sidecar emit compatible chunk shapes, or does switching ownership change packet identity? |
| **CHUNK2** demote redundant path | NOT STARTED | Classify the loser `COMPATIBILITY`/`LEGACY`, not delete (Archival Rules) |
| **TURBOVEC** `/audit-duplication turbovec` | **DONE 2026-08-12** | See `openspec/changes/parent-atlas-error-research-lane/tasks.md` — 4 live uncoordinated transports found (HTTP :8791, gRPC, Rust N-API, `child_process.spawn` CLI), NEW_CONFLICT, not yet resolved |
| **LX0** LangExtract runtime grounding proof | PARTIAL_PROVEN | import is real `langextract` (not a stub), call reaches the 8095 sidecar, model provider explicit, extraction schema/examples explicit, grounded source spans returned, ungrounded extractions rejected/marked (not silently promoted), extraction provider revision persisted, failures explicit (not silently empty-success), `SourcePosConceptPacket` actually receives LangExtract-derived fields, live `code_feature_registry` worker exercises this path end-to-end |

Live implementation note (2026-08-12): `sveltekit-frontend/src/lib/server/analysis/worker.ts` now routes `code_feature_registry` through `ast-langextract-bridge.ts` before packet synthesis. That means the live worker path is no longer AST-grep-only; it merges AST-grep, LangExtract, and tree-sitter fallback evidence before `SourcePosConceptPacket` / `CodeEvidenceSynthesizer` / `analysis_pass_results`. `ast-chunker.ts` remains the legacy compatibility path until CHUNK1/CHUNK2 close.

### Priority update from the latest review

The next single-action order is now:

1. **CHUNK0** — prove the Python sidecar is the canonical `treesitter-chunker` span producer, with local tree-sitter only as fallback.
2. **LX0** — prove LangExtract grounding and `char_interval`-required promotion.
3. **CTX0** — wire the existing `ContextManifest` contract into the live `context-assembler.ts` path.
4. Then continue with **FE5/FE6** query-time `FeatureRow`, followed by the hypergraph owner audit and the reranker/RRF audit as separate bounded slices.

Do not start ContextManifest wiring before CHUNK0 and LX0 are settled; the manifest is downstream of validated chunking and grounded extraction.

## Embedding/retrieval sequence (after CHUNK0/LX0 close)

| Task | State |
|---|---|
| EMB0 prove current EmbeddingGemma writer emits real 768-dim normalized `semantic_768` with correct query/document prompting + representation_revision | NOT STARTED |
| EMB1 build Tree-sitter semantic-card corpus (FILE/MODULE/CLASS/INTERFACE/FUNCTION/METHOD/TYPE units, not arbitrary token windows) | NOT STARTED |
| EMB2 re-embed semantic cards with canonical EmbeddingGemma | NOT STARTED |
| EMB3 verify Qdrant semantic_768 + lexical_bm25 | NOT STARTED |
| EMB4 exact cuVS brute-force oracle on EmbeddingGemma 768d | NOT STARTED |
| EMB5 TurboVec index from the same semantic_768 vectors (once TURBOVEC conflict above is resolved) | NOT STARTED |
| EMB6 measure TurboVec vs exact oracle (Recall@K, NDCG, latency) | NOT STARTED |
| CODE0 add Jina `jina_code_768` as EXPERIMENTAL second dense lane | NOT STARTED |
| CODE1 evaluate EmbeddingGemma-only vs Jina-only vs fused (Recall@5/10/50, MRR, nDCG@10, symbol/repair localization, latency, RAM/VRAM, index size) | NOT STARTED |
| RERANK0 Mixedbread reranker after canonical fusion (top-50 → top-10, fail-open) | NOT STARTED |
| ENRICH0 Ornith 9B semantic-card synthesis path, schema-bound output (`CodePatternObservationV1`, not free-form prose) | NOT STARTED |
| EXTRACT0 LangExtract for docs/logs/research (separate lane, same downstream machinery) | NOT STARTED |

## P3 correction

P3's canonical path should start with **Tree-sitter chunk → GIS identity → semantic card → EmbeddingGemma `semantic_768`**, not `768d → latent_64 → cluster`. The existing KMeans/latent_64 work is not discarded — it's reclassified as `LEGACY_COMPATIBILITY` / `CACHE_HINT_ONLY`, derived *from* semantic_768, never the retrieval-truth path itself. Matches the already-frozen T6c stop state (KMeans K=64/128/256 = `KMEANS_ROUTING_EXPERIMENT_PROVEN`, `CACHE_HINT_ONLY` — do not reopen).

## Error-research lane integration (already built this session)

`scripts/atlas/research-error-fixes.mjs` (see `parent-atlas-error-research-lane/tasks.md`) should eventually route its error-explanation step through LangExtract once LX0 passes:
`error_logs → ACE local context → LDR (if eligible) → LangExtract(errorClass, suspectedCause, proposedFix, evidenceSpans, citedSources) → error_research_context`. Not done yet — current script persists raw LDR synthesis text, not LangExtract-structured fields. Flagged here, not implemented.

## Schema/contract layer (condensed, 2026-08-12 — not implemented)

**Stack decision**: `okf` documents capability + proof status only (never validates). `Zod` is the canonical TS runtime contract owner. `JSON Schema` is the generated cross-language artifact (Python/MCP consume it, don't hand-author a second copy). `MCP` transports via `inputSchema`/`outputSchema` (JSON-RPC 2.0). `Mastra` stays optional orchestration/eval only — never a schema owner, imports the canonical Zod contracts if ever added.

**Three new contracts needed** (not built): `LangExtractRequestV1`, `LangExtractReceiptV1` (status: `GROUNDED|PARTIAL|EMPTY|FAILED`, `charInterval` required for anything promoted as evidence — ungrounded extractions must be filtered, not treated as truth), `SemanticObservationV1` (kind: `ROLE|PURPOSE|DOMAIN|CONCEPT|SIDE_EFFECT|INVARIANT|DEPENDENCY_INTENT|ERROR_CAUSE|REPAIR_HYPOTHESIS`). Validate twice: Python (Pydantic/JSON Schema) at the 8095 sidecar boundary, TypeScript (Zod) at the HTTP response boundary — intentional double-validation, one semantic contract, two process boundaries.

**Missing bridge**: `SemanticFeatureEnvelopeV1` — the compiled feature object between raw extraction and retrieval (structural facts + semantic observations + POS/domain + representation refs + provenance). Feeds `RetrievalFeatureRowV1` (derived scores: `denseSemanticScore`, `jinaCodeScore`, `bm25Score`, `astSameSymbol`, `pageRank`, `posActionMatch`, `historicalAffinity`, `fusedRank`, `rerankScore` — NOT raw 768-float vectors copied per row).

**LLM injection contract**: `ContextManifestV1` (requestId, selectedPackets[], evidenceSpans[], scores, tokenBudget, selectionPolicyRevision) — reproducible packet injection, not arbitrary JSON. Card lifecycle: `StructuralChunk` (source unit) → `SemanticFeatureEnvelope` (reusable features, Postgres durable + Qdrant projection) → `SemanticCard` (compact durable description) → query time → `RetrievalFeatureRow` (candidate-specific scores) → `ACE Context Card` (task-specific evidence bundle, cached in BitFrost/Redis — cache the card, never serialize raw 768d floats into it) → `ContextManifest` (exact LLM injection receipt).

**Performance tooling — benchmark-gated, not architecture**: simdjson/Sonic(Go)/a new Go retrieval service are all classified `PERFORMANCE_BACKEND` candidates only, never a new truth/architecture lane. Do not add any of them without a measured bottleneck (`PERF0` benchmark current parser, `PERF1` promote only if p95/throughput gate is actually hit). Explicitly rejected without evidence: new Go retrieval service (would duplicate `parent-atlas-retrieval`/`turbovec-prefilter`/canonical fusion — run `/audit-duplication retrieval` before ever reconsidering).

**Task IDs** (all NOT STARTED): LX1 `LangExtractRequestV1` Zod · LX2 `LangExtractReceiptV1` Zod · LX3 export JSON Schema artifacts · LX4 8095 validates against same schema · LX5 require grounding before `SemanticObservation` promotion · LX6 persist extractor/model/source revisions · LX7 optional MCP `atlas.extract_semantics` tool using the same input/output schema · LX8 feed validated observations into `SourcePosConceptPacket` · LX9 explicit EMPTY/PARTIAL/FAILED status (never silent empty-success) · FE0 freeze `SemanticFeatureEnvelopeV1` · FE1 Tree-sitter+LangExtract+POS/domain → envelope · FE2 persist semantic card + provenance · FE3 EmbeddingGemma/Jina vector refs · FE4 Qdrant projection · FE5 query-time FeatureRow compiler · FE6 TurboVec/Qdrant/BM25/AST-graph scores into FeatureRow · FE7 canonical fusion + Mixedbread · ACE0 `ContextManifestV1` · ACE1 hydrate selected packets/cards · ACE2 BitFrost hot cache · ACE3 Ornith packet injection · PERF0 benchmark JSON parsing · PERF1 promote simdjson/Sonic only if bottleneck measured.

**Gates**: `LANGEXTRACT_SCHEMA_CONTRACT_PROVEN`, `LANGEXTRACT_GROUNDING_PROVEN`, `LANGEXTRACT_WORKER_PATH_PROVEN`, `MCP_LANGEXTRACT_TOOL_CONTRACT_PROVEN` — none yet run.

## GPU/NLP feature-materialization duplication audit (2026-08-12 — read-only, no code written)

Ran against a request to build "SemanticFeatureEnvelope / FeatureRow / FeatureMatrix / Arrow
snapshot / GPU memory owner / GEMM owner / hypergraph projection / ContextManifest" from
scratch. **Audited first per the reuse-first rule below — most of it already exists.**

| Capability | Existing owner(s) | Classification | Live callers | Verdict |
|---|---|---|---|---|
| A. Reusable semantic feature envelope | `atlas/feature-matrix-schema.ts` (`FeatureMatrixRowV1Schema`/`V2Schema`, identity chain + dense_768/384 + latent_64 + lexical + topology + classifiers) | `CANONICAL_OWNER` | 12 files incl. `runtime-registry.ts`, `master-feature-map.ts`, 8 `*.spec.ts` | **RESOLVED** — this already *is* `SemanticFeatureEnvelopeV1`, just under a different name. Do not create a parallel type. |
| A2. Source/POS/concept packet | `analysis/source-pos-concept-packet.ts` | `CANONICAL_OWNER` | 4 files (`daily-graphify-board-recommendations.ts`, `code-evidence-synthesizer.ts`, self, spec) | RESOLVED |
| B. Query-time FeatureRow | same `feature-matrix-schema.ts` file — no separate query-time type exists yet | `CANONICAL_OWNER` (extend, don't fork) | — | **PARTIAL** — schema has no `dense_semantic_score/bm25_score/ast_same_symbol/…` derived-score shape yet (FE5/FE6 below). Extend this file, do not create `feature-row-compiler.ts` as a peer type. |
| C. Contiguous FeatureMatrix (ordered, revisioned) | none in TS. Python `parent_atlas_tensor/feature_matrix.py` exists but owns a **different, narrower 5-column schema** (`entropy_norm, ast_signal, domain_fit, authority_norm, execution_utility` + 4-col topology) — not the same contract as `FeatureMatrixRowV1Schema` | `EXPERIMENT`/`FIXTURE_ONLY` | Zero real callers found — only referenced by one-off proof scripts in `data/atlas-tensor-proof/*.py` (t3/t6b/t6c sweep scripts) | **NOT_PROVEN, genuine gap if a compact analytical X[N,F] matrix is actually needed** — but do not conflate this Python file with capability C; it's a different, narrower schema already spoken for by those proof scripts. |
| D. Arrow IPC mmap artifact | Python `parent_atlas_tensor/arrow_ipc.py` — `fixed_f32`, `feature_batch` (N×5), `semantic_batch` (N×768), `write_ipc_file`, `open_mmap`, `sha256_file` | `EXPERIMENT`/`FIXTURE_ONLY` | Same zero-live-caller status as C | **Real writer already exists**, just unwired to anything canonical and scoped to the narrower 5-col schema. Extending/rewiring this beats writing a new `feature-snapshot-arrow.ts` TS-side writer — the artifact format is Python/PyArrow-native anyway. |
| E. GPU memory owner | JS-side pool in `gpu/libtorch-bridge.ts`: `acquireFloat32`/`releaseFloat32`/`drainFloat32Pool`, `getCudaMemoryInfo`, `getMemoryPressure`, `vramNeededMB`, `gpuHasRoom`, `heapHasRoom` | `CANONICAL_OWNER` (for the N-API/LibTorch path) | Whole `gpu-graph-analysis.ts` stack | RESOLVED for the LibTorch path. **No RMM pooled-allocator init found anywhere in `python/parent_atlas_tensor/*.py`** (`rg` for `rmm\|RMM\|PoolMemoryResource` → 0 hits) — if a RAPIDS/cuDF/cuGraph path is ever actually exercised (it currently doesn't appear to be, per repeated `CANONICAL-PACKET-WIRING`/session notes saying RAPIDS work is deferred), that's a real, currently-absent capability. Do not build it speculatively — no live RAPIDS caller was found to need it. |
| F. GEMM/projection-scoring owner | `gpu/libtorch-bridge.ts` — `computeGpuSimilarity`, `attentionScoreGPU`, `rewardScoreGPU`, `pageRankGPU`, `kmeansWithCentroidsAsync`, `trainSOMAsync` (all via `tensorrt_bridge.node` N-API/LibTorch CUDA) | `CANONICAL_OWNER` | `gpu-graph-analysis.ts`, `karpathy-gpu-enrich.mjs`, ACE context-assembler attention path | RESOLVED — do not add a second `GpuMatrixOps` interface; extend this file's exports if a `scoreFeatureMatrix(X, W)` shape is genuinely missing. |
| G. Exact cosine oracle | `python/parent_atlas_tensor/cuvs_exact.py` + `atlas/retrieval/cuvs-sidecar-client.ts` + `retrieval/autoencoder-cuvs-bridge.ts`, plus `scripts/atlas/prove-pytorch-cuvs-parity.py` | `ORACLE` | `tests/retrieval/autoencoder-cuvs-bridge.spec.ts`, audit script `audit-turbovec-cuvs-readiness.mjs` | RESOLVED — do not create a second exact-cosine owner. |
| H. Hypergraph n-ary projection | `python/parent_atlas_tensor/nary_incidence.py` (`Member`/`incidence_batch` → PyArrow `RecordBatch`) exists **but is a projection with zero live callers today** (same status as C/D) alongside the TS-side `graph/hypergraph-4d.ts` (used) and a second, apparently unrelated `features/cases/hypergraph-4d.ts` | TS `graph/hypergraph-4d.ts` = `CANONICAL_OWNER`; Python `nary_incidence.py` = `FIXTURE_ONLY`; `features/cases/hypergraph-4d.ts` = **unclassified, needs its own check** — same-name file in a different directory is exactly the CLAUDE.md "duplication" pattern | **NEW_CONFLICT (minor)** — `features/cases/hypergraph-4d.ts` was not audited for content/callers this pass; flagging rather than assuming it's a duplicate or a false-positive. Do not build a new HyperGraphRAG subsystem — reuse `graph/hypergraph-4d.ts`, and materialize into `nary_incidence.py`'s existing incidence-batch shape if a PyArrow projection is ever wired up. |
| I. ACE ContextManifest | **Two things with the same name, different status**: (1) `ace/context-compiler.parent-atlas.ts` defines `ContextManifest`/`ContextCandidate`/`ContextSelectionPolicy` with explicit OpenSpec refs (`parent-atlas-agentic-completion`) — well-designed, but **zero production callers**, only its own `.test.ts`; (2) the actually-live ACE path is `ace/context-assembler.ts` (`assembleACEContext`/`buildACEPromptCached`, re-exporting from `features/ai/ace/context-assembler.ts`), called from 8 real routes/services (`api/v1/query`, `api/cases/[id]/similar`, `api/ace/summarize`, `api/synthesis/generate`, `api/sse/chat`, `mcp-tool-dispatch.ts`, `openai-facade.ts`, `autonomous-agent.ts`) and has **no `ContextManifest`-shaped output today**. | `context-compiler.parent-atlas.ts` = `EXPERIMENT` (well-formed, unwired); `context-assembler.ts` = `CANONICAL_OWNER` (live, no manifest) | see above | **NEW_CONFLICT** — two ContextManifest-shaped things, neither wired to the other. Correct fix is almost certainly "wire the existing `ContextManifest` type from `context-compiler.parent-atlas.ts` into the live `context-assembler.ts` output," not create a third file. Flagging per Phase 4 rule rather than picking a winner unilaterally — this is exactly the kind of one-line-looking decision that isn't. |
| I2. Ancillary ACE re-export | `ace/ace-context-assembler.ts` — one-line re-export of `assembleACEContext` from `features/ai/ace/context-assembler.js` | `COMPATIBILITY` (possibly `DEAD` — zero callers found besides itself) | 0 external callers found | Flag for archival consideration; not touched. |
| J. BitFrost hot cache | `atlas/tensors/bitfrost-valkey-contract.ts` — `valkeyTileKey`/`valkeyCentroidKey`, `HotMetadataCache` interface (`getTileHint`/`putTileHint`/`invalidatePrefix`) | `CANONICAL_OWNER` | not traced further this pass | RESOLVED — already scoped correctly as cache-only (no ranking logic in the interface), matches the hard rule. |
| LangExtract grounding contract (Phase 2 in the earlier prompt session) | `analysis/ast-langextract-bridge.ts` | exists, but **no `char_interval`/grounding/`GROUNDED|PARTIAL|EMPTY|FAILED` status concept found in it** (`rg` for those terms → 0 hits) | — | **NOT_PROVEN, confirmed real gap** — matches LX1/LX2/LX5/LX9 already logged above as NOT STARTED. Nothing to reuse here beyond the bridge file itself as the integration point. |

### Not re-audited this pass (out of the low-effort budget for this sweep, do not assume clear)

RRF/reranker capability was **not** re-audited here — CLAUDE.md already documents this as
known `BASELINE_DEBT` (13+ reranker/rrf files, `canonical-rerank-executor.ts` self-declared
canonical, rest unclassified) and a fresh `rg` this pass turned up **30+** files matching
`*rrf*` alone. Do not add a 31st. If RRF work is needed, run `/audit-duplication reranker`
as its own bounded task before touching it — it is too large to fold into this sweep.
`embedding-contract-768.ts`/`embedding-contract.ts` (two files) and
`qdrant-collection-contracts.ts` were seen as heavily-used (67 files reference
`semantic_768`/`jina_code_768`) but not individually classified this pass — treat as
probably-canonical, not confirmed.

### Net effect of this audit

**Zero new files created.** Every capability the original request listed (A–J) already has
at least a partial owner; the only capabilities with a genuine, unowned gap are: capability C
(TS-side compact FeatureMatrix — the Python one is real but schema-mismatched and unwired),
LangExtract grounding (LX1/LX2/LX5/LX9, already tracked above), and the `ContextManifest`
wiring gap (I). Recommended single next action, if this work continues: **wire
`ContextManifest` from `context-compiler.parent-atlas.ts` into `context-assembler.ts`'s
output** — smallest genuinely-missing piece, reuses an already-designed contract, touches
one canonical file instead of forking a new one. Everything else audited here should be
extended in place, not duplicated.

### ACE0/ACE1 done (2026-08-12) — additive bridge, not a rewrite of `assembleACEContext`

`assembleACEContext` in `features/ai/ace/context-assembler.ts` is ~1400+ lines with many
early-return branches and 8 live production callers (`api/v1/query`, `api/cases/[id]/similar`,
`api/ace/summarize`, `api/synthesis/generate`, `api/sse/chat`, `mcp-tool-dispatch.ts`,
`openai-facade.ts`, `autonomous-agent.ts`). Editing its internals to emit a manifest directly
would be a high-blast-radius change for a single confirmation ("yes") — deliberately **not**
done. Instead, wired a **pure, additive bridge**:

- `sveltekit-frontend/src/lib/server/ace/ace-context-manifest.ts` — new file,
  `buildContextManifestFromACE(context: ACEContext, opts)` maps `codebaseContext` (→ `dense`
  lane), `ragChunks`/`docChunks` (→ `dense`/`lexical`), `kbChunks` (→ `lexical`), `caseChunks`
  (→ `exact`), `kagNeighbors` (→ `graph`) into `ContextCandidate[]`, then calls the existing
  `compileContext()` from `context-compiler.parent-atlas.ts`. Does not call retrieval, does
  not mutate its input, does not touch `assembleACEContext` or any of its 8 callers.
- `ace-context-manifest.spec.ts` — 3 tests, all passing: empty context → zero-candidate
  manifest; lane mapping + deterministic `manifest_id` across two identical compiles; input
  `ACEContext` is never mutated. `tsgo --noEmit -p .` reports zero errors against either file.

**Adoption is opt-in**: any of the 8 existing callers can call
`buildContextManifestFromACE(aceContext, { request_id })` after they already have an
`ACEContext`, to get a `CompiledContext` (manifest + selected/rejected + deterministic
`prompt_packets`) — and, via `createDrizzleContextManifestPersistence()` (already in
`context-compiler.parent-atlas.ts`, needs the companion `0153_atlas_context_manifests.sql`
migration applied — **not verified live this pass**, only referenced in a code comment), can
persist it. **No caller has been switched over yet** — that's a separate, scoped decision per
route, not bundled into this change.

Also found and left unfixed (recorded, not touched): `ace/context-assembler.ts` itself
contains *both* a thin re-export block (the 8 real callers use this) *and* its own unrelated
`ACEContextAssembler` class with a parallel `ACEPacket`/`assemble()` shape — a second,
apparently-dead duplication inside the same file (0 external callers of
`getACEContextAssembler()`/`new ACEContextAssembler()` found). Separately, `ACEContext` itself
is declared in two places — `ace/types.ts` (the one actually imported, canonical) and
`types/parent-atlas-core.d.ts` (unaudited this pass) — flagging per the same pattern, not
resolved here.
