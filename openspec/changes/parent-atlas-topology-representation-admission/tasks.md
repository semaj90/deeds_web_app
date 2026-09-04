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
  computes `768 → 128 → 64` and serializes `latent_64` as FP32 `bytea`, but
  its write path can fall back across Qdrant point ID, `packet_key`, and
  `source_ref`, and records only a numeric model epoch as
  `representationRevision`. It does not require a current semantic artifact,
  `CandidateOrdinalMapV1`, or exact workspace/source revisions before update.
  Treat existing latent rows as diagnostic until that producer contract is
  repaired and independently read back.
- The static producer audit reports `PRODUCER_CONTRACT_INCOMPLETE`; the
  missing fields are semantic input binding, model/parameter digest, producer
  revision, candidate snapshot, ordinal checksum, and required workspace/source
  revisions.

- [ ] TOPO-01 Freeze `RepresentationDerivationDagV1` with independent
  `rff_128`, `ae_latent_128`, and `ae_latent_64` branches.
- [ ] TOPO-02 Audit representation definitions against live artifacts and
  classify unbound vectors as diagnostic-only.
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
  `latent_256` is the physical learned bottleneck stored on
  `codebase_chunk_index`; `latent_128` and nested `latent_64` remain derived
  prefix-plus-renormalization views and are not duplicated as independent
  tables or vector columns.
- [x] Add a read-only 15-row latent canary plan bound to the current ordinal
  map; it reports the required artifact fields and refuses to authorize apply.
- [x] Make the legacy latent writer fail closed on ordinary `--apply`; its
  diagnostic persistence now requires the explicit `--legacy-unsafe-apply`
  flag and remains outside promotion.
- [ ] TOPO-03 Implement/read-prove `RepresentationArtifactV1` digests and
  revision bindings.
- [ ] TOPO-03A Read-prove `latent_256` storage/index coverage and deterministic
  `latent_128`/`latent_64` derivation from the same parent artifact.
- [x] Read-only derivation sample confirms the nested projection numerically
  (`8/8` rows, CUDA, bounded error); this does not close representation
  admission because producer/input/revision lineage is still incomplete.
- [x] Read-only live coverage confirms `latent_256` is populated for `55,169`
  rows with its HNSW/checkpoint indexes, while `latent_128` has no stored
  column as designed. The registry table is absent because the additive draft
  is unapplied. Receipt: `docs/reports/latent-dimension-coverage-audit-2026-09-03.json`.
- [ ] TOPO-03B Reconcile the pre-existing generic `latent_64` registry entry
  with the nested-autoencoder derived view; do not silently reuse an ambiguous
  representation ID.
- [ ] TOPO-03C Validate registry migration order in a proof database:
  `0152_atlas_representations_registry.sql` must establish the existing
  `atlas_representations` owner before the nested-family insert runs. Do not
  duplicate or silently recreate that registry table. The similarly named
  `0152_atlas_representations_registry_revised.sql` is a separate, incompatible
  manual candidate: its columns do not match the nested draft and it places
  `CREATE INDEX CONCURRENTLY` inside a transaction. Neither candidate is
  journaled or applied; resolve this in a proof database before any registry
  admission. Older Phase 110 documents that call the revised file “current” are
  documentation history, not evidence of live migration state. Receipt:
  `docs/reports/latent-dimension-coverage-audit-2026-09-03.json`.
  The existing disposable proof harness can be reused, but its `postgres:18`
  image is not present locally; do not pull it implicitly or apply the migration
  to the live database.
- [ ] TOPO-04 Prove `ae_latent_64` numeric FP32 identity separately from its
  FP16/MsgPack transport encoding.
- [ ] TOPO-05 Bind `SOMAssignmentV1` to one input artifact and SOM model
  revision.
- [ ] TOPO-06 Separate `ManifoldPca4V1` from `Topology4DCoordinateV1`.
- [ ] TOPO-07 Require workspace/source/candidate/ordinal revision parity on
  topology rows.
- [ ] TOPO-08 Define `CanonicalEligibilityQueryV1` in PostgreSQL.
- [ ] TOPO-09 Compile `CandidateEligibilityBitmapV1` by CandidateOrdinal.
- [ ] TOPO-10 Prove PostgreSQL eligibility-to-bitmap exact parity.
- [ ] TOPO-11 Prove Qdrant filter-to-bitmap exact parity.
- [ ] TOPO-12 Prove cuVS filter-to-bitmap exact parity.
- [ ] TOPO-13 Admit only bounded topology fan-out with independent readback.
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

1. Complete `LINEAGE-01` source namespace/content-hash reconciliation.
2. Produce a 128-row exact `CandidateOrdinalMapV1` before any topology tensor.
3. Freeze `RepresentationArtifactV1` for one real input representation.
4. Prove PostgreSQL eligibility → CandidateOrdinal bitmap parity.
5. Prove Qdrant and cuVS filter parity against that bitmap.
6. Only then run bounded topology fan-out and independent readback.

Failure of any topology gate leaves the proven semantic retrieval canary
unchanged and reports topology as unavailable or challenger-only.
