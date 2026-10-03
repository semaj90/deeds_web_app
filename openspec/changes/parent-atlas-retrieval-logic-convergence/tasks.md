# Parent Atlas Retrieval Logic Convergence — Tasks

> Execution-order companion to `parent-atlas-neural-prefill-encoder` and
> `parent-atlas-retrieval-fusion-reachability`.
>
> This ledger does **not** delete or supersede historical evidence in those
> changes. It narrows the next implementation queue after the 2026-09-11
> storage/lineage audits. No tool is re-enabled, no Qdrant collection is
> created/deleted, and no datastore authority changes are authorized here.

## Current decision — 2026-09-11

Freeze the following ownership rule:

> KNN, Top-K, KMeans, SOM, PageRank, domain/topic classification, ontology,
> GraphRAG, directory enrichment, Qdrant, pgvector, cuVS, and CAGRA do not own
> source documents or canonical identities. They either produce revision-bound
> evidence/features or execute search against canonical packet/chunk identity.

The active source scope is the sealed Graphify corpus, not arbitrary filesystem
content. Current admitted read evidence names 7 repository identities and
25,271 selected source files. Repository-qualified source identity remains:

`repositoryId + repositoryRelativePath + sourceRef + sourceRevision`

with `sourceIdentityKey` binding repository identity to the relative path.

## Storage retention review — 2026-09-12

The storage census is evidence only and does not authorize cleanup. The
current report identifies 13 images without running or stopped container
ancestry, including these review candidates:

- `atlas-gpu-8098:repro-v2` (approximately 29.5 GiB);
- `atlas-gpu-8098:repro-v1` (approximately 25.9 GiB);
- the old PyTorch decoder image (approximately 12.2 GiB).

The active RAPIDS image remains container-backed and must not be treated as a
disposable duplicate merely because an older image has the same repository
name. Image ID, container ancestry, Dockerfile/build ancestry, and runtime
health must be checked together before any future cleanup decision.

The Qdrant census separately reports retained snapshot artifacts as the main
identified storage consumer. These snapshots and all Qdrant collections remain
preserved historical or derived evidence. No image, container, volume,
snapshot, cache, package, or VHDX operation is authorized by this ledger.

- [x] **STORAGE-CENSUS-01 — Record review-only retention evidence.** The
  storage audit records image IDs, sizes, ancestry, Qdrant snapshot files and
  directories, collection roles, and `deletionAuthorized=false` for every
  candidate.
- [ ] **STORAGE-REVIEW-02 — Reconcile active build/runtime ancestry.** Compare
  each candidate with Compose references, Dockerfile ancestry, active image
  IDs, and the WSL2/RAPIDS and PyTorch environment census. Do not rebuild or
  remove anything during this review. The audit now maps each container to
  its exact inspected image ID, including untagged images; Compose and WSL2
  cross-checks remain open.
- [ ] **STORAGE-REVIEW-03 — Classify Qdrant snapshot retention.** For each
  snapshot, record collection, revision/checksum, generation time, consumer
  references, rollback value, and whether it is active, rollback, historical,
  or unclassified. Produce candidates only; preserve all artifacts. The
  collection-level breakdown now reports 45 collections, 13.39 GB of live
  collection storage, and 24.94 GiB of API-visible snapshots with zero API
  errors. All 70 API-visible snapshot records now have a retention candidate
  classification (43 latest, 5 rollback, 22 older review); these labels are
  not consumer or rollback proof, so per-snapshot consumer reconciliation
  remains open. The repository-wide collection-name census is a file-level
  inventory, not proof that any individual snapshot is still required; the
  role audit separately classifies runtime `_v2` references.
- [ ] **STORAGE-REVIEW-04 — Require explicit cleanup admission.** A later
  cleanup change must name exact image IDs or snapshot paths, prove zero
  consumers and rollback coverage, capture a before/after inventory, and be
  separately authorized. VHDX compaction is last and is not part of this
  change.

## Deferred/non-blocking search-tool reintegration audit

Historical MCP audit evidence is useful input, not current enablement authority.
The 2026-08-22 audit recorded handler/list mismatches, duplicate names,
ontology-unknown tools, `atlas.search`/patch stubs, and a quarantined randomized
reranker. A fresh current audit is required before any reintegration.

Further TRACE-MCP expansion, the historical HMM/Vibreti-style repair challenger,
and query-NLP-sidecar endpoint expansion are **DEFERRED_NON_BLOCKING** while the
core retrieval logic below is incomplete. Existing proven TRACE-MCP evidence is
retained. `Vibreti` is not treated as a current implementation or owner.

- [x] **SEARCH-REINTEGRATION-01 — Inventory disabled/deprecated/quarantined search tools read-only.**
  Enumerate the current tool registry, actual handler, list exposure, callers,
  ontology registration, runtime owner, input/output contracts, and canonical
  identity/revision requirements for every search-related tool. Emit a receipt;
  do not enable or disable anything.
- [x] **SEARCH-REINTEGRATION-02 — Classify each audited tool.** Assign exactly
  one disposition: `RESTORE`, `ADAPTER_ONLY`, `SUPERSEDED`, `KEEP_DISABLED`, or
  `REMOVE_AFTER_CALLER_ZERO`. A historical count is not sufficient evidence for
  a current disposition.
- [x] **SEARCH-REINTEGRATION-03 — Require reintegration preconditions.** A tool
  may move toward `RESTORE` only after deterministic tests, canonical identity
  and revision propagation, one SearchRuntime ownership boundary, lane/executor
  semantics, caller migration evidence, and quality evaluation exist.
- [x] **SEARCH-REINTEGRATION-04 — Keep nondeterministic/stubbed search surfaces disabled.**
  The randomized reranker and `atlas.search`/patch stubs remain disabled until
  deterministic implementation, caller proof, and QRELS evaluation exist.
- [x] **SEARCH-REINTEGRATION-05 — Reconcile historical MCP mismatches against current code.**
  Re-audit the previously reported handler/list mismatches, duplicate names,
  and ontology-unknown tools. Do not blindly carry old counts forward.
- [x] **SEARCH-REINTEGRATION-06 — Preserve non-authorizing audit semantics.**
  Receipt must state `runtimeEnablementChanged=false`, `writesPerformed=false`,
  and `canonicalAuthorityChanged=false`.

### Explicitly parked surfaces

- [x] **DEFER-TRACE-MCP-01 — Park further TRACE-MCP expansion.** Existing trace
  and provenance receipts remain evidence; do not add more trace-tool surface
  until retrieval profile/ranking/pagination ownership below is closed.
- [x] **DEFER-VIBRETI-01 — Keep HMM/Vibreti-style repair challenger-only.** No
  current repository implementation is admitted. Do not introduce routing or
  ranking authority from the historical note.
- [x] **DEFER-QUERY-NLP-01 — Freeze query-sidecar expansion.** Consume existing
  grounded query/chunk features where useful, but do not add new query NLP
  endpoints in this change. The sidecar remains a feature/evidence producer,
  never an identity, search-runtime, or Qdrant writer.

## Active retrieval logic convergence

### Hard ownership invariants

- [x] **RETRIEVAL-OWNERSHIP-01 — Enforce one canonical document identity.**
  PostgreSQL packet/chunk/source/workspace lineage remains canonical. Derived
  algorithms may not mint a replacement document identity. The read-only
  ownership receipt proves `POSTGRES_PACKET_SOURCE_IDENTITY` as the canonical
  owner and separates Qdrant point IDs, candidate ordinals, graph ordinals,
  and cache keys as projection-local coordinates; live source-lineage closure
  and promotion remain separate gates.
- [x] **RETRIEVAL-OWNERSHIP-02 — Enforce one semantic logical lane.**
  `semantic_768` is one evidence lane. Qdrant HNSW, PostgreSQL exact pgvector,
  cuVS exact, CAGRA, and TurboVec are executors/challengers over that lane and
  must not receive independent RRF votes solely because execution differs.
  The storage contract and central runtime owner are `codebase_chunks_768`;
  `_v2` is explicitly challenger/compatibility-only. The role audit emits a
  per-caller classification (`ACTIVE_RUNTIME_OWNER_CANDIDATE`,
  `UNSUFFIXED_COLLECTION_CALLER_REQUIRES_CLASSIFICATION`,
  `AMBIGUOUS_MULTI_COLLECTION_CALLER`, or `REVIEW_OR_HISTORICAL`) so this
  cannot be resolved by counting raw string references. The focused migration
  moved live retrieval, ACE/ACP, provenance, and projection defaults to the
  owner constant. The audit finds zero active `_v2` retrieval callers and
  zero active executable legacy-384 callers; challenger/compatibility files
  remain explicitly classified. This closes the runtime collection-owner
  portion of the task; lineage and physical precision admission remain
  separate gates.
- [x] **RETRIEVAL-OWNERSHIP-03 — Keep candidate sets ephemeral.** KNN and Top-K
  are query operations. Do not create persistent `knn*`, `topk*`, KMeans, SOM,
  or PageRank collections to store transient candidate universes. The role
  audit now checks collection names for these transient-store patterns; a zero
  result is required before this invariant can be closed. The current audit
  found zero matching collections. This closes only the ephemeral-candidate
  invariant; semantic-owner alignment remains separately blocked by
  `SEMANTIC_OWNER_RUNTIME_CONTRACT_CONFLICT`.
- [x] **RETRIEVAL-OWNERSHIP-04 — No collection/storage promotion in this change.**
  Do not create a new Qdrant collection, delete a legacy collection/named
  vector, add an ANN index, or promote a representation without separate
  lineage + caller + QRELS evidence.

  Proven by the storage and collection-role audits: this tranche performed no
  collection, snapshot, named-vector, ANN-index, or representation operation.
  All image and snapshot candidates remain review-only with
  `deletionAuthorized=false`.

### Shared retrieval profile contracts

- [x] **RETRIEVAL-PROFILE-01 — Freeze `ChunkRetrievalProfileV1`/V2.** Define one
  revision-qualified contract that normalizes existing surfaces without adding
  a competing database. Required identity fields:
  `canonicalChunkId`, `packetKey`, `repositoryId`,
  `repositoryRelativePath`, `sourceRef`, `workspaceRevision`, `sourceRevision`.
  Feature groups must be explicit and optional-by-presence rather than
  fabricated: lexical/structural, semantic, topic/domain, topology, ontology,
  and feature/model revisions.
- [x] **RETRIEVAL-PROFILE-02 — Build a read-only profile adapter.** Hydrate the
  contract from existing canonical chunk/packet joins plus current AST,
  semantic, topology, classifier, and ontology surfaces. Emit presence masks,
  evidence refs, and revision provenance. Missing features remain missing.
- [x] **RETRIEVAL-PROFILE-03 — Prove deterministic profile identity.** Same
  canonical chunk + same referenced revisions must produce the same profile
  checksum independent of executor or retrieval order.

### File and directory aggregation

- [x] **FILE-PROFILE-01 — Freeze `FileProfileV1`.** Aggregate only from
  canonical chunk identities belonging to one revision-qualified source file.
  Preserve chunk membership checksum and source revision; do not infer file
  identity from directory names, Qdrant IDs, or array position.

  Contract and pure aggregation implementation are proven by the focused
  ChunkRetrievalProfileV2/FileRetrievalProfileV1 suite (`11/11`). Live profile
  readback, replay, and file aggregation remain separately gated below because
  the selected execution currently lacks qualified feature revisions.
- [x] **DIRECTORY-PROFILE-01 — Freeze `DirectoryProfileV1`.** Directory identity
  must be deterministic from repository identity + normalized path + workspace
  revision (UUIDv5 or equivalently deterministic content-addressed scheme).
  Include bounded aggregates such as file/chunk counts, keywords, domains,
  concept IDs, import counts, graph communities/PageRank summaries, and
  KMeans/SOM histograms. The pure aggregate contract and focused identity
  tests are present; live sealed-snapshot coverage remains a separate gate.
- [x] **DIRECTORY-PROFILE-02 — Keep directory evidence a weak prior.** Directory
  or domain metadata may adjust ranking but may not form an independent voting
  lane and may not outrank exact symbol/identifier evidence solely by path. A
  bounded pure prior helper proves those invariants without changing SearchRuntime
  or adding a retrieval lane.
- [ ] **DIRECTORY-PROFILE-03 — Prove the aggregate corpus against the sealed snapshot.**
  Count files/directories from the materialized admitted snapshot, preserve
  repository qualification for nested repositories, and reject excluded
  `.git`, `.tmp`, generated, oversized, or non-source artifacts rather than
  silently adding them.

### Semantic representation normalization

- [x] **RETRIEVAL-TEXT-01 — Freeze `retrieval_text_v1`.** Build one revisioned
  semantic text representation from bounded fields such as path, symbol, kind,
  grounded summary, keywords, concepts, structural relations, and bounded
  source text. Record template revision and checksum. The pure builder and
  deterministic tests are proven; vector generation remains shadow-only.
- [ ] **RETRIEVAL-TEXT-02 — Produce `semantic_768` from `retrieval_text_v1` in shadow.**
  Preserve EmbeddingGemma model/representation revision and source evidence;
  do not overwrite current vectors. The shadow receipt adapter and fail-closed
  tests are present; completion still requires a real EmbeddingGemma execution
  receipt bound to this retrieval-text revision.
- [ ] **RETRIEVAL-TEXT-03 — A/B current named-vector behavior before deletion.**
  Compare current content/signature/error-style representations against the
  single normalized semantic representation using the same revision-bound QRELS.
  No named vector is deleted merely because the new contract exists.

### Topology, classifier, graph, and ontology as features

- [ ] **TOPOLOGY-FEATURES-01 — Freeze `TopologyFeaturesV1`.** Normalize existing
  KMeans assignment/margin, SOM BMU coordinates/cell, graph community,
  PageRank, bridge/betweenness signal, and topology revision. These are
  annotations, not identities or search owners.
- [ ] **TOPOLOGY-FEATURES-02 — Freeze SOM encoding.** For the admitted 20x20 SOM,
  persist/transport `somX`, `somY`, `somCell = somY * 20 + somX`, and
  `somRevision`; do not require a separate ANN collection to preserve cell
  placement.
- [ ] **TOPOLOGY-FEATURES-03 — Define `manifold4` semantics before further writes.**
  Candidate semantics are normalized SOM-X, normalized SOM-Y, normalized
  structural centrality, and normalized bridge/betweenness. Categorical
  community/KMeans IDs must remain separate. Freeze the exact transform and
  revision before admitting new manifold values.
- [ ] **DOMAIN-FEATURES-01 — Normalize domain/topic classifier output.** Carry
  primary domain, calibrated probabilities/topic IDs, confidence,
  classifier/model checksum, and training-corpus revision. The classifier is a
  feature producer, not a retrieval owner.
- [ ] **ONTOLOGY-FEATURES-01 — Normalize concept/entity/tuple references.** Use
  `.okf` for schema/rule validation, OakLib for ontology lookup/alignment, and
  `OntologyLinkedTupleV1` as admitted structured evidence. Neo4j remains a
  graph projection/traversal surface, not a second canonical tuple store.
- [ ] **GRAPHRAG-FEATURES-01 — Map GraphRAG concepts onto existing code evidence.**
  Treat source files as Documents, canonical chunks/symbols as TextUnits,
  structural symbols/concepts as Entities, deterministic AST/LSP/Graphify
  edges as Relationships, grounded semantic assertions as Claims, and graph
  communities as Communities. Prefer deterministic structural extraction over
  LLM re-extraction where facts already exist.
- [ ] **GRAPHRAG-FEATURES-02 — Bound LLM synthesis to appropriate artifacts.**
  Use synthesis for directory/community summaries, ambiguous concept
  reconciliation, and optional grounded claims. Do not LLM-extract CALLS,
  IMPORTS, EXPORTS, DEFINES, etc. when Tree-sitter/LSP already owns exact
  structural evidence.

### Candidate universe, feature matrix, and ranking

- [x] **CANDIDATE-MANIFEST-01 — Freeze `CandidateManifestV1`.** Required fields:
  `requestId`, `workspaceRevision`, `candidateSetChecksum`, `rankingRevision`,
  and ordered canonical candidate IDs. This manifest freezes the ranked
  universe used by pagination and ContextManifest handoff.
- [x] **CANDIDATE-MANIFEST-02 — Keep manifest residency ephemeral.** ACE/Valkey
  may cache the manifest, candidate IDs, scores, and checksums with bounded TTL;
  PostgreSQL/Qdrant do not need a persistent Top-K table for it. The current
  contract is request-scope in-memory and any later cache entry must bind the
  candidate, workspace, and ranking checksums.
- [x] **RANK-FEATURES-01 — Map normalized profiles into the existing CandidateFeatureMatrix.**
  Preserve feature presence masks, feature revision, executor provenance, and
  canonical identity. Do not create a second feature-matrix owner. Proven by a
  read-only adapter wrapping the existing `[C,25]` matrix owner; unavailable
  evidence remains masked rather than silently zero-filled.
- [x] **RANK-BASELINE-01 — Implement/evaluate one deterministic grouped baseline.**
  Initial evaluation grouping may begin around semantic 50%, lexical 20%,
  structural 15%, ontology/graph 10%, and directory/domain/topology prior 5%.
  These are experiment weights, not promotion thresholds or immutable policy.
  Proven as a read-only profile by `grouped-ranking-baseline-v1.ts`; missing
  groups are explicit and reweighted only within the experiment. Live QREL
  evaluation and promotion remain separate gates.
- [x] **RANK-BASELINE-02 — Keep semantic executor parity out of evidence weighting.**
  Qdrant vs pgvector vs cuVS vs CAGRA execution differences become provenance,
  latency, recall, and parity metrics; they do not multiply semantic evidence.
  The grouped baseline consumes normalized signal values only; executor identity
  is intentionally absent from its scoring input and remains a separate proof
  dimension.
- [ ] **RANK-PYTORCH-01 — Add/retain PyTorch/ATen learned ranker only as shadow challenger.**
  Consume the same CandidateFeatureMatrix and compare against the deterministic
  baseline. Promotion remains blocked by existing revision-qualified QRELS.
- [ ] **FILE-DIRECTORY-AGG-01 — Aggregate after chunk-level scoring.** Produce
  file/directory result views from the ranked canonical chunk universe without
  replacing chunk-level identity or allowing directory priors to dominate
  exact evidence.

### Stable pagination and runtime adoption

- [x] **PAGINATION-01 — Implement stable cursor pagination after reranking.**
  Cursor must bind `candidateSetChecksum`, last score/order coordinate, and
  `lastCanonicalChunkId`. Do not use mutable OFFSET pagination across a ranking
  universe that can change between pages.
- [x] **PAGINATION-02 — Prove page replay.** Page 2+ must resolve against the
  same CandidateManifest/checksum as page 1 or fail closed as stale.
- [ ] **RETRIEVAL-CALLER-ADOPTION-01 — Census live callers against one SearchRuntime boundary.**
  Classify remaining search/fusion/runtime callers and migrate through adapters
  rather than creating a second runtime. Preserve one logical vote per lane.
- [ ] **RETRIEVAL-CALLER-ADOPTION-02 — Prove disabled tool non-reachability during pivot.**
  Core runtime tests must show parked TRACE-MCP/Vibreti/query-sidecar expansion
  is not required for baseline retrieval execution.

### Context/prefill handoff and quality

- [ ] **CONTEXT-HANDOFF-01 — Bind CandidateManifest to ContextManifest.** Preserve
  candidate-set checksum, ranking revision, workspace revision, evidence refs,
  and model/prompt identity through prefill assembly.
- [ ] **CONTEXT-HANDOFF-02 — Preserve deterministic prefill identity.** Continue
  using ContextManifest checksum + model/adapter/template/evidence revisions;
  candidate pagination/cache state must not change prompt identity silently.
- [ ] **RETRIEVAL-QUALITY-01 — Reuse the existing revision-bound human QRELS gate.**
  Do not mint a second judgment corpus. Baseline and learned/shadow variants
  must be compared on the same frozen candidates and held-out judgments.
- [ ] **RETRIEVAL-QUALITY-02 — Keep promotion fail-closed.** No semantic owner,
  ranker, directory prior, topology feature, knowledge-node collection, or
  disabled search tool is promoted until required lineage/caller/QRELS receipts
  pass and an explicit review authorizes the change.

## Optional/future designs — not active implementation

- [ ] **KNOWLEDGE-NODE-DESIGN-01 — Design only.** Evaluate whether one small
  `codebase_knowledge_nodes_768`-style projection could eventually consolidate
  taxonomy/concept/entity/directory/community semantic discovery. This task
  authorizes no collection creation; prove caller need, storage impact, lineage,
  and QRELS lift first.
- [ ] **GO-LEXICAL-ACCELERATOR-01 — Design only.** If Go retrieval needs mmap,
  use a revision-addressed immutable lexical artifact (`manifest`, doc IDs,
  terms/postings/offsets, compact metadata) rebuildable from PostgreSQL. It is
  an accelerator/challenger, never a new canonical lexical owner.
- [ ] **QLORA-QUEUE-01 — Design only.** Keep training-example admission in
  durable Postgres/outbox semantics with deterministic example dedup identity
  and unique execution-attempt identity. No automatic training or active-model
  promotion is permitted.

## Ordered execution queue

Do not reorder by checkbox percentage. Follow evidence dependencies:

1. Current packet/chunk lineage planner live proof.
2. `RETRIEVAL-PROFILE-01..03`.
3. `FILE-PROFILE-01` + `DIRECTORY-PROFILE-01..03`.
4. `RETRIEVAL-TEXT-01` and read-only/current representation census.
5. `TOPOLOGY-FEATURES-*`, `DOMAIN-FEATURES-01`, `ONTOLOGY-FEATURES-01`,
   `GRAPHRAG-FEATURES-*` as normalization adapters over existing evidence.
6. `CANDIDATE-MANIFEST-*` + `RANK-FEATURES-01`.
7. Deterministic ranking baseline + file/directory aggregation.
8. Stable cursor pagination.
9. SearchRuntime caller adoption/census.
10. CandidateManifest -> ContextManifest handoff.
11. Existing human revision-bound QRELS evaluation.
12. Only after core logic closes: `SEARCH-REINTEGRATION-*`, TRACE-MCP expansion,
    any Vibreti-style challenger work, or query-sidecar endpoint expansion.

## Explicit non-goals / no-write statement

This planning change does not authorize:

- PostgreSQL/Qdrant/Neo4j/Valkey/CouchDB/Graphify writes;
- creation/deletion of Qdrant collections or snapshots;
- named-vector deletion;
- new ANN indexes;
- tool enablement changes;
- model training or checkpoint promotion;
- QLoRA queue activation;
- GraphRAG canonical ownership;
- replacement of SearchRuntime;
- fabrication of missing identity/revision/feature values.

## Current producer authority cross-reference — 2026-09-12

The detailed live evidence is recorded in
`tasks-20260911-v6.md`. The current status is:

- Seven of the 52 tracked tasks are now complete: the three retrieval-profile
  contracts, file-profile contract, storage census, no-storage-promotion, and
  candidate-ephemerality invariants. The remaining 45 tasks stay open; this is
  not a claim that the
  full retrieval or storage program is complete.
- `ChunkRetrievalProfileV2` and `FileRetrievalProfileV1` contract tests: proven
  (`11/11` focused tests);
- selected execution readback: blocked because feature observations do not
  carry a qualified workspace revision;
- observation feature plan authority: blocked (`0` exact source-revision
  matches against the selected execution);
- feature-row apply: fail-closed unless a bounded limit, admitted workspace
  revision, and non-placeholder source revisions are supplied;
- file and directory aggregation: not admitted until live chunk readback and
  replay pass.

Read-only checks:

```powershell
npm run atlas:observation:plan:authority
node scripts/atlas/audit-chunk-retrieval-profile-live-readback-v1.mjs --limit=16
```

These checks do not backfill revisions or mutate any store.

## Next gated work — 2026-09-12

The next work is evidence collection, not cleanup or rebuild:

1. Complete `STORAGE-REVIEW-02` by reconciling image IDs against active
   containers, Compose references, Dockerfile stage ancestry, and the WSL2
   RAPIDS/PyTorch census.
2. Complete `STORAGE-REVIEW-03` by classifying every Qdrant snapshot with
   collection, checksum/revision, generation time, consumer references, and
   rollback value. Preserve every artifact.
3. Continue the retrieval spine with live chunk-profile readback and replay;
   file and directory aggregation remain blocked until qualified feature
   revisions are present.
4. Do not authorize image removal, snapshot removal, Docker rebuilds, VHDX
   compaction, Qdrant repair, or projection promotion from this ledger.

The current read-only checks are:

```powershell
npm run atlas:docker:storage:retention:audit
npm run atlas:qdrant:collection-roles:audit
node scripts/atlas/audit-chunk-retrieval-profile-live-readback-v1.mjs --limit=16
```

Each check must retain `writesPerformed=false`; any cleanup requires a later
change naming exact targets and recording rollback/consumer evidence.

The role audit also checks runtime ownership against the declared storage
contract. The declared projection owner and central runtime lane now both use
`codebase_chunks_768`, but active callers still reference
`codebase_chunks_768_v2`. This remains an explicit migration gate; the audit
fails closed with `ACTIVE_COMPETING_768_CONSUMER_REFERENCES` instead of
silently treating all callers as aligned. Its receipt also records the exact
runtime caller classifications, separating active candidates from legacy,
advisory, test, and ambiguous multi-collection references.

## SEARCH-REINTEGRATION-05 receipt + trace MCP note (2026-09-20)

- [x] Receipt exists: `docs/reports/mcp-current-code-reconciliation-v1.json` (generator `scripts/atlas/audit-mcp-current-code-reconciliation-v1.mjs`, read-only). Status `CURRENT_CODE_RECONCILED_HISTORICAL_MISMATCHES_CLASSIFIED`; `runtimeEnablementChanged=false`, `canonicalAuthorityChanged=false`, `writesPerformed=false`, `promotionAuthorized=false` (satisfies -06 semantics). Next gate named by the receipt: `SEARCH-REINTEGRATION-06_NON_AUTHORIZING_AUDIT_SEMANTICS`.
- Current code: 164 `registerTool` declarations / 163 unique names under `sveltekit-frontend/src/mcp`; 9 search tools audited (7 `OPTIONAL_OR_DISABLED`, 2 `NOT_IN_CURRENT_RECEIPT_SCOPE`); ontology-unknown tools 63 historical vs 51 current.
- [x] SEARCH-REINTEGRATION-05a **Duplicate owner classified, no removal performed:** `context.prefetch_feature_context` is registered in both `src/mcp/new_tools.ts` and `src/mcp/trace-mcp-server.ts` in the same runtime registry. Read-only receipt `docs/reports/mcp-prefetch-duplicate-owner-v1.json` classifies `new_tools.ts` as the shared-owner candidate because it uses the typed dispatcher and `buildFeaturePrefetchContext`; the inline TRACE bridge remains a legacy duplicate candidate. Removal/aliasing is deferred until a compatibility/readback test exists. No runtime behavior changed.
- [ ] TRACE-MCP-JSONRPC-01 Trace MCP JSON-RPC 2.0 work is governed by `DEFER-TRACE-MCP-01` above (no new trace-tool surface until retrieval profile/ranking/pagination ownership closes). `parent-atlas-rpc-packet-registry-fabric` is 27/27 complete, so no open RPC tasks exist there; JSON-RPC framing itself is handled by the MCP SDK transport. Any protocol change must be recorded here first.
- Related (not this change): workboard challenger tournament status is recorded under `RECOMMENDATION-TOURNAMENT-01` in `parent-atlas-retrieval-lineage-dag-convergence/tasks.md`.

## Search-fabric contract tranche — 2026-09-21

These tasks extend the existing `search-contract.ts` and `SearchRuntime` owners. They do
not create a second retrieval runtime, semantic lane, candidate identity owner, or cache
registry. Canonical source/vector promotion remains blocked until
`CURRENT_SOURCE_AUTHORITY_PROVEN`.

- [x] **SEARCH-FABRIC-01 — Freeze `QueryPlanV1`.** `QueryUnderstandingV1` provides
  deterministic exact/identifier/path/symbol/FTS/trigram hints, while `QueryPlanV1Schema`
  and `buildQueryPlanV1()` freeze the normalized request, lane selection, bounded limits,
  keyword bundle, semantic representation, optional workspace frame, and deterministic
  SHA-256 `planChecksum`.
  The plan is explicitly non-authoritative (`canonicalAuthority=false`,
  `writesPerformed=false`, `promotionAuthorized=false`). Proof:
  `docs/reports/search-fabric-contract-proof-v1.json`.
- [x] **SEARCH-FABRIC-02 — Deterministic `KeywordBundleV1`.** The existing keyword
  decomposition owner now emits the versioned `atlas.keyword-bundle.v1` envelope; replay
  is deterministic and remains query-planning evidence only.
- [ ] **SEARCH-FABRIC-03 — PostgreSQL FTS + `pg_trgm` executor proof.** Reuse the existing
  PostgreSQL FTS owner and prove bounded read-only execution plus trigram capability; do
  not create a second lexical lane.
- [ ] **SEARCH-FABRIC-04/05/06 — pgvector exact oracle, HNSW parity, and filtered iterative
  scan.** Keep blocked when no revision-qualified eligible corpus exists; no backfill is
  authorized by this tranche.
- [ ] **SEARCH-FABRIC-07 — One semantic-lane executor contract.** Reconcile
  `SearchRuntime`, Go Retrieval, pgvector, Qdrant, and optional GPU executors so they emit
  one logical `semantic_768` vote.
- [ ] **SEARCH-FABRIC-08/09 — CandidateOrdinal join and production FeatureMatrix.** Reuse
  the existing `CandidateOrdinalMapV1`/`CandidateFeatureMatrixV1` owners; promotion remains
  downstream of source, symbol, and ontology authority.
- [ ] **CACHE-FABRIC-01/04, DAG-CONTEXT-01/02, STUDIO-SEARCH-01/02.** Reconcile existing
  revision-qualified ACE/BitFrost, ContextManifest, DAG, and SSR diagnostics owners after
  the executor proofs; no live cache warming or ACE admission is implied here.

### Search-fabric proof refresh — 2026-09-21

- `docs/reports/rf6-semantic-vote-proof-v1.json`: bounded semantic-lane vote proof passed
  (`9/9`); this proves one logical vote in the tested fusion contract, not full live caller
  adoption.
- `docs/reports/rf6-executor-lane-owner-v1.json`: source-trace lane-owner proof passed
  (`11/11`); production caller convergence remains open.
- `docs/reports/postgres-pgvector-exact-hnsw-replay-v1.json`: read-only replay failed closed
  with `revisionQualifiedVectorRows=0` and
  `CANONICAL_SOURCE_REVISION_MISSING_FOR_PGVECTOR_COHORT`; no parity or backfill was claimed.
- The PostgreSQL capability audit was refused by the resource guard at `freeMemoryGiB=2.61`
  against the `4 GiB` minimum. This is an execution-safety refusal, not a capability result.
- Candidate snapshot/feature-coordinate focused tests passed `13/13`; this remains fixture
  proof and does not promote a production candidate population.
- `docs/reports/postgres-index-capability-v1.json`: direct one-shot read-only audit completed
  after the resource guard refused the guarded invocation. PostgreSQL `18.4`, `io_method=worker`,
  `effective_io_concurrency=16`, `pg_trgm=1.6`, and `vector=0.8.3` were observed. Plans were
  captured for all four bounded fixtures; bitmap plans were generatable for `4/4`, selected by
  the planner for `2/4`, and no `BitmapAnd` was observed. Missing live index capabilities remain
  `atlas_symbol_versions.source_revision` and `qualified_name`; no migration was created or
  applied. HNSW capability and iterative-scan support were observed, but parity remains
  unproven because the revision-qualified vector cohort is empty.
- `docs/reports/postgres-symbol-resolver-index-plan-v1.json`: read-only resolver index
  plan completed. Live `atlas_symbol_versions` has 479 estimated rows, seven existing
  indexes, and an existing `(source_ref, source_revision)` index. Production-shaped
  exact predicates for `source_revision`, `qualified_name`, and their combination all
  chose sequential scans on this small table; no index migration is justified by the
  current bounded workload. Standalone and composite `CREATE INDEX CONCURRENTLY`
  candidates are recorded for a future call-site/scale proof, but none was created or
  applied. Legacy revision values remain query-level eligibility concerns and were not
  hidden with a partial index.
- `docs/reports/postgres-fts-replay-v1.json`: existing FTS owner replayed read-only for
  `Graphify retrieval`. It found `2,423` unqualified lexical hits but `0` revision-qualified
  hits and therefore correctly returned `POSTGRES_FTS_BLOCKED_SOURCE_REVISION`; GIN-index
  evidence is also unavailable through the current function path. No FTS task checkbox is
  closed: lexical execution is wired, but canonical promotion remains blocked by source
  authority and index evidence.

- **Go Retrieval FTS identity envelope — wired, fail-closed (2026-09-21):**
  `services/go-retrieval-service/httpSearchBM25` now returns the canonical
  `codebase_chunk_index` candidate id, content hash, workspace/source revisions,
  representation revision, and lineage receipt fields when present. Each result and
  the response expose `identity_status`; missing revision data remains
  `REVIEW_REQUIRED` rather than being inferred from paths, Qdrant payloads, or packet
  keys. Focused Go tests cover qualified and incomplete rows. This does not repair the
  dense Qdrant lane: its sampled payloads still lack an exact canonical chunk bridge.

- **Go Retrieval dense identity hydration — partial, fail-closed (2026-09-21):**
  the live service now performs a bounded read-only join from the Qdrant projection id
  against `codebase_chunk_index.qdrant_id`, then joins only `PROVEN`
  `atlas_packet_chunk_lineage` rows and an exact current source binding. The earlier
  row-id fallback was removed. The adapter classifies missing/ambiguous lineage and
  revision failures explicitly, never filling packet keys from projection payloads.
  Coverage receipt `docs/reports/go-retrieval-dense-lineage-v1.json` proves the adapter
  is reachable but reports `fully_qualified_rows=0`; live data admission remains blocked.

### LDR / documentation retrieval boundary tranche — 2026-09-21

- Added `docker/langgraph-synthesis/research_contracts.py` with typed Pydantic
  `WebSearchResultV1`, `WebSearchEnvelopeV1`, and `ParameterArtifactV1` contracts.
  The existing LangGraph synthesis `web_search` owner now validates and bounds
  SearXNG/DuckDuckGo results before they enter DAG state; no second research agent,
  search lane, or canonical writer was introduced.
- Added `docker/langgraph-synthesis/test_research_contracts.py`; focused contract
  tests pass `2/2`. This proves typed non-authoritative evidence and DAG parameter
  envelopes only. It does not prove Learning Circuit runtime parity, document
  persistence, or source promotion.
- Existing BeautifulSoup normalization/chunking remains the document extraction
  owner in `python/atlas_external_docs.py`. PostgreSQL 18/AIO/bitmap indexing and
  `semantic_768` streaming remain downstream read-only tasks until a revision-
  qualified document cohort exists.
- `scripts/atlas/prove-research-document-retrieval-v2.mjs` now provides the bounded
  v2 end-to-end validation command (`npm run atlas:docs:research-retrieval:v2`). It
  checks the existing owners, JavaScript syntax, Pydantic contracts, synthetic
  BeautifulSoup/chunk UTF-8 spans, the live synthesis-container web-search smoke,
  and captures existing FTS/pgvector/DAG report status. Receipt:
  `docs/reports/research-document-retrieval-v2.json`.
- **V2 fixture: PROVEN, noncanonical; live typed runtime: OPEN.** The receipt
  reports `RESEARCH_DOCUMENT_RETRIEVAL_V2_REVIEW_REQUIRED`: the Pydantic and
  BeautifulSoup/chunk fixture passes, but the running `legal-ai-langgraph` image
  is a legacy image without `research_contracts.py`, so its blank-query smoke is
  health-only. Rebuild/redeploy is required before claiming the typed v2 path is
  live. The receipt still records `writesPerformed=false`,
  `promotionAuthorized=false`, and no remote document fetch, vector backfill,
  cache warm, or Graphify refresh. FTS and pgvector remain blocked where
  revision-qualified rows are absent.
- MCP parameter audit is now included in the same v2 receipt. The standalone LDR
  owner passed its existing stdio `initialize`/`tools/list` health probe with four
  tools: `ldr.start_research`, `ldr.poll_status`, `ldr.search_history`, and
  `ldr.quick_summary`. Their bounded parameters are recorded exactly as
  `query`, `max_iterations`, `search_engines`, `taskId`, `limit`, and
  `max_results`. The Streamable TRACE registration separately exposes
  `ldr_research` with `query`, `maxResults`, `maxDocs`, and `temperature`.
  These are two existing transport surfaces over the LDR boundary, not new
  retrieval owners; no `tools/call`, document ingestion, or canonical write was
  performed.

### Remaining search/cache/DAG/Studio tasks mapped to existing owners — 2026-09-20 (docs only)

Added after the operator pasted a full search-fabric design. Verified by repo grep that most of its
contracts already exist (`QueryPlanV1`/`KeywordBundleV1`/`QueryUnderstandingV1` in
`retrieval/search-contract.ts`; `ResidencyHintV1` in `packages/parent-atlas-retrieval/src/bifrost/residency-scheduler.ts`;
`candidateOrdinalMapV1Schema` in `atlas/features/*`; `CandidateFeatureMatrixV1` in
`retrieval/retrieval-candidate-feature-matrix-v1.ts`; two pgvector exact/HNSW replay scripts). Only four
contract NAMES from the design have no code: `ContextCacheIdentityV1`, `QueryExpansionPacketV1`,
`PgVectorExecutorParityV1`, `AceRetrievalPacketV1`. Each must be built as an extension of an existing owner
(`AceBitfrostCacheIdentityV1` / `PacketSemanticCacheIdentityV2` for cache identity), never as a new registry.
BLOCKER for SEARCH-FABRIC-04/05/06: the authoritative `semantic_768` column is undecided (see
`parent-atlas-retrieval-staging-planes` DIM-06/07/08; the two 768 columns are different embedding recipes and the
Qdrant v2 mirror matches neither). No canonical vector promotion until that and `CURRENT_SOURCE_AUTHORITY_PROVEN`.

- [ ] **SEARCH-FABRIC-05 — pgvector HNSW parity vs exact oracle.** Reuse ONE of the two existing scripts
  (`scripts/atlas/prove-postgres-pgvector-exact-hnsw-replay-v1.mjs`, `scripts/atlas/replay-pgvector-semantic-768-exact-hnsw-v1.mjs`);
  first record which is the owner and classify the other (COMPATIBILITY/duplicate). Emit one frozen-corpus receipt
  (`PgVectorExecutorParityV1`: corpus/query-set checksums, workspace + representation revision, recall@10/50, MRR, p50/p95,
  `ef_search`, IVFFlat `probes` as an optional challenger). Blocked on DIM-08.
- [ ] **SEARCH-FABRIC-06 — Filtered HNSW iterative-scan proof.** pgvector 0.8.3 is installed (2026-09-04 audit) and supports iterative
  scans; benchmark filtered queries (`domain_class` btree + `tags` GIN) with `EXPLAIN (ANALYZE, BUFFERS)`, treating the observed
  no-BitmapAnd plan as a benchmark fixture, not a schema change. AIO is an executor detail, not a retrieval feature.
- [ ] **SEARCH-FABRIC-09 — Production `CandidateFeatureMatrixV1`.** Existing owner `retrieval/retrieval-candidate-feature-matrix-v1.ts`; prove it
  from a frozen `CandidateOrdinalMapV1` with matching checksums. Ordinals are never canonical identity.
- [ ] **CACHE-FABRIC-02 — Centroid/SOM `ResidencyHintV1`.** Existing owner `bifrost/residency-scheduler.ts`. Routing only: centroid/SOM cell/cluster/
  temperature never become packet identity; SOM revision provenance is still unsupplied (`SOM_REVISION_PROVENANCE_01`).
- [ ] **CACHE-FABRIC-03 — BitFrost semantic prefetch.** Depends on CACHE-FABRIC-02; measure against next-query reuse and a graph-neighbor/LRU baseline;
  cache holds pointers/state, not source facts.
- [ ] **CACHE-FABRIC-04 — Immutable ACE packet caching by checksum.** Route through `AceBitfrostCacheIdentityV1` (see DIM-04/ACEPKT-02 in
  `parent-atlas-retrieval-staging-planes`: the TRACE `ace:packet:*` store is not revision-qualified and is blocked on honest revision inputs).
- [ ] **DAG-CONTEXT-01 — Pass ACE packet refs between DAG stages.** Stages exchange packet id + checksum, not raw result payloads; reuse the existing
  `ContextManifest` (`ace/context-compiler.parent-atlas.ts`).
- [ ] **DAG-CONTEXT-02 — Cached `ContextManifest` synthesis.** Cache key includes retrieval-policy, model and prompt-template revisions plus the evidence
  checksum; `canonicalAuthority:false`.
- [ ] **STUDIO-SEARCH-01 — SSR retrieval-fabric diagnostics page.** Extend the existing Studio/command-center retrieval pages; server-side owners
  supply state (query plan, lane on/off, semantic executor, cache hit/tier, timings); the browser holds no canonical state.
- [ ] **STUDIO-SEARCH-02 — Cache token-savings metrics.** Report measured tokens avoided from real hits only; no synthetic estimates.
- [ ] **QUERY-EXPANSION-01 — Bounded Ornith expansion only when needed.** Deterministic `KeywordBundleV1` first; call Ornith only on low retrieval
  confidence; cache the result (`QueryExpansionPacketV1`) keyed by normalized query hash + workspace/taxonomy/model/prompt revisions.
- [ ] CANONICAL-IDENTITY-V1 POINTER (2026-09-21): canonical object identity (symbol/file/chunk discriminants, mandatory workspaceRevision + sourceRevision, no 'unknown'/latest-row inference, representation/execution/transport ids and CandidateOrdinal are NOT canonical identity) is owned by `CANONICAL-IDENTITY-V1-SPEC-01` in `openspec/changes/parent-atlas-retrieval-lineage-dag-convergence/tasks.md`. This change SHALL reference that contract and not define its own identity rules; it may add representation-, execution-, feature-, cache-, transport- or projection-specific identities only. Pointer only; no scope change here. Spec status: SPEC_DRAFT (not signed off).
