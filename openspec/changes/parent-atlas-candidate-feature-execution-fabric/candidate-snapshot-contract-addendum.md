# Candidate Ordinal + Feature Snapshot Contract Addendum

Status: **IMPLEMENTED_UNPROVEN**

This tranche implements the pure CAND-01/02/03, FEAT-01/02, and FEAT-03A/03B boundary on top of the existing `CandidateFeatureRowV1`, `ArtifactAddressV1`, and repository `apache-arrow` owners. It does not wire SearchRuntime, mmap reads, GPU buffers, Qdrant/TurboVec/cuVS/CAGRA, or canonical persistence.

## Ownership

```text
Postgres / Graphify canonical identity + revision owners
        |
        v
CanonicalCandidateV1
        |
        v
CandidateOrdinalMapV1
  deterministic dense execution coordinates
  identityAuthority = false
        |
        v
CandidateFeatureRowV1
  existing feature-row owner
        |
        v
CandidateFeatureSnapshotV1
  logical one-row-per-ordinal snapshot
        |
        v
CandidateFeatureColumnarV1
  CPU physical reference layout
  f32 values + u8 presence
        |
        v
Arrow IPC FILE
  ArtifactAddressV1 / ARROW_IPC locator
  canonicalOwnerChanged = false
```

`CandidateOrdinal` is valid only under `candidateSnapshotRevision`. It is not a packet key, symbol identity, tree identity, Qdrant point ID, or GPU node ID.

## Implemented files

```text
sveltekit-frontend/src/lib/server/atlas/features/canonical-candidate-v1.ts
sveltekit-frontend/src/lib/server/atlas/features/candidate-feature-snapshot-v1.ts
sveltekit-frontend/src/lib/server/atlas/features/candidate-feature-snapshot-v1.spec.ts
sveltekit-frontend/src/lib/server/atlas/features/candidate-feature-columnar-v1.ts
sveltekit-frontend/src/lib/server/atlas/features/candidate-feature-columnar-v1.spec.ts
scripts/atlas/write-candidate-feature-arrow.mjs
sveltekit-frontend/scripts/atlas/prove-candidate-feature-arrow.mts
```

## CAND contract

`materializeCandidateOrdinalMap()` rejects mixed workspace revisions and duplicate canonical IDs, sorts deterministically by canonical identity coordinates, assigns dense ordinals `0..N-1`, binds every row to one `candidateSnapshotRevision`, emits a deterministic SHA-256 map checksum, and records `identityAuthority=false`.

The negative identity guard rejects equality between `canonicalId` and any executor-local `candidateOrdinal`, Qdrant point ID, or GPU node ID. This is a proof helper, not permission to derive canonical identity from those coordinates.

## FEAT-01/02 logical snapshot

`materializeCandidateFeatureSnapshot()` consumes only `CandidateOrdinalMapV1`, `CandidateFeatureRowV1[]`, `featureRevision`, and `producerRevision`. It performs no store reads and no feature synthesis.

For every row it requires exact agreement with the ordinal map for candidate identity and workspace/source/graph/semantic revisions. It requires one common `featureRevision`, exactly one row for every ordinal, no duplicates, and no missing logical rows.

Logical snapshots never invent sentinel candidates. Physical GPU padding remains a later materializer concern.

## FEAT-03A CPU reference columnar layout

`CandidateFeatureColumnarV1` freezes an executor-neutral physical layout:

```text
candidate_ordinal      uint32 [N]
lane_mask              uint16 [N]
degraded_identity      uint8  [N]
identity/revision cols         [N]
feature values         float32 [N, 12] row-major
feature presence       uint8   [N, 12] row-major
```

Scalar feature order is frozen as:

```text
semanticRelevance
lexicalRelevance
astAffinity
graphAuthority
personalizedPageRank
communityAffinity
manifold4OrientationSimilarity
crossEncoderRawScore
crossEncoderCalibratedScore
domainAffinity
executionUtility
memoryUtility
```

Missing evidence is encoded as `value=0, presence=0`. A real numerical zero is encoded as `value=0, presence=1`; those states are never conflated.

Portable checksums are computed over explicitly encoded little-endian `uint32`, `float32`, and `uint8` bytes rather than host-native typed-array memory. The materializer re-verifies the logical snapshot checksum before producing physical bytes.

## FEAT-03B Arrow IPC file writer

`scripts/atlas/write-candidate-feature-arrow.mjs` reuses the root workspace `apache-arrow` dependency and the established `tableToIPC(table, 'file')` convention.

It writes true Arrow columns for identity/revision fields and one `float32` value + `uint8` presence column for every scalar feature. It immediately round-trips the IPC bytes and verifies dense CandidateOrdinal preservation.

The writer returns the existing artifact vocabulary:

```text
ArtifactAddressV1
  schemaId = atlas.candidate-feature-arrow-ipc.v1
  locator.storage = ARROW_IPC
  checksum = SHA256(file bytes)
  revisionSetHash = SHA256(revision set)
  revisions:
    candidateSnapshotRevision
    ordinalMapChecksum
    featureSnapshotChecksum
    featureRevision
    workspaceRevision
    columnarChecksum
```

No Postgres/Qdrant/Valkey write is performed by the bounded proof.

## Proof gates written

- [ ] **CAND-01** canonical candidate identity round-trip through ordinal map.
- [ ] **CAND-02** deterministic map checksum and ordinal assignment under input permutation.
- [ ] **CAND-03** CandidateOrdinal/Qdrant point ID/GPU node ID substitution is rejected.
- [ ] **FEAT-01** exactly one feature row materializes per CandidateOrdinal.
- [ ] **FEAT-02A** row identity and source/graph/semantic revision drift fail closed.
- [ ] **FEAT-02B** feature revision drift fails closed.
- [ ] **FEAT-02C** missing learned values remain null/availability-qualified.
- [ ] **FEAT-03A-01** CPU columnar materialization preserves dense ordinal order.
- [ ] **FEAT-03A-02** missing evidence and real zero remain distinguishable.
- [ ] **FEAT-03A-03** f32/u32/u8 checksums are deterministic little-endian encodings.
- [ ] **FEAT-03B-01** Arrow serializer uses IPC FILE format.
- [ ] **FEAT-03B-02** Arrow round-trip preserves row count and CandidateOrdinal.
- [ ] **FEAT-03B-03** ArtifactAddress revision set binds ordinal/logical/columnar revisions.
- [ ] **FEAT-03B-04** identical input yields identical Arrow bytes and artifact ID.

These remain unchecked until executed on the workstation.

## Focused validation

```powershell
cd C:\Users\james\Videos\deeds_web_app\sveltekit-frontend

node_modules\.bin\vitest run `
  src/lib/server/atlas/features/candidate-feature-snapshot-v1.spec.ts `
  src/lib/server/atlas/features/candidate-feature-columnar-v1.spec.ts

npx tsx scripts/atlas/prove-candidate-feature-arrow.mts
```

Expected bounded proof terminal status:

```text
CANDIDATE_FEATURE_ARROW_BOUNDED_PROVEN
```

That proof performs no store writes.

## Explicitly deferred

- FEAT-03C mmap reader/readback verifier
- FEAT-03D GPU gather/pack challenger and physical row padding
- FEAT-04 CPU/GPU parity receipt
- FANOUT-01 executor result normalization to CandidateOrdinal
- TurboVec `IdMapIndex` integration
- cuVS/CAGRA/Qdrant allowlist adapters
- `KnnNeighborhoodSnapshotV1`
- GPU-resident leases

After FEAT-03A/03B pass locally, the next safe tranche is **FEAT-03C**: memory-map/read back the Arrow file, validate ArtifactAddress checksum/revision lineage, and prove selected columns can be read without changing logical ordinals. Only after that should GPU gather/pack begin.
