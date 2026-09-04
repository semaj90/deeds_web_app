# Parent Atlas — Canonical Directory Ingestion Fabric Tasks

## Safety and ownership preflight

- [x] **DIR-INDEX-00A** Read `openspec/changes/parent-atlas-code-ingestion-pipeline/tasks.md`, `parent-atlas-transport-memory-boundaries/tasks.md`, the semantic-768 canonical change, retrieval/fusion ownership changes, and current source/Graphify lineage reports before creating any new writer or table. Evidence: `dir-index-00-ownership-audit.md`.
- [x] **DIR-INDEX-00B** Produce an ownership matrix for existing source inventory, chunk identity, AST owner, semantic materializer, Qdrant projector, lexical FTS owner, graph projector, NLP enrichment, OpenSpec/task parsing, ContextManifest, ACE packet, and prefill receipt paths. Classify each `REUSE`, `EXTEND`, `SUPERSEDE_AFTER_PROOF`, or `MISSING`. Evidence: `dir-index-00-ownership-audit.md`.
- [x] **DIR-INDEX-00C** Fail the implementation plan if it would create a second canonical source/chunk identity, a second `semantic_768` representation owner, a second RRF/fusion owner, or a second Graphify canonical writer. Result: `PASS_WITH_GUARDS`; directory fabric may add inventory/representation glue but must reuse existing semantic, fusion, graph, context/prefill, and transport owners. GPU artifact work remains blocked on existing contract-owner selection.

## DIR-INDEX-01 — deterministic inventory

- [x] **DIR-INDEX-01A** Define `SourceArtifactV1` with `sourceRef`, `relativePath`, `contentHash`, `sourceRevision`, `byteLength`, `workspaceRevision`, parser/producer revisions, and optional language/extension/MIME metadata. Proven by `scripts/atlas/prove-dir-index-01-source-identity-v1.mjs` (`sourceArtifactContract=true`).
- [x] **DIR-INDEX-01B** Make `mtime` diagnostic-only; prove `sourceRevision` is derived from immutable bytes or an already-proven canonical revision owner. Proven by the same runner (`immutableRevision=true`, `diagnosticMtimeExcluded=true`).
- [x] **DIR-INDEX-01C** Define a versioned inventory policy for initial roots (`docs`, `openspec`, next-step/memory evidence, selected source roots) with deterministic path ordering and explicit excludes for generated/vendor/cache/model/submodule content. Proven by the same runner (`inventoryPolicy=true`, `repositoryEscapeFailClosed=true`).
- [x] **DIR-INDEX-01D** Add a read-only inventory proof that runs twice over a fixed fixture and produces identical ordered source refs/revisions/checksum. Proven by the same runner (`deterministicOrdering=true`, `deterministicReplayChecksum=true`; six tests passed).

DIR-INDEX-01 execution proof (2026-09-04): `DIR_SOURCE_IDENTITY_PASS`; compile status 0; test status 0; `canonicalWrites=false`; `datastoreWrites=false`; `modelCalls=false`. Commit `2661b45c769e395ca19be936a05d92a14db81f7f` contains the proof runner. This closes source identity only; `DIR-INDEX-02` remains the next gate.

## DIR-INDEX-02 — canonical chunk identity

- [x] **DIR-INDEX-02A** Define `CanonicalChunkV1` with byte-accurate `startByte`/`endByte`, source/workspace revision, `textChecksum`, chunker revision, and optional heading/symbol/AST provenance. The local proof passed the contract and exact UTF-8 span checks.
- [x] **DIR-INDEX-02B** Reuse the proven Tree-sitter/GIS/Graphify symbol owner for source code; never derive a competing canonical symbol ID from the directory chunker. The local proof passed native identity reuse and competing-identity rejection.
- [ ] **DIR-INDEX-02C** Implement deterministic Markdown/API-doc section and code-example segmentation with stable heading paths.
- [ ] **DIR-INDEX-02D** Implement bounded JSON/YAML logical-object segmentation with byte-accurate source spans where parser support is proven; typed reject otherwise.
- [ ] **DIR-INDEX-02E** Prove repeated chunking over identical bytes emits identical chunk IDs, spans, checksums, and provenance.

DIR-INDEX-02 adapter proof (2026-09-04): `scripts/atlas/prove-dir-index-02-canonical-chunk-v1.mjs` returned `DIR_CHUNK_IDENTITY_PASS` locally. It proves UTF-8 span reproduction, native Tree-sitter/Graphify identity preservation, deterministic replay, and competing-identity rejection across five tests. Markdown/API and JSON/YAML segmentation remain unproven; production promotion remains blocked and no datastore writes occurred.

Live chunk-bridge audit (2026-09-04): `scripts/atlas/audit-chunk-bridge-v1.mjs` examined 332 bounded rows with 79 `EXACT_CHUNK_IDENTITY`, 74 `SOURCE_ONLY_AMBIGUOUS`, 179 `REVISION_UNPROVEN`, and zero content/source mismatches. The audit's `promotionEligible` flag applies only to its exact bounded bridge selection; it is not full directory-ingestion proof. Report: `docs/reports/chunk-bridge-v1.json`. Keep DIR-INDEX-02 open until the canonical directory adapter binds exact source/workspace revisions for the admitted population.

## DIR-INDEX-03 — representation registry

- [ ] **DIR-INDEX-03A** Define `RepresentationDescriptorV1` and `RepresentationKindV1` for lexical, sparse, semantic, AST, NLP, ontology, graph, summary, LOD, and OpenSpec/task representations.
- [ ] **DIR-INDEX-03B** Prove logical idempotency over `(chunkId, sourceRevision, kind, producerRevision)` and reject duplicate active representation ownership.
- [ ] **DIR-INDEX-03C** Record projection refs as replaceable descriptors only; Qdrant point IDs, Neo4j element IDs, GPU ordinals, Valkey keys, and transport IDs cannot become canonical identity.
- [ ] **DIR-INDEX-03D** Add invalidation dependency metadata so representation changes are bounded to source/producer revisions rather than daily full rebuilds.

DIR-INDEX-03 owner audit (2026-09-04): the existing `packages/semantic-contracts/src/vector-manifest.ts` remains the representation registry. Its focused Vitest suite passed 2/2 tests and confirms the current semantic/latent family, including `semantic_768`, physical `latent_256`, and derived `latent_128`/`latent_64`. This does not close DIR-INDEX-03A-D; directory-specific idempotency, invalidation, and projection-reference proof remain open.

## DIR-INDEX-04 — PostgreSQL lexical authority

- [ ] **DIR-INDEX-04A** Audit current Postgres chunk/source tables and lexical FTS implementation; reuse existing canonical rows/table owners where logically equivalent.
- [ ] **DIR-INDEX-04B** Add or align a weighted lexical `tsvector` using path, heading, symbol name, body, tags, and admitted concept labels with a GIN index.
- [ ] **DIR-INDEX-04C** Keep `pg_trgm` as an optional identifier/path/fuzzy lane; do not replace native FTS or introduce a second lexical fusion owner.
- [ ] **DIR-INDEX-04D** Run a bounded explain/analyze proof showing the intended GIN/bitmap-capable query path on a fixed corpus. Record PostgreSQL 18 server settings diagnostically; do not create a Parent Atlas AIO retriever abstraction.

DIR-INDEX-04 live owner audit (2026-09-04): `scripts/atlas/audit-atlas-indexing-surfaces.mjs` reached PostgreSQL 18.4 with `pg_trgm` 1.6 and `vector` 0.8.3. It found `codebase_chunk_index` populated (55,853 rows), but the canonical `semantic_768` column is partial (`55,169/55,853`), and `pg_search` 0.25.1 is present while the report leaves the lexical owner `UNVERIFIED_PG_SEARCH_AVAILABLE`. This is diagnostic evidence only; no index/table writes were performed and DIR-INDEX-04A-D remain open pending owner confirmation and bounded query-plan proof.

Lexical follow-up (2026-09-04): `scripts/atlas/audit-cpu-first-packet-retrieval.mjs` returned `LIVE_PASS` for the existing packet-level CPU retrieval smoke path (`atlas_packets=61,715`, Qdrant content dimension `768`). The more specific `scripts/atlas/audit-postgres-fts-rejection-reasons-v1.mjs` found `354` `UNRESOLVED_BRIDGE`, `1` `AMBIGUOUS_BRIDGE`, `11` exact-bound, `4` hash-exact-bound, and `3` hash-scope-mismatch rows for `codebase_chunk_index.search_vector`. Reports: `docs/reports/cpu-first-packet-retrieval-readiness.json` and `docs/reports/postgres-fts-rejection-reasons-v1.json`. Packet retrieval passing does not close DIR-INDEX-04; code-chunk FTS identity/rejection handling remains open.

DIR-INDEX-04 schema inspection (2026-09-04): live `codebase_chunk_index.search_vector` is `tsvector`, maintained by trigger `trig_update_codebase_chunk_search_vector` / `compute_codebase_chunk_search_vector()`, and indexed by `idx_codebase_chunk_bm25_search` using GIN. The trigger weights `relative_path`, `symbol`, AST terms/imports/exports, `summary`, `content`, and `semantic_tags`; `search_vector` is not a generated column and has no default. Coverage is `55,853/55,853` non-null, with 53,027 rows also carrying both `source_ref` and `content_hash`. This confirms the lexical producer exists; the remaining 354 unresolved and 1 ambiguous rows are identity/revision bridge findings, not evidence that a second FTS owner is needed.

FTS rejection classification (2026-09-04): `docs/reports/postgres-fts-rejection-reasons-v1.json` covers 373 unique lexical chunks. `354` are explicitly `UNRESOLVED_BRIDGE` (identity-link status unresolved), `1` is `AMBIGUOUS_BRIDGE`, and `3` are `HASH_SCOPE_MISMATCH`; `11` are `BRIDGE_EXACT_BOUND` and `4` are `HASH_EXACT_BOUND`. The report's query breakdown is diagnostic only. No source/chunk repair or promotion is authorized until the unresolved/ambiguous/hash-scope rows are independently reconciled.

Graph revision owner audit (2026-09-04): `scripts/atlas/audit-graph-revision-owner-v1.mjs` returned `GRAPH_REVISION_OWNER_DATA_PRESENT_REQUIRES_CURRENT_BINDING_CHECK`. `atlas_graph_snapshots_v2` (2 rows) and `atlas_relationships` (603 rows) have no graph-revision column; `atlas_hyperedges` has one historical revision across 62,802 rows bound to `git:0084288f26`; `graph_analysis_runs` has 24 rows across five revisions bound to `workspace:parent-atlas`. The current expected workspace revision was `sha256:927ed41118a45a4b88fdaf15229f8e94358a375bd5b3ea19421ea42d2fa5bad3`. This confirms a current-binding gap; no synthetic graph revision is admitted.
- [ ] **DIR-INDEX-04E** Add lexical fixtures for exact path, heading, symbol, body, tag/concept, and typo/substring cases with canonical candidate identity readback.

## DIR-INDEX-05 — semantic_768 materialization

- [ ] **DIR-INDEX-05A** Reuse the frozen canonical `semantic_768` contract and existing representation owner; reject any 512/384/latent fallback as canonical semantic materialization.
- [ ] **DIR-INDEX-05B** Batch materialize admitted chunks once per `(chunkId, sourceRevision, semantic producer revision)` and record finite/dimension/normalization checks.
- [ ] **DIR-INDEX-05C** Keep `semantic_768_fp32` semantic identity distinct from optional `semantic_768_half` or quantized serving projections.
- [ ] **DIR-INDEX-05D** Prove replay checksum/dimension parity on a bounded fixed corpus before projector writes.

## DIR-INDEX-06 — Qdrant dense/sparse projection

- [ ] **DIR-INDEX-06A** Audit the current live Qdrant collection(s) and payload lineage before choosing reuse vs a new projection collection.
- [ ] **DIR-INDEX-06B** Project the canonical chunk identity and revision fields into Qdrant payloads; no Qdrant-local ID may replace `chunkId`/`packetKey`/`sourceRef` lineage.
- [ ] **DIR-INDEX-06C** Support named dense `semantic_768` plus a revision-qualified sparse BM25 representation where the deployment supports the chosen sparse producer.
- [ ] **DIR-INDEX-06D** Make sparse production independent of server-side inference availability; record algorithm/tokenizer/producer revisions.
- [ ] **DIR-INDEX-06E** Prove dense and sparse point round-trip back to canonical Postgres identity on a bounded cohort before bulk projection.

## DIR-INDEX-07 — enrichment DAG

- [ ] **DIR-INDEX-07A** Attach AST/symbol metadata as a derived representation after canonical source/chunk ownership is proven.
- [ ] **DIR-INDEX-07B** Run 8095 NLP/domain/concept enrichment once per source/chunk/producer revision and persist typed evidence/diagnostics.
- [ ] **DIR-INDEX-07C** Link ontology nominations / admitted ontology tuples only through the existing ontology owner; enrichment must not self-admit canonical ontology truth.
- [ ] **DIR-INDEX-07D** Parse OpenSpec/next-step evidence into revision-qualified observations containing status, dependency/blocker, proof, safe-next-command, and report references where present.
- [ ] **DIR-INDEX-07E** Isolate representation failures so a failed NLP/ontology/summary producer cannot corrupt canonical source/chunk identity.

## DIR-INDEX-08 — graph projection

- [ ] **DIR-INDEX-08A** Reuse Graphify/canonical structural relationship evidence; do not infer graph truth independently from summary/NLP text when a structural owner exists.
- [ ] **DIR-INDEX-08B** Project canonical relationship evidence to Neo4j with source/workspace/graph revision qualifiers and deterministic source identity readback.
- [ ] **DIR-INDEX-08C** Keep cuGraph as a GPU execution projection over a frozen graph snapshot; PageRank/BFS/SSSP/community outputs are features/evidence, not canonical IDs or fusion owners.

## DIR-INDEX-09 — summaries and LOD compiler

- [ ] **DIR-INDEX-09A** Define LOD0 identity/path, LOD1 one-line summary/tags, LOD2 symbol/section summary, LOD3 exact source span, LOD4 bounded neighbors, and LOD5 whole-file fallback.
- [ ] **DIR-INDEX-09B** Record token-cost estimates, producer revision, evidence checksum, and source/chunk revision for every compiled LOD artifact.
- [ ] **DIR-INDEX-09C** Prove LOD summaries cannot overwrite or substitute the source span they summarize.
- [ ] **DIR-INDEX-09D** Add a fixed-query fixture showing lower-token LOD selection while retaining the exact evidence reference required for promotion.

## DIR-INDEX-10 — retrieval parity

- [ ] **DIR-INDEX-10A** Run independent logical lanes for PostgreSQL FTS, sparse BM25, semantic_768, structural AST/symbol, graph, and admitted KAG/concept evidence where enabled.
- [ ] **DIR-INDEX-10B** Deduplicate canonical candidates inside each logical lane before fusion.
- [ ] **DIR-INDEX-10C** Prove multiple semantic executors cannot generate multiple semantic RRF contributions for one canonical candidate.
- [ ] **DIR-INDEX-10D** Record lane-local diagnostics separately from cross-lane ranking and reuse the existing SearchRuntime/RRF owner.

## DIR-INDEX-11 — frozen candidate population

- [ ] **DIR-INDEX-11A** Build `CandidateOrdinalMapV1` deterministically from one revision-qualified admitted population.
- [ ] **DIR-INDEX-11B** Build `CandidateFeatureSnapshotV1` with explicit feature/representation revisions and evidence refs.
- [ ] **DIR-INDEX-11C** Prove ordinal-map checksum replay and canonical-ID round-trip before any GPU executor consumes ordinals.

## DIR-INDEX-12 — ContextManifest / ACE / prefill integration

Ownership guard: reuse the existing ACE ContextManifest compiler and `parent-atlas-agentic-file-compiler`; this change does not create a parallel context/prefill owner.

- [ ] **DIR-INDEX-12A** Feed selected canonical evidence, LOD levels, token budget, lane diagnostics, representation revisions, and checksums into the existing ContextManifest owner; version-extend only if compatibility proof requires it.
- [ ] **DIR-INDEX-12B** Keep ACE packet/reference payloads compact; do not inject entire files or duplicate durable source text into `SmartRpcPacketV1`.
- [ ] **DIR-INDEX-12C** Reuse the existing `PromptPlanV1`/prefill compiler so prompt plans contain only manifest-selected evidence and preserve the selected evidence checksum set.
- [ ] **DIR-INDEX-12D** Run bounded Ornith `:8090` synthesis replay through the existing prefill path without tools/mutations; extend existing receipt lineage only where needed and verify evidence references/stable receipt-envelope semantics.

## DIR-INDEX-13 — incremental invalidation

- [ ] **DIR-INDEX-13A** Prove unchanged content hash produces zero chunk/enrichment/projection writes.
- [ ] **DIR-INDEX-13B** Prove changed source bytes create a new source revision and only dependent representations are rematerialized.
- [ ] **DIR-INDEX-13C** Emit revision-qualified tombstones for removed sources/chunks and propagate bounded deletion/invalidation to derived projections after canonical readback.
- [ ] **DIR-INDEX-13D** Keep full rebuild as an explicit maintenance/recovery command, not the normal daily ingestion path.

## DIR-INDEX-14 — GPU tensor/execution provenance

Ownership guard: existing numeric/tensor artifact contracts overlap. No new `GpuTensorArtifactV1` owner may be created here until the existing contract-owner audit selects an extension target.

- [ ] **DIR-INDEX-14A** Select and extend the existing immutable tensor-artifact owner so tensor identity remains distinct from GPU execution identity and prefill identity; do not add another overlapping artifact contract.
- [ ] **DIR-INDEX-14B** Extend the selected GPU execution receipt/environment owner with CUDA toolkit/runtime/driver, relevant cuBLAS/cuVS/cuGraph revisions, compute capability, context class (`DEFAULT`/`GREEN`), optional context identity, and custom kernel binary checksum where applicable.
- [ ] **DIR-INDEX-14C** Keep raw CUDA IPC/VMM handles ephemeral; durable packets carry artifact/lease/execution-receipt references only.
- [ ] **DIR-INDEX-14D** Replay one deterministic GEMM/vector-ranking fixture across the current approved environment and record whether toolkit/library/context changes alter the execution identity or numerical result.
- [ ] **DIR-INDEX-14E** Keep cuVS brute force as the exact GPU oracle; run CAGRA/IVF-PQ against the same `CandidateOrdinalMapV1` with Recall@K/MRR/latency/VRAM receipts before promotion.

## DIR-INDEX-15 — gRPC/A2A projection

- [ ] **DIR-INDEX-15A** Map Parent Atlas canonical contracts to gRPC control envelopes without making protobuf bytes the canonical Parent Atlas checksum format.
- [ ] **DIR-INDEX-15B** Keep large immutable vectors/tensors behind references and approved Arrow/mmap/CUDA-local bulk transport; do not serialize bulk tensors through A2A messages.
- [ ] **DIR-INDEX-15C** Map durable Parent Atlas task results and receipts to A2A task/artifact semantics; use messages for request/control/progress as appropriate.
- [ ] **DIR-INDEX-15D** Prove disconnect/reconnect does not make ephemeral streaming messages the sole persistence location for critical prefill/GPU evidence.
- [ ] **DIR-INDEX-15E** Add adapter compatibility tests proving source/chunk/revision/evidence IDs survive Parent Atlas -> gRPC/A2A -> Parent Atlas round-trip without transport-owned identity substitution.

## Promotion sequence

1. `DIR-INDEX-00A..C` ownership audit — complete with guards.
2. `DIR-INDEX-01` deterministic source inventory.
3. `DIR-INDEX-02` canonical chunk identity.
4. `DIR-INDEX-03` representation registry.
5. `DIR-INDEX-04` PostgreSQL lexical proof.
6. Only then materialize semantic/Qdrant/enrichment/graph/LOD projections.
7. Freeze candidate ordinals before GPU experiments.
8. Prove integration with the existing ContextManifest/ACE/PromptPlan/prefill path before A2A promotion.
9. Prove incremental invalidation before enabling unattended directory ingestion.

## Promotion gates

- `DIR_SOURCE_IDENTITY_PASS`
- `DIR_CHUNK_IDENTITY_PASS`
- `REPRESENTATION_REGISTRY_PASS`
- `POSTGRES_FTS_GIN_PASS`
- `SEMANTIC_768_REPLAY_PASS`
- `QDRANT_IDENTITY_ROUNDTRIP_PASS`
- `ENRICHMENT_REVISION_PASS`
- `GRAPH_PROJECTION_IDENTITY_PASS`
- `LOD_EVIDENCE_CHECKSUM_PASS`
- `ONE_VOTE_PER_LOGICAL_LANE_PASS`
- `CANDIDATE_ORDINAL_REPLAY_PASS`
- `CONTEXT_MANIFEST_PREFILL_PASS`
- `INCREMENTAL_INVALIDATION_PASS`
- `GPU_EXECUTION_PROVENANCE_PASS`
- `A2A_GRPC_IDENTITY_ROUNDTRIP_PASS`

No unchecked task in this change authorizes production writes by implication. Writes require the existing repo's explicit bounded apply path and readback proof.
