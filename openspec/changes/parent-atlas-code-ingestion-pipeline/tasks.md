# Parent Atlas — Code Ingestion Pipeline (Chunking → Embedding → Rerank → Synthesis)

**Status**: Architecture frozen 2026-08-12. GPH-01 and GPH-07 through GPH-14 are proven; GPH-15 through GPH-22 remain open behind CHUNK0 ownership closure. The legacy extractor remains `MIGRATION_CANDIDATE`.

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

### Graphify hardening lifecycle — AST ownership and supersession

These tasks make `SUPERSEDED` an evidence-backed lifecycle state. The legacy
`scripts/atlas/knowledge-layer/ast-extractor.ts` remains `MIGRATION_CANDIDATE`
until replacement parity and zero-import evidence are both proven; it is not
safe to delete based on naming or lack of obvious callers alone.

- [x] **GPH-01** AST ownership audit — read-only receipt identifies the legacy extractor, enumerates callers/importers, records the Graphify/analysis replacement candidates, and writes `docs/reports/ast-ownership-receipt.{json,md}`.
- [ ] **GPH-02** Canonical Graphify contracts — nominate one `SourceSpan`, `SymbolFact`, and `EdgeFact` contract without duplicating downstream embedding, ranking, or Qdrant fields.
- [ ] **GPH-03** Replacement parity — prove the selected Tree-sitter/analysis owner with behavioral tests before changing the lifecycle state.
- [ ] **GPH-04** Stable symbol identity — separate logical `symbol_id`, revisioned `symbol_version_id`, and source span.
- [ ] **GPH-05** Superseded import guard — fail the audit/CI when a `SUPERSEDED` artifact gains a new import.
- [ ] **GPH-06** Retire only after proof — transition `MIGRATION_CANDIDATE → SUPERSEDED → QUARANTINED/DELETED` only after all four promotion requirements are recorded in a receipt.
- [x] **GPH-07** Canonical structural evidence contract — sidecar response is `atlas.ast.evidence.v1`; it carries structural chunks/spans only and no embeddings, ranking, Qdrant IDs, or recommendation state.
- [x] **GPH-08** Sidecar capability reporting — existing 8095 service now exposes `/capabilities` with runtime detection for treesitter-chunker, graph, GPU, and vector packages.
- [x] **GPH-09** Treesitter-chunker AST endpoint — existing 8095 service now exposes `POST /ast/chunk`; missing treesitter-chunker returns diagnostics rather than fabricated evidence.
- [x] **GPH-10** Parent Atlas sidecar adapter — existing Miniforge client now validates and returns `atlas.ast.evidence.v1` through `astChunk()` with a bounded timeout.
- [x] **GPH-11** Canonical identity normalization — pure normalizer matches the existing `atlas_ast_nodes` tree-node derivation; upstream chunk IDs remain provenance, while symbol/version/packet identities remain explicitly pending canonical persistence.
- [x] **GPH-12** Typed edge normalization — live `chunker` metadata now emits `DEFINES`, `IMPORTS`, `EXPORTS`, `CALLS`, and `REFERENCES` evidence; the downstream normalizer preserves typed edges without creating fake call symbols.
- [x] **GPH-13** AST parity corpus — six deterministic fixtures now pass against the current worker owner and live 8095 sidecar; report status is `PROVEN`.
- [x] **GPH-14** Determinism/line-shift proof — focused normalizer tests (7/7) prove repeatable symbols/edges/diagnostics for the same revision, stable target identity across source-line movement and sibling/scoped evidence changes, rename identity changes, and body-revision handling without minting canonical IDs in the normalizer.
- [ ] **GPH-15** Parse-failure isolation — prove one malformed file produces a diagnostic without aborting the batch.
- [ ] **GPH-16** Incremental extraction proof — prove changed-file extraction and explicit deletion/tombstone inputs.
- [ ] **GPH-17** Graphify daily replacement integration — wire the selected canonical owner after GPH-11 through GPH-16 pass.
- [ ] **GPH-18** Production Graphify receipt — record AST engine, revision, failures, identity, persistence, and projection evidence in the existing receipt.
- [ ] **GPH-19** Replacement ownership acceptance — require live owner, parity, span/edge parity, and unchanged canonical identity.
- [ ] **GPH-20** Mark legacy `SUPERSEDED` — blocked until every GPH-19 gate passes; legacy file remains retained.
- [ ] **GPH-21** Superseded import guard — reject new imports only after the registry state becomes `SUPERSEDED`.
- [ ] **GPH-22** Hardening recommendation receipt — emit recommendation state without mutating canonical Graphify truth.
- [x] **GPH-23** Explicit lifecycle states — govern legacy implementations with `ACTIVE`, `MIGRATION_CANDIDATE`, `SUPERSEDED`, `QUARANTINED`, and `DELETED`; the current AST extractor remains `MIGRATION_CANDIDATE`.
- [x] **GPH-24** Governance baseline — treat the ownership receipt and supersession registry as the lifecycle authority; do not promote from dead-code inference, package installation, or naming alone.
- [x] **GPH-25** `DUPLICATE_OF GPH-02/GPH-07/GPH-11/GPH-12` — canonical structural contract is tracked by the original task family; no second acceptance gate.
- [x] **GPH-26** `DUPLICATE_OF GPH-17` — replacement owner reachability remains part of Graphify daily integration.
- [x] **GPH-27** `DUPLICATE_OF GPH-13` — parity corpus and `ast-replacement-parity.{json,md}` remain one task.
- [x] **GPH-28** `DUPLICATE_OF GPH-14` — determinism and line-shift identity remain one task.
- [x] **GPH-29** `DUPLICATE_OF GPH-15/GPH-16` — failure and incremental isolation remain the original tasks.
- [x] **GPH-30** `DUPLICATE_OF GPH-18` — production receipt remains one task.
- [x] **GPH-31** `DUPLICATE_OF GPH-19` — replacement acceptance gates remain one task.
- [x] **GPH-32** `DUPLICATE_OF GPH-20` — controlled supersession remains one task.
- [x] **GPH-33** `DUPLICATE_OF GPH-21` — regression import guard remains one task.
- [x] **GPH-34** `DUPLICATE_OF GPH-22` — hardening recommendation lifecycle remains one task.
- [ ] **GPH-35** Deferred cleanup window — keep `SUPERSEDED` distinct from `QUARANTINED` and `DELETED`; removal requires a later recovery-window decision, digest/reason evidence, and rollback instructions.

### Current workstation integration note — 2026-08-13

- The AST migration has proven GPH-01, GPH-07 through GPH-14, and the governance baseline GPH-23/GPH-24. GPH-15 through GPH-22 remain open; GPH-25 through GPH-34 are closed duplicate aliases. GPH-35 remains the later cleanup-window gate. The legacy extractor stays `MIGRATION_CANDIDATE`; no deletion or unsafe `SUPERSEDED` promotion is authorized.
- Latest bounded parity run: `npm run atlas:ast:replacement:parity` checked six fixtures against the live worker owner and rebuilt 8095 sidecar. The report is `docs/reports/ast-replacement-parity.{json,md}` with status `PROVEN`; structural names, typed imports, spans, and malformed-source diagnostic detection passed. Batch failure isolation, broader CHUNK0 ownership closure, and supersession gates remain open.
- Bounded sidecar isolation evidence: `npm run atlas:ast:failure:isolation` now runs four concurrent cases (two valid TypeScript files, malformed `ERROR`, and missing-delimiter `MISSING`) and passes 4/4; `docs/reports/ast-failure-isolation-proof.{json,md}` records typed `ChunkingError` diagnostics while neighboring files complete. Full GPH-15 remains open until the production Graphify batch caller consumes these per-file results without aborting.
- End-to-end gate attempt (2026-08-14): replacement parity `PROVEN`, sidecar failure isolation `PROVEN`, bounded incremental extraction `BOUNDED_PROVEN`, and ownership audit `PROVEN_AUDIT`. GPH-15 has live sidecar evidence and worker-level per-job isolation, but a live database-backed Graphify batch receipt was not run. GPH-16 now has a read-only proof for unchanged-file skip, changed-file re-extraction through 8095, and explicit deletion tombstones; production Graphify delta wiring remains pending. The new owner trace confirms `graphify:daily` does not invoke either `sveltekit-frontend/scripts/atlas/ast-treesitter-facts.mjs` or the 8095 replacement, so GPH-17A canonical owner selection is blocked and no parallel pipeline will be created. GPH-18 remains blocked pending replacement-aware receipt integration. GPH-19/GPH-20 remain blocked by those promotion gates. GPH-21 is observable through the ownership audit but not yet a dedicated CI import-guard gate. GPH-22 has no hardening recommendation receipt yet.
- Current AST gate matrix: `GPH-13 PASS`, `GPH-14 PASS`, `GPH-15 SIDECAR_FAILURE_ISOLATION_PROVEN/PRODUCTION_BATCH_PENDING`, `GPH-16 BOUNDED_PROVEN/PRODUCTION_DELTA_PENDING`, `GPH-17A OWNER_SELECTION_BLOCKED`, `GPH-17B NOT_WIRED`, `GPH-17C FALLBACK_POLICY_NOT_DEFINED`, `GPH-18 BLOCKED_RECEIPT_INTEGRATION`, `GPH-19 BLOCKED`, `GPH-20 BLOCKED`, `GPH-21 AUDIT_DETECTION_PASS/CI_GUARD_PENDING`, `GPH-22 OPEN`. The legacy extractor remains `MIGRATION_CANDIDATE`; no unsafe promotion or deletion is authorized.
- Owner trace artifact: `npm run atlas:graphify:ast:owner:proof` returned `OWNER_SELECTION_BLOCKED` and wrote `docs/reports/graphify-ast-owner-trace.{json,md}`. The package exposes `atlas:ast:facts:apply` separately, but the `graphify:daily` chain does not call it; the replacement insertion boundary therefore still requires an explicit owner decision.
- Pipeline ownership order is frozen for the next integration slice: workspace/file inventory and chunk indexing → AST evidence materialization → canonical identity/graph facts → semantic_768/Qdrant projection → centroid/routing assignment → Graphify receipt → recommendation/Kanban task. Recommendations consume receipts; they do not become an AST or vector-index owner.
- ANN boundary is also frozen: Valkey/Redis is cache and hot-routing state only; Qdrant remains the persistent dense projection; DiskANN/Vamana, cuVS/CAGRA, and TurboVec are optional dense executors behind one SearchRuntime lane and must preserve filter, revision, and canonical-identity parity. None is an AST supersession gate.
- Bounded RAPIDS KNN client added at `sveltekit-frontend/src/lib/server/atlas/retrieval/atlas-rapids-knn-client.ts`; it targets the existing `python/atlas_rapids_sidecar.py` `/v1/knn/exact` and `/v1/knn/cagra` contracts with `semantic_768`, packet/revision identity, and fail-before-network guards. This is `CREATED` and fixture-tested, not live RTX-proven: `127.0.0.1:8098` was not listening during the attempt.
- Current GPU correction (2026-08-14): the existing 8098 sidecar was subsequently started from `atlas-rapids-cu13`; exact cuVS brute-force KNN is `PROVEN_ON_LIVE_FIXTURE` and CAGRA is `RUNTIME_PROVEN_ON_TINY_FIXTURE` with Recall@3 = 1.0. Evidence: `docs/reports/gpu-knn-exact-runtime-proof.{json,md}` and `docs/reports/gpu-knn-cagra-runtime-proof.{json,md}`. Larger-corpus recall, Qdrant-corpus comparison, and production SearchRuntime wiring remain open.
- The canonical AST owner boundary is now implemented as `GraphifyStructuralMaterializer` → `AstProvider` → 8095. The materializer normalizes structural evidence, preserves upstream chunk IDs as provenance, does not persist canonical identities or projections, and fails closed on sidecar errors. Focused tests cover `PROVEN`, `RECOVERED_WITH_ERRORS`, and `FAILED`; production `graphify:daily` reachability and fallback policy remain pending.
- Graphify owner trace (2026-08-14): `npm run atlas:graphify:daily:readiness` passes its required-script check, but `graphify:daily` executes `scripts/startup/run-graphify-daily-startup.mjs` → `graphify:daily:chain`; that chain does not invoke the 8095 AST replacement. `scripts/atlas/daily-graphify-concrete-dag.mjs` is a separate DAG that reports existing AST facts and is not the live `graphify:daily` chain. This is the concrete GPH-17 blocker: select one owner and integrate the replacement behind it; do not create a parallel Graphify pipeline.
- PyTorch, RAPIDS/cuVS/cuGraph/CAGRA, TensorRT, LibTorch, simdjson, and multi-threaded execution remain separate deferred integration lanes. Their source files and dedicated sidecar definitions remain present; the lightweight 8095 AST sidecar intentionally reports those optional packages unavailable.
- Ollama remains the embedding owner; llama-server on `:8090` remains the chat/generation owner. These are separate contracts.
- Current workstation status and heuristic ranking are maintained in `docs/parent-atlas-workstation-todo.md`.
- GPU/runtime integration is intentionally tracked separately in `docs/parent-atlas-workstation-gpu-runtime-backlog.md`; its current estimate is 58% and it must not be used to promote or block AST supersession.
- BM42, CAGRA production use, PageRank retrieval weighting, RF5 fusion changes, and GPU promotion are not AST acceptance gates.

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

1. **CHUNK0** — close structural ownership: bridge/orchestrator, 8095 `treesitter-chunker`, local parser fallback, and canonical identity owner.
2. **GPH-13 → GPH-22** — run the single AST supersession sequence after CHUNK0 closes.
3. **LX0** — prove LangExtract grounding and `char_interval`-required promotion.
4. **EMB0 → EMB4** — prove the canonical EmbeddingGemma `semantic_768` card/projection contract and use live cuVS brute force as the exact evaluation oracle.
5. **CTX0** — wire the existing `ContextManifest` contract into the live `context-assembler.ts` path.
6. Then continue with **FE5/FE6** query-time `FeatureRow`, followed by the hypergraph owner audit and the reranker/RRF audit as separate bounded slices.

Do not start ContextManifest wiring before CHUNK0 and LX0 are settled; the manifest is downstream of validated chunking and grounded extraction.

## Architecture review — 2026-08-14

Use this order for the next integration work:

`file identity → AST evidence → canonical graph identity → semantic cards → EmbeddingGemma semantic_768 → Qdrant projection → exact cuVS oracle → optional CAGRA/TurboVec executor → bounded Neo4j/PageRank evidence → FeatureRow/fusion → ContextManifest → llama-server`.

KMeans centroids and SOM cells are routing metadata derived from semantic
vectors; domain classifications and ontology-linked tuples remain metadata and
graph evidence, not replacement vector geometry. PageRank remains a reusable
candidate feature. Valkey is hot cache/routing state only. Go retrieval may read
immutable Arrow IPC/mmap snapshots and rebuildable indexes, but Postgres remains
canonical. BM42, Triton, simdjson, Python free-threading, and alternate ANN
executors remain benchmark- or proof-gated.

Current reviewed status: semantic_768 contract and exact cuVS live fixture are
proven; CAGRA is proven only on the tiny fixture and remains quarantined;
same-corpus large-scale recall, Graphify owner integration, LangExtract
grounding, and TurboVec transport ownership remain open.

Review correction (2026-08-14): dense Qdrant projection, identity round-trip,
and revision-filter validation are separate from sparse/BM42 validation. The
live `codebase_chunks_768` collection has no sparse vector, so BM42 remains
`DEGRADED/NOT_RUN` and is not a blocker for the dense or AST lanes.

## Embedding/retrieval sequence (after CHUNK0/LX0 close)

| Task | State |
|---|---|
| EMB0 prove current EmbeddingGemma writer emits real 768-dim finite normalized `semantic_768` with document/query prompting + representation_revision + source-card identity | NOT STARTED |
| EMB1 build Tree-sitter semantic-card corpus (FILE/MODULE/CLASS/INTERFACE/FUNCTION/METHOD/TYPE units, not arbitrary token windows) | NOT STARTED |
| EMB2 re-embed semantic cards with canonical EmbeddingGemma | NOT STARTED |
| EMB3A verify Qdrant dense `semantic_768` projection, identity round-trip, and workspace/source revision filters | NOT STARTED |
| EMB3B verify Qdrant sparse/BM42 projection | DEFERRED — live `codebase_chunks_768` has no sparse vector; keep `DEGRADED/NOT_RUN` |
| EMB4 exact cuVS brute-force oracle on EmbeddingGemma 768d | LIVE_FIXTURE_PROVEN; same-corpus oracle comparison open |
| TURBOVEC_EXECUTION_OWNER_PROVEN choose one live transport and classify HTTP/gRPC/N-API/CLI alternatives | OPEN |
| EMB5 TurboVec index from the same semantic_768 vectors (only after execution-owner gate) | BLOCKED_BY_TURBOVEC_EXECUTION_OWNER |
| EMB6 measure TurboVec vs exact oracle (Recall@K, NDCG, latency) | BLOCKED_BY_TURBOVEC_EXECUTION_OWNER |
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

**Gates**: `LANGEXTRACT_SCHEMA_CONTRACT_PROVEN`, `LANGEXTRACT_GROUNDING_PROVEN`, `LANGEXTRACT_WORKER_PATH_PROVEN`, `MCP_LANGEXTRACT_TOOL_CONTRACT_PROVEN` — none yet proven. This is the next semantic correctness lane after AST parity; grounding must expose explicit `char_interval`/source-span evidence and `GROUNDED|PARTIAL|EMPTY|FAILED` lifecycle states before promotion.

## GPU/NLP feature-materialization duplication audit (2026-08-12 — read-only, no code written)

Ran against a request to build "SemanticFeatureEnvelope / FeatureRow / FeatureMatrix / Arrow
snapshot / GPU memory owner / GEMM owner / hypergraph projection / ContextManifest" from
scratch. **Audited first per the reuse-first rule below — most of it already exists.**

| Capability | Existing owner(s) | Classification | Live callers | Verdict |
|---|---|---|---|---|
| A. Reusable semantic feature envelope | `atlas/feature-matrix-schema.ts` (`FeatureMatrixRowV1Schema`/`V2Schema`, identity chain + dense_768/384 + latent_64 + lexical + topology + classifiers) | `CANONICAL_OWNER` | 12 files incl. `runtime-registry.ts`, `master-feature-map.ts`, 8 `*.spec.ts` | **RESOLVED** — this already *is* `SemanticFeatureEnvelopeV1`, just under a different name. Do not create a parallel type. |
| A2. Source/POS/concept packet | `analysis/source-pos-concept-packet.ts` | `CANONICAL_OWNER` | 4 files (`daily-graphify-board-recommendations.ts`, `code-evidence-synthesizer.ts`, self, spec) | RESOLVED |
| B. Query-time FeatureRow | same `feature-matrix-schema.ts` file — no separate query-time type exists yet | `CANONICAL_OWNER` (extend, don't fork) | — | **PARTIAL** — schema has no `dense_semantic_score/bm25_score/ast_same_symbol/…` derived-score shape yet (FE5/FE6 below). Extend this file, do not create `feature-row-compiler.ts` as a peer type. |
| C. Contiguous FeatureMatrix (ordered, revisioned) | none in TS. Python `parent_atlas_tensor/feature_matrix.py` exists but owns a **different, narrower 5-column schema** (`entropy_norm, ast_signal, domain_fit, authority_norm, execution_utility` + 4-col topology) — not the same contract as `FeatureMatrixRowV1Schema` | `DEFERRED_UNTIL_CONSUMER` | Zero real callers found — only referenced by one-off proof scripts in `data/atlas-tensor-proof/*.py` (t3/t6b/t6c sweep scripts) | **Deferred until GA8/GA9 or a learned-policy consumer requires it.** Start with a narrower `SemanticSnapshotV1` (`semantic_768` plus ordinal/canonical identity and revisions); do not create a generic matrix without a live consumer. |
| D. Arrow IPC mmap artifact | Python `parent_atlas_tensor/arrow_ipc.py` — `fixed_f32`, `feature_batch` (N×5), `semantic_batch` (N×768), `write_ipc_file`, `open_mmap`, `sha256_file` | `EXISTING_BACKEND_WIRING_PENDING` | Same zero-live-caller status as C | **Writer exists but is not wired to the canonical snapshot path.** Reuse it for an immutable `SemanticSnapshotV1` before adding a new TS-side writer. |
| E. GPU memory owner | JS-side pool in `gpu/libtorch-bridge.ts`: `acquireFloat32`/`releaseFloat32`/`drainFloat32Pool`, `getCudaMemoryInfo`, `getMemoryPressure`, `vramNeededMB`, `gpuHasRoom`, `heapHasRoom` | `CANONICAL_OWNER` (for the N-API/LibTorch path) | Whole `gpu-graph-analysis.ts` stack | RESOLVED for the LibTorch path. **No RMM pooled-allocator init found anywhere in `python/parent_atlas_tensor/*.py`** (`rg` for `rmm\|RMM\|PoolMemoryResource` → 0 hits) — if a RAPIDS/cuDF/cuGraph path is ever actually exercised (it currently doesn't appear to be, per repeated `CANONICAL-PACKET-WIRING`/session notes saying RAPIDS work is deferred), that's a real, currently-absent capability. Do not build it speculatively — no live RAPIDS caller was found to need it. |
| F. GEMM/projection-scoring owner | `gpu/libtorch-bridge.ts` — `computeGpuSimilarity`, `attentionScoreGPU`, `rewardScoreGPU`, `pageRankGPU`, `kmeansWithCentroidsAsync`, `trainSOMAsync` (all via `tensorrt_bridge.node` N-API/LibTorch CUDA) | `CANONICAL_OWNER` | `gpu-graph-analysis.ts`, `karpathy-gpu-enrich.mjs`, ACE context-assembler attention path | RESOLVED — do not add a second `GpuMatrixOps` interface; extend this file's exports if a `scoreFeatureMatrix(X, W)` shape is genuinely missing. |
| G. Exact cosine oracle | `python/parent_atlas_tensor/cuvs_exact.py` + `atlas/retrieval/cuvs-sidecar-client.ts` + `retrieval/autoencoder-cuvs-bridge.ts`, plus `scripts/atlas/prove-pytorch-cuvs-parity.py` | `ORACLE` | `tests/retrieval/autoencoder-cuvs-bridge.spec.ts`, audit script `audit-turbovec-cuvs-readiness.mjs` | RESOLVED — do not create a second exact-cosine owner. |
| H. Hypergraph n-ary projection | `python/parent_atlas_tensor/nary_incidence.py` (`Member`/`incidence_batch` → PyArrow `RecordBatch`) exists **but is a projection with zero live callers today** alongside the used TS-side `graph/hypergraph-4d.ts` and `features/cases/hypergraph-4d.ts` | TS `graph/hypergraph-4d.ts` = `CANONICAL_OWNER`; Python `nary_incidence.py` = `FIXTURE_ONLY`; `features/cases/hypergraph-4d.ts` = **unclassified** | **MINOR DUPLICATION AUDIT OPEN** — classify the second TS file's content and callers before deciding whether it is a compatibility adapter or duplicate. Do not build a new HyperGraphRAG owner. |
| I. ACE ContextManifest | `ace/context-compiler.parent-atlas.ts` remains the contract compiler; `ace/ace-context-manifest.ts` is the additive bridge from live ACE context into that compiler. | `ARCHITECTURALLY_RESOLVED`, live adoption pending | Focused bridge tests pass for deterministic manifest IDs, lane mapping, and input immutability; no existing caller has been migrated and durable linkage is not live-proven. | **RESOLVED_ARCHITECTURALLY / LIVE_ADOPTION_PENDING** — do not rewrite `assembleACEContext`; adopt the bridge at a bounded caller and prove persistence plus `ExecutionReceipt`/`RLMTrace` linkage separately. |
| I2. Ancillary ACE re-export | `ace/ace-context-assembler.ts` — one-line re-export of `assembleACEContext` from `features/ai/ace/context-assembler.js` | `COMPATIBILITY` (possibly `DEAD` — zero callers found besides itself) | 0 external callers found | Flag for archival consideration; not touched. |
| J. BitFrost hot cache | `atlas/tensors/bitfrost-valkey-contract.ts` plus revision-qualified retrieval-key/fail-open SearchRuntime adapter | `CANONICAL_OWNER` | focused BF-01..06 contracts and RLM/SearchRuntime proofs | **PARTIAL_PROVEN** — cache-only ownership, workspace/policy revision isolation, revision-qualified retrieval keys, and fail-open behavior are proven. Pending: live `CLIENT TRACKING`, process-local L0 invalidation, expiry/eviction readback, and negative-cache receipt. |
| LangExtract grounding contract (Phase 2 in the earlier prompt session) | `analysis/ast-langextract-bridge.ts` | bridge exists, but **no proven `char_interval`/grounding/`GROUNDED|PARTIAL|EMPTY|FAILED` lifecycle contract** | — | **REAL OPEN CORRECTNESS GAP** — prioritize LX1/LX2/LX5/LX6/LX8/LX9 and the four LangExtract gates before FE5/FE6. Do not promote semantic observations from ungrounded or silent-empty results. |

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

**Zero new canonical owners were created.** The audit is updated for work completed after
2026-08-12: the `ContextManifest` row is now **RESOLVED_ARCHITECTURALLY / LIVE_ADOPTION_PENDING**
because the additive ACE bridge exists and its focused tests pass; BitFrost is
**PARTIAL_PROVEN** with revision-qualified keys and fail-open behavior proven, while live
tracking/L0 invalidation and expiry/eviction receipts remain open. The primary semantic
correctness gap is LangExtract grounding (LX1/LX2/LX5/LX6/LX8/LX9). Capability C remains
**DEFERRED_UNTIL_CONSUMER**, and D is **EXISTING_BACKEND_WIRING_PENDING**; begin with a narrow
`SemanticSnapshotV1` rather than a generic matrix. Hypergraph H remains a bounded duplication
audit, not a new retrieval owner. Extend existing owners in place and do not fork parallel
schemas or fusion paths.

**Next bounded order:** LangExtract schema/grounding/worker gates → bounded ContextManifest
caller adoption and durable linkage → BitFrost live invalidation/eviction proof → hypergraph
file ownership audit → only then FE5/FE6 or GPU snapshot wiring.

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
