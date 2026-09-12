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

## Deferred/non-blocking search-tool reintegration audit

Historical MCP audit evidence is useful input, not current enablement authority.
The 2026-08-22 audit recorded handler/list mismatches, duplicate names,
ontology-unknown tools, `atlas.search`/patch stubs, and a quarantined randomized
reranker. A fresh current audit is required before any reintegration.

Further TRACE-MCP expansion, the historical HMM/Vibreti-style repair challenger,
and query-NLP-sidecar endpoint expansion are **DEFERRED_NON_BLOCKING** while the
core retrieval logic below is incomplete. Existing proven TRACE-MCP evidence is
retained. `Vibreti` is not treated as a current implementation or owner.

- [ ] **SEARCH-REINTEGRATION-01 — Inventory disabled/deprecated/quarantined search tools read-only.**
  Enumerate the current tool registry, actual handler, list exposure, callers,
  ontology registration, runtime owner, input/output contracts, and canonical
  identity/revision requirements for every search-related tool. Emit a receipt;
  do not enable or disable anything.
- [ ] **SEARCH-REINTEGRATION-02 — Classify each audited tool.** Assign exactly
  one disposition: `RESTORE`, `ADAPTER_ONLY`, `SUPERSEDED`, `KEEP_DISABLED`, or
  `REMOVE_AFTER_CALLER_ZERO`. A historical count is not sufficient evidence for
  a current disposition.
- [ ] **SEARCH-REINTEGRATION-03 — Require reintegration preconditions.** A tool
  may move toward `RESTORE` only after deterministic tests, canonical identity
  and revision propagation, one SearchRuntime ownership boundary, lane/executor
  semantics, caller migration evidence, and quality evaluation exist.
- [ ] **SEARCH-REINTEGRATION-04 — Keep nondeterministic/stubbed search surfaces disabled.**
  The randomized reranker and `atlas.search`/patch stubs remain disabled until
  deterministic implementation, caller proof, and QRELS evaluation exist.
- [ ] **SEARCH-REINTEGRATION-05 — Reconcile historical MCP mismatches against current code.**
  Re-audit the previously reported handler/list mismatches, duplicate names,
  and ontology-unknown tools. Do not blindly carry old counts forward.
- [ ] **SEARCH-REINTEGRATION-06 — Preserve non-authorizing audit semantics.**
  Receipt must state `runtimeEnablementChanged=false`, `writesPerformed=false`,
  and `canonicalAuthorityChanged=false`.

### Explicitly parked surfaces

- [ ] **DEFER-TRACE-MCP-01 — Park further TRACE-MCP expansion.** Existing trace
  and provenance receipts remain evidence; do not add more trace-tool surface
  until retrieval profile/ranking/pagination ownership below is closed.
- [ ] **DEFER-VIBRETI-01 — Keep HMM/Vibreti-style repair challenger-only.** No
  current repository implementation is admitted. Do not introduce routing or
  ranking authority from the historical note.
- [ ] **DEFER-QUERY-NLP-01 — Freeze query-sidecar expansion.** Consume existing
  grounded query/chunk features where useful, but do not add new query NLP
  endpoints in this change. The sidecar remains a feature/evidence producer,
  never an identity, search-runtime, or Qdrant writer.

## Active retrieval logic convergence

### Hard ownership invariants

- [ ] **RETRIEVAL-OWNERSHIP-01 — Enforce one canonical document identity.**
  PostgreSQL packet/chunk/source/workspace lineage remains canonical. Derived
  algorithms may not mint a replacement document identity.
- [ ] **RETRIEVAL-OWNERSHIP-02 — Enforce one semantic logical lane.**
  `semantic_768` is one evidence lane. Qdrant HNSW, PostgreSQL exact pgvector,
  cuVS exact, CAGRA, and TurboVec are executors/challengers over that lane and
  must not receive independent RRF votes solely because execution differs.
- [ ] **RETRIEVAL-OWNERSHIP-03 — Keep candidate sets ephemeral.** KNN and Top-K
  are query operations. Do not create persistent `knn*`, `topk*`, KMeans, SOM,
  or PageRank collections to store transient candidate universes.
- [ ] **RETRIEVAL-OWNERSHIP-04 — No collection/storage promotion in this change.**
  Do not create a new Qdrant collection, delete a legacy collection/named
  vector, add an ANN index, or promote a representation without separate
  lineage + caller + QRELS evidence.

### Shared retrieval profile contracts

- [ ] **RETRIEVAL-PROFILE-01 — Freeze `ChunkRetrievalProfileV1`.** Define one
  revision-qualified contract that normalizes existing surfaces without adding
  a competing database. Required identity fields:
  `canonicalChunkId`, `packetKey`, `repositoryId`,
  `repositoryRelativePath`, `sourceRef`, `workspaceRevision`, `sourceRevision`.
  Feature groups must be explicit and optional-by-presence rather than
  fabricated: lexical/structural, semantic, topic/domain, topology, ontology,
  and feature/model revisions.
- [ ] **RETRIEVAL-PROFILE-02 — Build a read-only profile adapter.** Hydrate the
  contract from existing canonical chunk/packet joins plus current AST,
  semantic, topology, classifier, and ontology surfaces. Emit presence masks,
  evidence refs, and revision provenance. Missing features remain missing.
- [ ] **RETRIEVAL-PROFILE-03 — Prove deterministic profile identity.** Same
  canonical chunk + same referenced revisions must produce the same profile
  checksum independent of executor or retrieval order.

### File and directory aggregation

- [ ] **FILE-PROFILE-01 — Freeze `FileProfileV1`.** Aggregate only from
  canonical chunk identities belonging to one revision-qualified source file.
  Preserve chunk membership checksum and source revision; do not infer file
  identity from directory names, Qdrant IDs, or array position.
- [ ] **DIRECTORY-PROFILE-01 — Freeze `DirectoryProfileV1`.** Directory identity
  must be deterministic from repository identity + normalized path + workspace
  revision (UUIDv5 or equivalently deterministic content-addressed scheme).
  Include bounded aggregates such as file/chunk counts, keywords, domains,
  concept IDs, import counts, graph communities/PageRank summaries, and
  KMeans/SOM histograms.
- [ ] **DIRECTORY-PROFILE-02 — Keep directory evidence a weak prior.** Directory
  or domain metadata may adjust ranking but may not form an independent voting
  lane and may not outrank exact symbol/identifier evidence solely by path.
- [ ] **DIRECTORY-PROFILE-03 — Prove the aggregate corpus against the sealed snapshot.**
  Count files/directories from the materialized admitted snapshot, preserve
  repository qualification for nested repositories, and reject excluded
  `.git`, `.tmp`, generated, oversized, or non-source artifacts rather than
  silently adding them.

### Semantic representation normalization

- [ ] **RETRIEVAL-TEXT-01 — Freeze `retrieval_text_v1`.** Build one revisioned
  semantic text representation from bounded fields such as path, symbol, kind,
  grounded summary, keywords, concepts, structural relations, and bounded
  source text. Record template revision and checksum.
- [ ] **RETRIEVAL-TEXT-02 — Produce `semantic_768` from `retrieval_text_v1` in shadow.**
  Preserve EmbeddingGemma model/representation revision and source evidence;
  do not overwrite current vectors.
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

- [ ] **CANDIDATE-MANIFEST-01 — Freeze `CandidateManifestV1`.** Required fields:
  `requestId`, `workspaceRevision`, `candidateSetChecksum`, `rankingRevision`,
  and ordered canonical candidate IDs. This manifest freezes the ranked
  universe used by pagination and ContextManifest handoff.
- [ ] **CANDIDATE-MANIFEST-02 — Keep manifest residency ephemeral.** ACE/Valkey
  may cache the manifest, candidate IDs, scores, and checksums with bounded TTL;
  PostgreSQL/Qdrant do not need a persistent Top-K table for it.
- [ ] **RANK-FEATURES-01 — Map normalized profiles into the existing CandidateFeatureMatrix.**
  Preserve feature presence masks, feature revision, executor provenance, and
  canonical identity. Do not create a second feature-matrix owner.
- [ ] **RANK-BASELINE-01 — Implement/evaluate one deterministic grouped baseline.**
  Initial evaluation grouping may begin around semantic 50%, lexical 20%,
  structural 15%, ontology/graph 10%, and directory/domain/topology prior 5%.
  These are experiment weights, not promotion thresholds or immutable policy.
- [ ] **RANK-BASELINE-02 — Keep semantic executor parity out of evidence weighting.**
  Qdrant vs pgvector vs cuVS vs CAGRA execution differences become provenance,
  latency, recall, and parity metrics; they do not multiply semantic evidence.
- [ ] **RANK-PYTORCH-01 — Add/retain PyTorch/ATen learned ranker only as shadow challenger.**
  Consume the same CandidateFeatureMatrix and compare against the deterministic
  baseline. Promotion remains blocked by existing revision-qualified QRELS.
- [ ] **FILE-DIRECTORY-AGG-01 — Aggregate after chunk-level scoring.** Produce
  file/directory result views from the ranked canonical chunk universe without
  replacing chunk-level identity or allowing directory priors to dominate
  exact evidence.

### Stable pagination and runtime adoption

- [ ] **PAGINATION-01 — Implement stable cursor pagination after reranking.**
  Cursor must bind `candidateSetChecksum`, last score/order coordinate, and
  `lastCanonicalChunkId`. Do not use mutable OFFSET pagination across a ranking
  universe that can change between pages.
- [ ] **PAGINATION-02 — Prove page replay.** Page 2+ must resolve against the
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
