# Parent Atlas Topology Representation Admission — Tasks

## Current alignment checkpoint (2026-08-28)

- `semantic_768 -> exact retrieval -> ContextManifestV1` is
  `PROVEN_CANARY` on 15 exact lineage-qualified candidates and is independent
  of this topology change.
- Full source namespace reconciliation is still blocked: the current audit
  found zero exact manifest/projection matches. Do not use topology artifacts
  to repair source identity.
- `CandidateOrdinalMapV1` is proven only for the 15-row canary. Global 128/768
  scaling remains blocked on exact lineage and semantic projection parity.
- The higher-hop audit table error is fixed and live read-only coverage is
  partial: SOM 49/50, Qdrant 100/100 sampled, Valkey 50/50, Neo4j 17/50,
  glyph records 0/50.
- No topology representation, SOM, CouchDB, Qdrant fan-out, or GPU topology
  write is authorized by the canary receipt.
- Representation audit remains `NOT_PROVEN` for source-version and ledger
  identity; the current three-row check found vectors but packet
  `representation_revision = 0` for all rows.
- SOM identity is only `2,665/32,310` matched (`8.25%`). Qdrant fan-out has
  `0` valid revisioned chunk groups and `0` chunk ordinals in the audited
  projection.
- The bounded 15-row latent audit found all packet rows but classified all 15
  as `LEGACY_LATENT_IDENTITY_UNPROVEN`; latent routing remains disabled until
  producer/input/revision lineage is proven.
- The current latent writer (`scripts/atlas/backfill-latent-vectors.mjs`)
  serializes `latent_64` as FP32 `bytea`, but its write path can fall back
  across Qdrant point ID, `packet_key`, and
  `source_ref`, and records only a numeric model epoch as
  `representationRevision`. It does not require a current semantic artifact,
  `CandidateOrdinalMapV1`, or exact workspace/source revisions before update.
  Treat existing latent rows as diagnostic until that producer contract is
  repaired and independently read back.
- The static producer audit reports `PRODUCER_CONTRACT_INCOMPLETE`; the
  missing fields are semantic input binding, model/parameter digest, producer
  revision, candidate snapshot, ordinal checksum, and required workspace/source
  revisions.
- PostgreSQL/pgvector/Qdrant ordering correction (2026-10-02): no current
  corpus `latent_64` calculation, latent-dimension backfill, or topology write
  has been proven or authorized. First reconcile source/workspace lineage and
  refresh a checksum-valid `CandidateOrdinalMapV1`; then prove exact
  PostgreSQL `semantic_768` row identity, 768-D vector readback, and eligibility
  bitmap parity. Next prove Qdrant `content` projection identity and vector
  readback parity against those exact PostgreSQL rows. Only after both stores
  pass may a bounded, revision-qualified 4D topology-coordinate canary be
  computed and independently read back. Revisit latent dimensions and any
  `latent_64` computation only after that 4D coordinate result. Existing 4D
  schemas and hash-index fixtures are not live coordinate-population proof.
- Read-only canary recheck (2026-10-02): the older 15-candidate numerical
  PostgreSQL/Qdrant report still replays as 15/15 vector, score, and rank
  matches, but it does not validate the CandidateOrdinalMap checksum or the
  current canonical workspace-source binding. The new fail-closed auditor
  rejects that map: its declared ordinal checksum does not match the existing
  `CandidateOrdinalMapV1` verifier. Independent read-only inspection found
  15/15 exact eligible 768-D vector rows and 15/15 exact packet/chunk lineage
  rows, but 0/15 workspace/source bindings for the map's old workspace
  revision. Qdrant returned 30 exact-payload points for the 15 packet keys
  (two per ordinal); this is not exact eligibility parity. No bitmap was
  admitted, and no PostgreSQL/Qdrant writes occurred. Local diagnostic:
  `.tmp/atlas/topology-pg-qdrant-eligibility-recheck-20261002.json`. The
  numerical-only replay is .tmp/atlas/lineage-pgvector-qdrant-parity-recheck-20261002.json`.
- Map refresh attempt (2026-10-02): the existing read-only materializer, run
  against the latest recorded source-binding revision, returned
  `CANARY_EXACT_LINEAGE_COHORT_EMPTY`. Although all 15 canary source/hash pairs
  have source-binding rows at that revision, `graphify_files.workspace_revision`
  has no exact common workspace revision with `atlas_workspace_source_bindings`;
  combining their source revisions under a made-up workspace revision would
  fabricate lineage. No candidate map was emitted. Reconcile these existing
  source owners before retrying PostgreSQL/Qdrant parity.
- Current lineage correction (2026-10-02): the Python AE candidate definition
  learns `latent_256` then `latent_128`; `latent_64` is a normalized prefix of
  `latent_128`. It has no trained/promoted checkpoint. Historical persisted v3
  artifacts instead use a 256-D bottleneck with 128/64 prefix views, as still
  described by the vector manifest and legacy receipts. The TypeScript chain
  tests the candidate definition only; it does not admit historical rows or
  prove producer parity. Shared `latent_*` names require representation and
  producer revision reconciliation before candidate output is admitted.
  Reuse existing `semantic_mrl_*` IDs rather than adding bare `mrl_*` aliases.
  MRL, AE, KMeans/SOM assignments, topology coordinates, and ACE residency
  remain distinct representation/state families.
  The existing AE artifact owner now rejects unknown/same-dimension MRL IDs and
  mismatched family labels; its regression tests freeze `latent_64` as a
  normalized prefix of `latent_128`. This closes only the AE-family validator
  slice, not the complete derivation DAG, historical/candidate reconciliation,
  or latent-writer lineage/readback gate.

- Representation-family correction (2026-10-02): the MRL vectors are semantic
  derivatives owned by the existing vector manifest; AE latents use the
  current persisted `latent_*` IDs; RFF/PCA are deterministic projections;
  KMeans/SOM are assignment artifacts; and 4D topology is a routing
  projection. These families are not one dimension ladder. `evidenceDepth`,
  ACE `residencyTier`, and model execution state remain separate owners.

- [x] TOPO-01 Freeze `RepresentationDerivationDagV1` with separate semantic
  MRL (`semantic_mrl_*` from the existing vector manifest), learned AE,
  deterministic projection, clustering, and topology artifact classes;
  residency is a separate axis, not a representation family.
  Required AE chain: `semantic_768 -> latent_256 ->
  latent_128 -> latent_64`, where the 256- and 128-dimensional stages are
  learned and 64 is the normalized prefix of 128. Keep current IDs; do not add
  MRL or `ae_latent_*` aliases. `scripts/atlas/representation-derivation-dag-v1.mts`
  compiles the graph from existing owners, keeps historical-v3 and untrained AE
  candidate lineages separate, and reports shared-ID conflicts as
  `LINEAGE_QUALIFICATION_REQUIRED`. Its focused tests cover family isolation,
  parent edges, deterministic checksum, and separate residency/model-state
  axes. KMeans assignment is explicitly `OWNER_NOT_FOUND`; no owner was
  invented. This freezes the cross-owner contract only; live registry parity
  and historical identity reconciliation remain in TOPO-01A.
- [x] TOPO-01A Read-only producer/registry/receipt reconciliation (2026-10-03);
  closes this reconciliation task only, not representation admission. A fresh
  static writer census finds 18 writer surfaces and selects no general
  `semantic_768` writer (`OWNER_NOT_PROVEN`):
  `docs/reports/semantic-768-writer-ownership-followup-20261003.json`. Live
  PostgreSQL has seven `atlas_representations` rows, all lifecycle `CANDIDATE`;
  the `latent_64` row's `STATIC_VERIFIED` metadata is not a computed tensor
  artifact or producer/readback receipt. `atlas_tensor_artifacts` currently
  has zero rows and `atlas_representation_validation_results` has zero receipt
  groups. The fresh read-only PG/Qdrant replay confirms the PostgreSQL bitmap
  matches its exact SQL oracle (15/15), while 31,891 Qdrant points yield zero
  exact ordinals: 31,819 omit `canonical_id`, 72 omit `source_revision`.
  Receipt: `docs/reports/atlas-topology-pg-qdrant-eligibility-20261003-r2.json`.
  No identity fallback, family inference, vector generation, or datastore write
  occurred. Canonical writer ownership, computed `latent_64`, representation
  artifact lineage, and PG/Qdrant parity remain unproven; keep TOPO-02A,
  TOPO-03A, TOPO-11, and TOPO-11A open.
- [x] TOPO-02 Read-only live audit compared latent fields, registry/schema,
  Qdrant, source/tree joins, BYTEA metadata, and representation records.
  The `atlas_representation_records` table is absent; this is distinct from
  the live `atlas_representations` registry. The 1,000-row sample had
  1,000/1,000 numeric latent values but 0 full-lineage proofs and no
  representation revisions, producer revisions, input digests, or parameter
  digests. Treat these observed rows as diagnostic-only. The sample is not a
  full-population count and does not authorize writes. Receipt:
  `docs/reports/latent-representation-identity-audit-2026-10-02.json`.
- [ ] TOPO-02A Replace the latent writer's fallback identity/update path with
  a revision-qualified producer contract: exact canonical chunk binding,
  current `semantic_768` input artifact, model/parameter digest, producer
  revision, candidate snapshot, ordinal checksum, and atomic readback. No
  Qdrant point ID, packet/source fallback, or numeric epoch alone may qualify
  a latent artifact for routing.
- [x] Add the typed `RepresentationArtifactV1` contract and focused tests;
  this defines the admission shape but does not make the existing writer
  promotion-safe.
- [x] Record the complete nested family in an unapplied registry draft:
  `sveltekit-frontend/drizzle/manual/20260903_nested_latent_representation_registry_v1.sql`.
  Historical registry-draft description treated `latent_128` and `latent_64`
  as prefix views of `latent_256`; that description is superseded by the
  2026-10-02 producer-lineage correction above. Do not apply or use the draft
  to infer current producer lineage. Current producer contract says 256 and
  128 are learned stages, then 64 is a normalized prefix of 128.
- [x] Add a read-only 15-row latent canary plan bound to the current ordinal
  map; it reports the required artifact fields and refuses to authorize apply.
- [x] Make the legacy latent writer fail closed on ordinary `--apply`; its
  diagnostic persistence now requires the explicit `--legacy-unsafe-apply`
  flag and remains outside promotion.
- [x] TOPO-03 Implement/read-prove `RepresentationArtifactV1` digests and
  revision bindings. `buildRepresentationArtifactV1` seals the descriptor with
  the shared canonical hash; the verifier detects tampering, and family binding
  checks parent revision/digest/population plus workspace/source/candidate parity.
- [ ] TOPO-03A Read-prove `latent_256` storage/index coverage and deterministic
  `latent_128`/`latent_64` derivation from the same parent artifact.
- [x] Read-only derivation sample confirms the nested projection numerically
  (`8/8` rows, CUDA, bounded error); this does not close representation
  admission because producer/input/revision lineage is still incomplete.
- [x] Read-only live coverage confirms `latent_256` is populated for `55,169`
  rows with its HNSW/checkpoint indexes, while `latent_128` has no stored
  column as designed. The base `atlas_representations` table exists; the
  nested-family draft is separate and its migration lineage is unresolved.
  The live legacy `latent_64` candidate row does not prove that nested
  `latent_64` was computed or admitted. Receipt:
  `docs/reports/latent-dimension-coverage-audit-2026-09-03.json`.
- [x] TOPO-03B Reconcile the legacy 64-D SOM autoencoder identity with the
  nested-autoencoder view. The existing vector manifest names the legacy
  active lane `topology_ae64_v1`; nested `latent_64` is a separate
  `REFERENCE_ONLY` derived view from `latent_128`. The neural-prefill owner
  records the rename history, and `vector-manifest.test.ts` verifies the
  nested derivation/checkpoint contract. This resolves the registry-name
  collision only; it does not admit either lane or prove live topology use.
- [ ] TOPO-03C Validate registry migration order in a proof database:
  `0152_atlas_representations_registry.sql` must establish the existing
  `atlas_representations` owner before the nested-family insert runs. Do not
  duplicate or silently recreate that registry table. The similarly named
  `0152_atlas_representations_registry_revised.sql` is a separate, incompatible
  manual candidate: its columns do not match the nested draft and it places
  `CREATE INDEX CONCURRENTLY` inside a transaction. The current source/journal
  search finds neither candidate registered, while the live base table exists;
  therefore table existence does not establish which migration created it or
  whether either candidate was applied. Resolve that lineage in a proof
  database before any registry admission. Older Phase 110 documents that call
  the revised file “current” are documentation history, not evidence of live
  migration state. Receipt:
  `docs/reports/latent-dimension-coverage-audit-2026-09-03.json`.
  Before using the disposable proof harness, verify whether its `postgres:18`
  image is already available. Do not pull it implicitly or apply the migration
  to the live database.
- [x] TOPO-04 Unit-prove the candidate latent256 figure out where that is, indexed? `latent_128` -> `latent_64` numerical
      identity independently of transport: `test_latent_autoencoder.py` asserts
      FP32 outputs and exact equality with the normalized first 64 coordinates of
      `latent_128`. This is a unit-level derivation contract only; it is not a
      current-corpus `latent_64` computation, producer run, or admitted artifact.
      It does not prove or reinterpret historical persisted bytes, FP16/MessagePack
      transport, or production artifact admission.
- [x] TOPO-05 Define `SOMAssignmentV1` in the existing representation
  contract owner. It binds candidate/ordinal, snapshot and CandidateOrdinalMap,
  workspace/source revisions, exact input artifact/representation, SOM model,
  cell, and assignment checksum; strict fixtures reject missing lineage,
  invalid ordinals, vector payloads, and canonical authority. This proves the
  schema contract only; live SOM production and readback remain unproven.
- [x] **CLUSTER-ARTIFACT-01** Complete the assignment-artifact contract for
  KMeans while reusing `SOMAssignmentV1` for SOM (do not create a second SOM
  schema). Bind each assignment to the exact admitted candidate snapshot,
  `CandidateOrdinalMapV1` revision/checksum, canonical candidate identity,
  workspace/source revisions, named input representation/artifact checksum,
  algorithm and parameter revision, centroid checksum, and assignment
  checksum. Keep assignments non-authoritative and write-free until the
  PostgreSQL/Qdrant identity and vector parity gates pass; fixture determinism
  is not corpus-scale cluster proof. Implemented as `KMeansAssignmentV1Schema`,
  `buildKMeansAssignmentV1()`, and `assertKMeansAssignmentV1()` in the existing
  `representation-gradient-v1.ts` owner. Focused tests bind every required
  lineage field, reject ordinal overflow/authority/tampering, and verify a
  deterministic assignment checksum (8/8 representation-gradient tests pass).
  This closes the schema/fixture task only; no clustering run, GPU execution,
  datastore write, or topology admission is claimed.
- [x] TOPO-06 Separate `ManifoldPca4V1` from `Topology4DCoordinateV1`. `ManifoldPca4V1` binds an independent representation revision, PCA basis/training-cohort digests, candidate/source/workspace revisions, input artifact revision, and output checksum; the topology coordinate remains routing-only. `representation-gradient-v1.spec.ts` proves both schemas reject cross-parsing and canonical-authority promotion. Runtime PCA generation/admission remains unproven.
- [x] TOPO-07 Require workspace/source/candidate/ordinal revision parity on
  topology rows. Contract/fixture proven: `topology-tile-v1.ts` binds tiles to the existing `CandidateOrdinalMapV1` checksum, candidate snapshot, workspace, and source revisions; coordinate values and semantic/AST/graph/temporal function revisions feed the topology revision. The focused topology fixture proves deterministic reorder behavior and rejects stale source/map revisions. Live population/backend parity remains in TOPO-08 through TOPO-12.
- [x] TOPO-08 Define `CanonicalEligibilityQueryV1` against the existing
  PostgreSQL owners: `codebase_chunk_index`, `atlas_packet_chunk_lineage`, and
  `atlas_workspace_source_bindings`. The read-only query requires the exact
  chunk-row UUID/canonical chunk ID, `semantic_768` at 768 dimensions, proven
  single-member lineage, and one workspace/source revision binding. It creates
  no canonical rows or vectors. Implementation:
  `scripts/atlas/audit-topology-pg-qdrant-eligibility-v1.mts`.
- [x] TOPO-09 Compile the non-authoritative `CandidateEligibilityBitmapV1` in
  CandidateOrdinal order, rejecting map/disposition reordering and ordinal
  mismatches. Nine focused fixtures pass. The current read-only run compiled
  15 eligible ordinals from 127,926 exact source/chunk candidates; this is not
  PG parity or Qdrant admission. Receipt:
  `docs/reports/atlas-topology-pg-qdrant-eligibility-20261002-r3.json`.
- [x] TOPO-10 Prove PostgreSQL eligibility-to-bitmap exact parity. The live
  read-only replay compiles the ordinal bitmap from bounded row dispositions
  and compares it to a separate exact-join SQL oracle; both return the same
  15 eligible ordinals from the 127,926-candidate map (zero missing or extra).
  Noneligible candidates remain explicit `BLOCKED` entries; the map is the
  candidate universe, not a claim that every row has a vector. Receipt:
  `docs/reports/atlas-topology-pg-qdrant-eligibility-20261002-r3.json`.
- [ ] TOPO-11 Prove Qdrant filter-to-bitmap exact parity. The current exact
  read-only run matched 0 Qdrant points to the 15 PostgreSQL-eligible ordinals
  among 31,891 scanned points. Existing projection payloads lack matching
  canonical/revision identity; do not use path or packet-key-only fallback.
  Receipt: `docs/reports/atlas-topology-pg-qdrant-eligibility-20261002-r3.json`.
  Follow-up (2026-10-03): the frozen semantic backfill executor was fail-closed
  before any model or datastore call, and its prepared Qdrant payload omitted
  `canonical_id`. Its pure payload builder now requires the map's canonical ID,
  exact packet/source/content/workspace identity and candidate-map revision; its
  readback predicate requires canonical ID plus exact source/workspace
  revisions. Focused tests pass 3/3. The existing provenance guard still blocks
  execution, so no Qdrant or PostgreSQL write occurred; this contract change
  does not resolve the current 0/15 live parity. Latest receipt:
  `docs/reports/atlas-topology-pg-qdrant-eligibility-20261003-r2.json`.
  A 2026-10-03 static path check also found the legacy SvelteKit
  `qdrant-sync-worker` has no in-repository startup call site; its `atlas_packets`
  row schema has no canonical ID column, and the shared payload helper allowed
  `canonical_id` to be omitted. The helper now rejects such payloads, but this
  path remains `LEGACY_UNPROVEN`, not the established semantic_768 writer. Do
  not use it to backfill existing points or claim TOPO-11.
- [ ] TOPO-11A Prove exact PostgreSQL pgvector-to-Qdrant `content` vector
  parity after TOPO-11 identity parity. Read back only the bounded admitted
  cohort and compare canonical chunk identity, workspace/source revisions,
  representation (`semantic_768`), dimensions (768), and vector digest or
  exact numeric values. The current eligibility auditor requests no Qdrant
  vectors (`with_vector: false`), so its bitmap result is not vector parity.
  Keep mismatched, duplicate, stale, and unbound points diagnostic-only; no
  Qdrant/PostgreSQL writes or latent computation in this task.
- [ ] TOPO-12 Prove cuVS filter-to-bitmap exact parity.
- [ ] TOPO-13 Admit only bounded topology fan-out with independent readback. Current topology results remain `CANDIDATE_ONLY`; exact readback against `CandidateOrdinalMapV1` is fixture-proven, but no production fan-out or ContextManifest admission path is wired. Preserve the upstream eligibility/parity gates and complete this task only after bounded admission plus independent readback.
- [x] TOPO-13a Build and reuse a revision-qualified 4D coordinate hash index for local tile lookup; enforce a bounded coordinate-probe budget and prove indexed results match the exact candidate set. The rebuildable `Map` index binds topology/workspace/snapshot/ordinal-map revisions, caps probes at 65,536 and results at 4,096, and remains non-authoritative. `multi-plane-execution.spec.ts` verifies 81 probes at radius 1, rejects radius 8, and matches an independent exact scan over 256 deterministic candidates for multiple query/radius pairs. This is fixture proof only; no persistent or production index is claimed.
- [ ] TOPO-14 Benchmark PostgreSQL AIO/bitmap scans, mmap, and GPU execution
  only after correctness gates pass.

## Current gate state

- `semantic_768 -> exact retrieval -> ContextManifestV1`: proven independently.
- `rff_128`: optional challenger, producer not yet proven.
- `latent_256`: physical nested-autoencoder parent; live artifact admission
  remains open.
- `latent_128`/`latent_64`: derived nested views; live artifact admission and
  legacy `latent_64` identity reconciliation remain open.
- SOM/4D/fan-out: downstream and non-blocking for Workstation V1.

## Ordered next steps

1. Reconcile `graphify_files` with `atlas_workspace_source_bindings` through
   the existing source-revision owners; then regenerate and independently
   verify a checksum-valid candidate map. Never repair the stale map in place.
2. Define PostgreSQL semantic_768 eligibility from exact chunk, packet-lineage,
   workspace-source binding, and vector-eligibility owners.
3. Compile the CandidateOrdinal bitmap and prove PostgreSQL exact parity.
4. Prove Qdrant filter/readback identity parity against the admitted bitmap,
   including duplicate-point disposition; do not use Qdrant IDs as candidate
   identity.
5. Prove bounded PostgreSQL pgvector ↔ Qdrant `content` vector readback parity
   for the exact admitted rows, with 768-D representation and revision checks.
6. Only after PostgreSQL and Qdrant identity/vector parity, run the bounded
   revision-qualified 4D topology-coordinate canary and independent readback.
7. Revisit latent representation dimensions only after the 4D coordinate
   canary. No current-corpus `latent_64` calculation, producer run, or write is
   authorized by this gate; any later computation needs its own lineage-bound
   input, producer, parameter, and readback receipt.
8. Prove cuVS parity and bounded topology fan-out before any ranking influence.

Failure of any topology gate leaves the proven semantic retrieval canary
unchanged and reports topology as unavailable or challenger-only.
- [ ] CANONICAL-IDENTITY-V1 POINTER (2026-09-21): canonical object identity (symbol/file/chunk discriminants, mandatory workspaceRevision + sourceRevision, no 'unknown'/latest-row inference, representation/execution/transport ids and CandidateOrdinal are NOT canonical identity) is owned by `CANONICAL-IDENTITY-V1-SPEC-01` in `openspec/changes/parent-atlas-retrieval-lineage-dag-convergence/tasks.md`. This change SHALL reference that contract and not define its own identity rules; it may add representation-, execution-, feature-, cache-, transport- or projection-specific identities only. Pointer only; no scope change here. Spec status: SPEC_DRAFT (not signed off).
