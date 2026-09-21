# Candidate Feature Execution Fabric — live feature join addendum (2026-09-20)

This addendum is append-only temporal evidence for the existing
`parent-atlas-candidate-feature-execution-fabric` change. It does not rewrite
the earlier fixture proofs or declare the full live producer join complete.

## FEAT-LIVE-01 / FEAT-MATRIX-02 bounded implementation

- [x] **FEAT-LIVE-01-READONLY-CONTRACT** — added
  `search-runtime-live-feature-join-v1.ts`. The compiler accepts only a
  SearchRuntime response whose provenance explicitly reports `readOnly=true`.
  It performs no store, cache, graph, vector, model, or filesystem I/O.
- [x] **FEAT-LIVE-01-LINEAGE-JOIN** — the compiler binds SearchRuntime packet
  evidence to existing `ChunkRetrievalProfileV2` rows and rejects packet,
  source, workspace, source-revision, graph-revision, semantic-revision, and
  feature-revision mismatches instead of synthesizing lineage.
- [x] **FEAT-LIVE-01-IDENTITY** — canonical identity is resolved only through
  the shared `resolveCanonicalIdentityV2` owner. Qdrant IDs, runtime chunk
  ordinals, and other executor-local IDs cannot become canonical identity.
- [x] **FEAT-MATRIX-02-EXISTING-OWNERS** — admitted rows flow through the
  existing `buildSearchRuntimeQasRows()` matrix owner, then
  `materializeCandidateFeatureSnapshotFromQasRowsV1()`, then
  `materializeCandidateFeatureColumnar()`. No second CandidateOrdinal,
  feature snapshot, or physical matrix owner was added.
- [x] **FEAT-MATRIX-02-FAIL-CLOSED** — `retrieval_frequency`,
  `execution_utility`, and `process_fit` are accepted only through an
  explicit revision-qualified supplement with producer revisions and evidence
  references. Missing values block admission; they are not derived from packet
  text/task metadata and are not zero-filled.
- [x] **FEAT-MATRIX-02-REVISION-REPORT** — the result carries per-candidate
  workspace/source/graph/feature/representation availability plus the three
  supplement producer revisions. Any rejected candidate blocks whole-snapshot
  materialization so candidate membership cannot silently shrink.
- [x] **FEAT-MATRIX-02-FOCUSED-SPECS-ADDED** — focused tests cover admitted,
  missing-supplement, non-read-only, and missing-query-feature paths.
  **Execution is not claimed in this GitHub-only pass.**

## Temporal correction to the 2026-09-04 owner audit

The older `ace-feature-source-owner-live-proof-v1.mts` report recorded that a
real `SearchRuntime.search()` call could not be used by a zero-write canary
because promotion/exposure side effects were unconditional at that time.

That finding is now historical. The later
`scripts/atlas/prove-search-runtime-readonly-boundary-v1.mjs` added and
live-proved `createProductionSearchRuntime({ readOnly: true })`: real
production retrieval can execute with promotion/exposure writes disabled and
with `provenance.readOnly=true`.

This addendum therefore treats the read-only SearchRuntime request as available
infrastructure rather than preserving the stale blocker.

## Still blocked / not claimed

- [ ] **LIVE-FEATURE-JOIN-01-LIVE-PRODUCER-JOIN** remains open. The new
  compiler is the missing composition/admission boundary, but this pass does
  not prove a corpus-scale live producer for every required matrix feature.
- [ ] **EXECUTION-UTILITY-LIVE-OWNER** remains open until real
  `atlas_execution_utility` traffic/readback (or another already-authorized
  owner) supplies revision-qualified per-packet values.
- [ ] **PROCESS-FIT-LIVE-OWNER** remains open until a real existing producer is
  bound; no text/task heuristic is authorized.
- [ ] **RETRIEVAL-FREQUENCY-LIVE-OWNER** remains open until an existing
  hotness/usage owner is bound at the same packet/revision grain.
- [ ] **LIVE-CANARY** still needs one real
  `createProductionSearchRuntime({readOnly:true})` request plus real
  `ChunkRetrievalProfileV2` and supplement readbacks. Expected behavior is
  typed `BLOCKED` wherever those owners are absent.
- [ ] **ARROW/ArtifactAddress emission** is deliberately not performed by this
  pure compiler. The existing columnar result carries deterministic checksums;
  immutable Arrow/ArtifactAddress materialization remains owned by the existing
  candidate-feature Arrow writer/readback path and must not be duplicated here.

## Safety / ownership invariants

- PostgreSQL writes: **false**
- Qdrant writes: **false**
- Valkey writes: **false**
- Neo4j writes: **false**
- Graphify execution: **false**
- ranking / recipe promotion: **false**
- canonical authority granted: **false**
- missing evidence policy: **typed fail-closed**
- semantic lane: existing `semantic_768`; no additional retrieval vote
