# Parent Atlas Topology Representation Admission — Tasks

## Qdrant storage inventory refresh (2026-10-12)

- [x] Current recheck supersedes the earlier 48-collection inventory for live
  state: `.tmp/atlas/production-hardening-seed-20261012/qdrant-pruning-audit-v2.json`
  reports 18/18 collection reads and snapshot-list reads successful, 18
  snapshots totaling 5,163,315,712 bytes, no aliases, no empty collections,
  and no `*384*` collection. The API provides `points_count` and sometimes
  `indexed_vectors_count`, but did not provide `vectors_count`. The receipt
  preserves config, payload schema, HNSW, optimizer, and snapshot metadata.
  The earlier 48-collection report remains historical evidence; the inventory
  discrepancy is not an explanation of which collections disappeared.
- [x] Read-only container/host recheck: `.tmp/atlas/production-hardening-seed-20261012/qdrant-volume-storage-readback-v1.json`
  records 92 files under `/qdrant/snapshots` across 43 collection-named
  directories plus `tmp`,
  5,170,720,640 bytes; `/qdrant/storage` is 12,003,695,240 bytes; C: has
  7,297,048,576 free bytes. The two 384-named directories are empty; the 28
  other non-current directories hold 7,403,776 bytes. The physical-vs-API
  snapshot-byte difference is 7,404,928 bytes, and exact file-to-record mapping
  remains unresolved.
- [ ] Snapshot disposition remains open: 5 collections have two snapshots, 8
  have one, and 5 have none. No consumer/rollback classification, restore drill,
  pruning authorization, or collection reconstruction was performed.

### Earlier inventory capture (historical; superseded for live counts)

- [x] Refreshed the existing read-only collection/storage inventory to cover all
  48 collections in `.tmp/atlas/production-hardening-seed-20261012/qdrant-complete-inventory-v4.json`.
  The report includes aliases, vector configuration/count fields when exposed,
  payload schemas, collection-name consumer references, API memory/snapshot
  totals, and read-only Docker volume `du` measurements. No Qdrant or database
  mutation was performed.
- [x] Earlier measurements: Qdrant API live collection disk totals
  16,894,092,591 bytes; API-visible snapshots 5,172,336,640 bytes across 48
  snapshots; Docker `/qdrant/storage` 20,383,966,561 bytes,
  `/qdrant/snapshots` 5,172,339,712 bytes, and `/qdrant` total
  25,664,321,468 bytes. The ~3.49 GB difference between API collection totals
  and storage-directory usage is unclassified; do not attribute it to a
  collection without further evidence. Snapshot totals agree within 3,072
  bytes. Alias endpoint returned an empty list.
- [x] Collection configuration readback completed after adding bounded retries
  for transient fetch failures: 48/48 collection-info responses returned, and
  all 48 included payload schema. `vectors_count` is retained when supplied but
  was not exposed for any collection (48/48 null); `points_count`,
  `indexed_vectors_count`, named vector dimensions, HNSW config, optimizer state,
  payload schemas/index fields, aliases, and snapshot filenames were captured.
  The external objective mentions 56 collections, while the live API listed 48;
  reconcile the expected inventory before treating those eight as missing.
- [ ] Snapshot retention remains a review-only classification (43 latest
  candidates and 5 rollback candidates); no snapshots were pruned or marked
  deletion-authorized. Container volume measurements do not authorize cleanup.

## Projection recovery and retention hardening (2026-10-12)

- [x] Earlier read-only runtime identity: Docker reported `qdrant/qdrant:v1.19.0`
  pinned to image digest `sha256:057ee3a8da769fe7310dd3537b4dc7583bf87a95ce8ac43c0af5a46bc580d1fc`.
  That historical inventory reported 48 collections and 48 snapshots; the
  later 2026-10-12 recheck reports 18 collections and 18 API-visible snapshots.
- [x] The earlier inventory counted 384-dimensional collections as legacy reduced
  semantic. The latest live API inventory has neither collection, and the latest
  snapshot-file scan has no filename containing `384`. Historical static
  references do not establish a live collection or caller. Do not treat 384
  dimensions as interchangeable with `semantic_768`.
- [ ] Snapshot cleanup is not authorized by age/count alone. Before proposing
  retention changes, map each exact snapshot name/checksum to its collection,
  backup manifest, last-known-good/rollback role, and restore compatibility;
  run a separately approved restore drill into an isolated target and verify
  points, named vectors, payload indexes, aliases, and lineage metadata. Then
  prepare an exact deletion allowlist and rollback/space-impact plan. Keep the
  current latest known-good plus an explicit pre-migration rollback checkpoint
  for each admitted owner; no snapshot has been deleted by this audit.
- [ ] Rebuild/upsert recovery contract: snapshots are point-in-time recovery
  artifacts, not incremental update logs or a recalculation recipe. Recompute
  from eligible canonical PostgreSQL rows and independently verified source
  revisions; construct complete payloads and every configured named vector;
  use deterministic projection IDs and an isolated versioned target; verify
  source cohort digest, point count, vector dimensions/metric, payload indexes,
  sampled vectors, query parity, and readback before any approved cutover.
  Qdrant upsert replaces the point state for that ID, so partial payload/vector
  upserts are prohibited. The current inventory reports no aliases; no
  collection rebuild, upsert, or alias change was performed.
- [ ] 384 retirement experiment: first resolve the 101-row static source set
  into executable callers, tests, and historical references; measure whether
  any admitted 384 consumer remains. Only then compare an isolated rebuild or
  no-op retirement plan against the canonical 768 lane. Do not delete or
  re-label the legacy collections based on naming or dimension alone.

## Agentic retrieval and executor experiment gates (2026-10-12)

- [ ] PostgreSQL `semantic_768`/HNSW and RTX/cuVS comparison uses the same
  frozen, identity-qualified candidate snapshot, query vectors, cosine metric,
  FP32 normalization policy, deterministic ordinal tie-break, and exact CPU
  oracle. Record executor/image/model revisions, latency, memory/VRAM, recall,
  and complete result identities. The existing PostgreSQL HNSW readback is
  infrastructure evidence only; it does not establish live GPU-route parity.
- [ ] Keep Qdrant, pgvector, TurboVec, and cuVS as physical executors of the
  existing semantic lane; SearchRuntime remains the single fusion owner. One
  canonical candidate contributes at most one semantic vote after identity-
  qualified deduplication. Do not add a new index, retrieval service, or
  fusion/RRF implementation to solve the current lineage gap.
- [x] Source correction: removed an unmatched `postgres_fts` name from the
  `rrf-integration.ts` lane-name array; this orchestration currently supplies
  `bm25Hits` labeled `postgres_trigram` and has no separate FTS hit array. The
  extra name shifted all subsequent lane labels. The `postgres_fts` type remains
  available for a correctly wired caller; focused RRF tests were interrupted
  and are not claimed as passed.
- [ ] KMeans/domain/taxonomy/fanout and agentic error-fixing are downstream
  read-only experiments over admitted indexed evidence. Token/feature mappings,
  centroid/model revisions, task/error receipts, source spans, and retrieval
  identities must be preserved. Results can recommend a bounded route or
  repair plan, but MCP permission/schema checks and explicit mutation gates
  remain authoritative; similarity edges are not ontology facts.

## PostgreSQL vector and lexical index readback (2026-10-12)

- [x] Read-only catalog census across `codebase_chunk_index`, `atlas_packets`,
  and `atlas_packet_features`: PostgreSQL 18.4, pgvector 0.8.3, pg_trgm 1.6,
  pg_search 0.25.1; `io_method=worker`, `effective_io_concurrency=16`, and
  `max_parallel_workers_per_gather=2`. The census found 11 HNSW, 39 GIN, 1
  pg_search BM25, and 1 trigram index among matching definitions on those
  tables. Existing `codebase_chunk_index.search_vector` GIN and pg_search BM25
  indexes are present; catalog presence does not prove a production caller.
- [x] Bounded `EXPLAIN (ANALYZE, BUFFERS, SETTINGS)` over the existing
  `content_embedding_768` lane used `idx_codebase_chunk_content_embedding_768_hnsw`
  (10 rows, one index search). Two identical isolated runs measured about
  447.8 ms and 2.35 ms respectively, illustrating cache sensitivity; these
  single probes are not a performance benchmark. No indexes or settings were
  changed. Receipt: `.tmp/atlas/production-hardening-seed-20261012/pgvector-index-readback-v1.json`.
- [ ] Do not create a new index or claim end-to-end retrieval readiness from
  this catalog/plan readback. Chunk source/workspace/representation revisions
  remain absent, and FTS/BM25 production caller reachability and current-source
  admission are separate gates.

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

## Read-only latent/topology audit update (2026-10-12)

- [x] `latent_128` full-table derivation check was reported as passing for
  55,169 rows against the normalized first 128 coordinates of `latent_256`
  (minimum cosine 1.000000, no row below 0.9999; norms 0.9998–1.0000).
  The detailed read-only receipt was not present in the inspected scratch
  report directory, so this remains a reported result rather than independently
  verified evidence for this ledger. It does not authorize routing promotion.
- [x] Read-only `codebase_topology_64` family census completed: 105,761 points;
  configured named vector `latent_64`, size 64, cosine. A 1,101-vector sample
  was finite and unit-normalized (norm 0.9999999802–1.0000000198). Payloads
  include 52,380 `semantic_768`/dimension-768 declarations that conflict with
  the collection's actual 64D vector contract; 53,381 points lack dimension or
  model revision; 101,236 lack `packet_kind`; 85,066 lack `chunk_id`; 4,510
  are marked `qdrant_chunk`, and 15 `mcp_tool_stub`. This is an observation
  census, not proof all non-chunk records are invalid. Collection was not
  modified. Receipt: `.tmp/atlas/production-hardening-seed-20261012/topology-64-family-summary-v1.json`.
- [x] Census count semantics reconciled by a fresh read-only 207-page Qdrant
  scroll (105,761/105,761 points; payloads only, vectors disabled): `chunk_id`
  is non-null on 20,695 points, explicitly null on 35,574, and absent on
  49,492. Thus the earlier `85,066 lack chunk_id` count means null-or-absent;
  `fieldCounts.chunk_id = 56,269` counted key presence, including nulls. The
  earlier 85,066 and 56,269 figures are not contradictory once nulls are
  separated. `source_ref` is non-empty on all 105,761; `packet_key` is present
  on 54,017; `representation_id` is absent on one; `packet_kind` is absent on
  101,236. This is payload classification only; no identity join, vector
  lineage, admission, or mutation was performed. The collection remains
  untouched. Fresh scroll result was observed in the read-only audit session;
  the saved census receipt remains at
  `.tmp/atlas/production-hardening-seed-20261012/topology-64-full-family-census-v1.json`.
- [x] Read-only PostgreSQL 18/pgvector/index check (2026-10-12): server is
  PostgreSQL 18.4 with vector 0.8.3, `io_method=worker`, and
  `effective_io_concurrency=16`. `codebase_chunk_index` has the expected
  `content_embedding_768 vector`, `content_embedding halfvec`, `latent_256/128
  halfvec`, and `latent_64 vector` types; HNSW indexes exist for those lanes.
  B-tree indexes exist on `chunk_id`, non-null `source_revision`, and
  `(workspace_revision, source_ref)` with non-null predicates. However, the
  read-only table check returned 274,465 rows, with **0** non-null
  `source_revision` and **0** non-null `workspace_revision`. The indexes do not
  provide lineage where row values are absent. A bounded top-10 cosine query
  selected `idx_codebase_chunk_content_embedding_768_hnsw` (10 rows; one index
  search; 430.519 ms in this run, 272 shared-buffer hits and 611 reads). This
  demonstrates that the index is usable for that query shape only; it does not
  establish representative performance, canonical source binding, or retrieval
  admission. Read-only transaction rolled back; no database changes.
- [ ] Topology query/contract reconciliation remains open: source inspection
  found a multi-vector API route that encodes a 768D query through the Redis-
  supplied autoencoder and searches `codebase_topology_64` using `latent_64`
  (`sveltekit-frontend/src/routes/api/codebase/search/multi-vector/+server.ts`,
  `sveltekit-frontend/src/lib/server/gpu/encode-768-to-64.ts`). Another
  retrieval path directly queries that collection
  (`sveltekit-frontend/src/lib/server/retrieval/rrf-integration.ts`). The
  collection/config contract names its vector `latent_64`, but
  `sveltekit-frontend/src/lib/server/vector/lane-registry.ts` declares
  `topology_ae64_v1` and separately says the legacy representation is not
  interchangeable with `latent_64`. This is a source-level wiring/identity
  mismatch, not proof of a live request or the producer of the 105,761 stored
  vectors. Keep the route/reference lane from being promoted until vector key,
  encoder/weights revision, stored-vector producer, and canonical identity
  mapping agree. No code, Redis, Qdrant, or PostgreSQL changes were made.
- [ ] Stored-vector producer remains unidentified: the legacy
  `scripts/atlas/backfill-latent-vectors.mjs` reads `codebase_chunks_768` and
  writes latent values to `atlas_packets` plus Valkey; it does not write
  `codebase_topology_64`. The newer Python routing builder writes
  `codebase_topology_64_v2`, a distinct collection. No matching owner for
  populating the legacy `codebase_topology_64` collection was found in the
  inspected writer/projection paths. Therefore neither the legacy 64D vectors
  nor their `semantic_768` payload labels can be attributed to the current
  autoencoder just because the current query path can encode 768D queries to
  64D. Preserve points and block alignment pending the actual collection
  writer, its source cohort, and weight/model digest being identified.
- [ ] Keep topology alignment and relabeling blocked until each producer family
  has an independently established representation identity, model/revision,
  canonical identity mapping, and source/graph lineage. Do not infer equivalence
  from dimension or unit norm; do not delete or relabel points.
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
- Trainer owner recheck (2026-10-13): `python python/train_latent_autoencoder.py --plan-only` returns `TRAINING_BLOCKED` because semantic writer and admitted input provenance are not proven; receipt declares `databaseRead:false`, `trainingPerformed:false`, and `checkpointWritten:false`. Current candidate architecture is `[768,512,256,128]` with a proposed normalized 64-D prefix. This is separate from the historical v3 trained artifact and is not evidence of a current retrain or promotion.
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

## FastAPI and manifold contract audit (2026-10-12; source-only)

- `services/topology-gpu/schemas.py` defines four-value manifold coordinates, but the synthesis request does not bind inputs to a source/workspace revision, candidate snapshot, CandidateOrdinalMap, representation/model revision, or transform checksum. The zero-coordinate default is a schema default, not measured evidence.
- Numeric shape/finiteness bounds are not established by the inspected schema. `services/topology-gpu/manifold.py` fits cuML UMAP or a PCA fallback per request and does not emit a frozen basis, cohort, or transform receipt; these coordinates are not a stable admitted representation.
- `/manifold-synthesis` is non-persisting but accepts caller-supplied identities without canonical candidate admission. `/materialize-pathway` can persist to PostgreSQL/Redis/Qdrant and contains runtime DDL; it was not called.
- Status: source surfaces identified; canonical lineage, finite-input validation, deterministic transform identity, and independent readback remain open. No task is completed by this audit; no service or store was changed.

## Qdrant inventory and recovery-path audit (2026-10-13T02:45Z; read-only)

- `scripts/atlas/audit-qdrant-pruning.mjs` queried `http://127.0.0.1:6333` with GET-only requests and wrote `.tmp/atlas/qdrant-pruning-audit-v1.json`. The endpoint returned 18 collections versus the requested expectation of 46; the count gate failed. The prior 48-collection receipt is not reconciled with this run.
- The audit recorded 18 snapshots totaling 5,163,315,712 reported bytes and no aliases. It found zero collections with an explicit `points_count: 0`; one collection's detail request failed, so that collection's count is unknown. This does not verify the earlier claim of 27 empty collections. Literal source-reference counts are leads, not proof of runtime ownership or safe deletion.
- Static inspection only: `scripts/operator/backup-atlas-state.mjs` creates snapshots using POST and its keep-two logic only reports older candidates. `scripts/operator/restore-atlas-state.mjs` guesses 384/768 dimensions from collection names, does not restore aliases or lineage, retries recovery without independent verification, and then logs success. Neither script was run.
- Status: snapshot inventory is partial; restore/recovery is NOT_PROVEN; pruning is NOT_AUTHORIZED. No Qdrant, database, alias, or snapshot mutations were performed. Resolve endpoint/count scope and prove isolated restore/readback before any retention decision.

## Preserved backup and runtime configuration cross-check (read-only)

- The preserved `backups/qdrant-upgrade-20260825-211412` directory contains one Qdrant `.snapshot` file for `codebase_chunks_768` (1,585,911,296 bytes). Its recomputed SHA-256 matches the `.checksum`, Qdrant snapshot response, and backup manifest (`70d2ac05…`). This proves byte integrity for that one file, not restore compatibility or searchable recovery.
- The same manifest lists four additional material snapshots that are absent from this backup directory. The backup is therefore not a complete collection-set recovery artifact. It records Qdrant 1.18.2; the current Compose image is Qdrant 1.19.0, so cross-version restore compatibility remains untested.
- Root `.env` selects `QDRANT_COLLECTION=codebase_chunks_768`, while `sveltekit-frontend/.env.local` selects `legal_documents`; both use `http://127.0.0.1:6333`. This affects app collection selection but does not explain the API's 18-versus-46 inventory count.
- No recovery, alias replay, or collection mutation was run. Keep snapshot recovery and pruning gates open.
- Dashboard cross-check: the open Qdrant UI reports server version `1.19.0`. Its collection route was blocked in the in-app browser; the live collection count was therefore verified separately through the local GET-only audit.

## Qdrant collection-deletion chronology (2026-10-13; log/read-only cross-check)

- Qdrant access logs record two collection DELETE requests returning HTTP 200 at `2026-10-13T01:00:45Z`: `codebase_chunks_384` and `codebase_chunks_384_hybrid`. At `2026-10-13T02:38:50Z`–`02:38:51Z`, logs record 28 more collection DELETE requests returning HTTP 200. This explains the inventory sequence 48 → 46 → 18; it does not identify the initiating process or prove the authorization context.
- The 28 later requests came from bridge address `172.18.0.1`; their logged user-agent is `-`. The two earlier requests show `curl/8.14.1`. These logs do not establish the human or process responsible. Do not infer intent or authorization from the address or user-agent.
- The 28-request pattern is consistent with the historical `scripts/atlas/prune-empty-qdrant-collections.mjs` (Node `http.request` DELETEs without a configured user-agent), and the staging-planes ledger records that helper's `--apply` execution. This is corroboration, not process-level attribution. Source inspection found a safety defect: failed/missing collection info was normalized to `pointsCount=0`, so an API error could be treated as an empty collection. Static code/config references also exist for deleted `external_programming_docs_768` and `legal_documents`; therefore the earlier “empty/test only” classification is not independently established. The helper is now read-only and rejects unknown point counts; no apply behavior remains.
- A read-only filesystem listing found 46 surviving `.snapshot` files under `/qdrant/snapshots`; files for all 28 collections deleted in the later batch remain there and total 7,401,984 bytes. Their presence is a recovery lead, not proof that the collections can be restored, that aliases/configuration are complete, or that source lineage is valid.
- Per-file SHA-256 and byte lengths for those 28 surviving snapshots are recorded in `.tmp/atlas/production-hardening-seed-20261012/qdrant-deleted-collection-snapshot-hashes-v1.json` (2026-10-13T02:55:12Z). These are current-byte fingerprints; no pre-deletion checksum comparison or restore test was available.
- The current GET-only audit ran after the logged deletes and made no Qdrant mutations. Preserve surviving snapshots and logs. Do not restore/recreate collections, prune snapshots, or issue further Qdrant writes until deletion history, consumer ownership, and isolated restore/readback are reviewed and authorized.
- Status: current 18-collection readback and deletion chronology are verified from separate local surfaces; actor/authorization, full historical inventory scope, and recoverability remain `NOT_PROVEN`. No completion checkbox is warranted.
- [ ] CANONICAL-IDENTITY-V1 POINTER (2026-09-21): canonical object identity (symbol/file/chunk discriminants, mandatory workspaceRevision + sourceRevision, no 'unknown'/latest-row inference, representation/execution/transport ids and CandidateOrdinal are NOT canonical identity) is owned by `CANONICAL-IDENTITY-V1-SPEC-01` in `openspec/changes/parent-atlas-retrieval-lineage-dag-convergence/tasks.md`. This change SHALL reference that contract and not define its own identity rules; it may add representation-, execution-, feature-, cache-, transport- or projection-specific identities only. Pointer only; no scope change here. Spec status: SPEC_DRAFT (not signed off).

## Streaming graph indexing and component boundary alignment (2026-10-13)

- [x] Bounded streaming graph ingestion: Demonstrated streaming parser (`scripts/atlas/streaming-graph-indexer.mjs`) extracting structural nodes and edge relationships without loading full 400 MB graph payloads into Node.js heap or VRAM.
- [x] Decoupled retrieval and clustering concerns:
  - Qdrant: ANN TopK retrieval (HNSW / scalar quantization) on canonical `content_embedding_768`. Does not require RFF.
  - cuML / cuVS: KMeans centroids on candidate feature matrix. Does not require TopK to train.
  - RFF: Offline/challenger kernel projection approximating Gaussian RBF with frozen seed. Not an admitted Qdrant representation.
  - PostgreSQL 18: Canonical authority for `sourceRef`, `CandidateOrdinal`, and `content_embedding_768`.
- [x] Active synthesis model identity: Synchronized active synthesis model to `ornith-1.5-9b` (served on `:8090`), retiring stale `gemma4-legal` references across database error clusters, BitFrost repair templates, and evaluation contracts.

## Canonical-state correction — 2026-10-14

- Canonical dense representation is `semantic_768` (EmbeddingGemma, 768-d). The 384 representation is retired from active retrieval; 384 references above are historical and are not current canonical claims.
- Latent/MRL facts (code is authoritative; root `CLAUDE.md` "Autoencoder latents"): `z128` is a learned bottleneck, not a slice of `z256`; `z64 = normalize(z128[:64])`; MRL prefix `v_k = normalize(v_768[:k])`. Existing `latent_128` rows described as a slice of `latent_256` must be re-verified before citation.
- Parity canonical contract is `codebase_chunks_768_v2`; `codebase_chunks_768` is legacy.
- This note changes no database, Qdrant, or runtime state.
