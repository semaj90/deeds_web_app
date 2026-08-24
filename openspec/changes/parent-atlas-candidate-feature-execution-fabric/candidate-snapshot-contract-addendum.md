# Candidate Ordinal + Feature Snapshot Contract Addendum

Status: **IMPLEMENTED_UNPROVEN**

This tranche implements CAND-01/02/03, FEAT-01/02, FEAT-03A/03B, and the FEAT-03C readback/mmap proof surfaces on top of the existing `CandidateFeatureRowV1`, `ArtifactAddressV1`, and repository `apache-arrow` owners. It does not wire SearchRuntime, GPU buffers, Qdrant/TurboVec/cuVS/CAGRA, or canonical persistence.

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
        |
        +--> JS disk readback verifier
        |
        `--> Python read-only OS mmap + PyArrow proof

canonicalOwnerChanged = false throughout
```

`CandidateOrdinal` is valid only under `candidateSnapshotRevision`. It is not a packet key, symbol identity, tree identity, Qdrant point ID, or GPU node ID.

Each candidate may now carry additive `representationBindings`. These bindings
describe derived vector lineage only: `semantic_mrl_512`, `semantic_mrl_256`,
and `semantic_mrl_128` use EmbeddingGemma prefix truncation with post-projection
normalization; `latent_128` and `latent_64` require a learned autoencoder
projection revision. Neither representation ID nor vector slot changes the
CandidateOrdinal identity or canonical authority.

## Implemented files

```text
sveltekit-frontend/src/lib/server/atlas/features/canonical-candidate-v1.ts
sveltekit-frontend/src/lib/server/atlas/features/candidate-feature-snapshot-v1.ts
sveltekit-frontend/src/lib/server/atlas/features/candidate-feature-snapshot-v1.spec.ts
sveltekit-frontend/src/lib/server/atlas/features/candidate-feature-columnar-v1.ts
sveltekit-frontend/src/lib/server/atlas/features/candidate-feature-columnar-v1.spec.ts
sveltekit-frontend/src/lib/server/atlas/features/candidate-feature-arrow-readback.spec.ts
scripts/atlas/write-candidate-feature-arrow.mjs
scripts/atlas/read-candidate-feature-arrow.mjs
scripts/atlas/prove-candidate-feature-arrow-mmap.py
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

## FEAT-03C file readback + mmap boundary

FEAT-03C is split intentionally so the implementation does not call an ordinary Node `readFile()` operation an OS mmap.

### FEAT-03C-JS — immutable disk readback

`scripts/atlas/read-candidate-feature-arrow.mjs`:

1. accepts the existing `ArtifactAddressV1` or writer receipt envelope;
2. recomputes and verifies `revisionSetHash`, `artifactHash`, and `artifactId`;
3. opens the `ARROW_IPC` locator read-only;
4. verifies SHA-256 of the actual file bytes;
5. verifies `ARROW1` file magic at prefix and suffix;
6. parses the Arrow IPC file;
7. proves dense CandidateOrdinal order;
8. optionally compares all identity/revision columns to `CandidateFeatureColumnarV1`;
9. reads an explicit ordinal/feature subset and verifies value + presence parity.

Its receipt is explicit:

```text
readMode = NODE_FILE_BYTES_ARROW_IPC
osMmap = false
randomAccessCapableFormat = true
```

The focused Vitest writes a real temporary Arrow file and includes corrupted-file and revision-set tamper negative cases.

### FEAT-03C-MMAP — true read-only OS mapping

`scripts/atlas/prove-candidate-feature-arrow-mmap.py` uses Python `mmap.mmap(..., access=mmap.ACCESS_READ)` over the same immutable Arrow file.

Before parsing it verifies:

```text
ArtifactAddressV1 identity
revisionSetHash
artifactHash / artifactId
ARROW1 file magic
SHA256(mapped file bytes)
```

If PyArrow is installed, it opens the IPC file from the mapped buffer, verifies dense ordinals, and optionally proves identity + selected feature value/presence parity against the columnar reference.

If PyArrow is absent it emits:

```text
status = MMAP_FILE_PROVEN_PYARROW_BLOCKED
blocker = PYARROW_NOT_INSTALLED
```

and exits nonzero. That may prove the OS mapping primitive but **does not** promote FEAT-03C Arrow mmap readback.

This boundary does not claim Arrow IPC is GPU zero-copy. Host mmap -> pinned/pageable transfer -> GPU is a later FEAT-03D benchmark/implementation concern.

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
- [ ] **FEAT-03C-JS-01** disk readback verifies artifact/revision/file checksums.
- [ ] **FEAT-03C-JS-02** disk readback preserves dense ordinals and identity columns.
- [ ] **FEAT-03C-JS-03** selected feature values + presence bits match CPU columnar reference.
- [ ] **FEAT-03C-JS-04** corrupted bytes and revision tampering fail closed.
- [ ] **FEAT-03C-MMAP-01** actual read-only OS mmap opens the exact artifact bytes.
- [ ] **FEAT-03C-MMAP-02** PyArrow IPC readback from mapped bytes preserves ordinals/selected columns.

These remain unchecked until executed on the workstation.

## Focused validation

```powershell
cd C:\Users\james\Videos\deeds_web_app\sveltekit-frontend

node_modules\.bin\vitest run `
  src/lib/server/atlas/features/candidate-feature-snapshot-v1.spec.ts `
  src/lib/server/atlas/features/candidate-feature-columnar-v1.spec.ts `
  src/lib/server/atlas/features/candidate-feature-arrow-readback.spec.ts

npx tsx scripts/atlas/prove-candidate-feature-arrow.mts
```

Expected FEAT-03A/03B bounded proof terminal status:

```text
CANDIDATE_FEATURE_ARROW_BOUNDED_PROVEN
```

For true mmap readback, first materialize an Arrow file + writer receipt + matching columnar JSON, then run from repository root:

```powershell
python scripts/atlas/prove-candidate-feature-arrow-mmap.py `
  --artifact=<writer-receipt.json> `
  --expected=<columnar.json> `
  --features=semanticRelevance,astAffinity,graphAuthority `
  --ordinals=0,1
```

Full FEAT-03C acceptance requires:

```text
CANDIDATE_FEATURE_ARROW_MMAP_PROVEN
```

A `PYARROW_NOT_INSTALLED` blocker is diagnostic only, not proof completion.

All focused proofs are read-only with respect to Postgres/Qdrant/Valkey/Neo4j and do not allocate GPU state.

## Explicitly deferred

- FEAT-03D GPU gather/pack challenger and physical row padding
- FEAT-04 CPU/GPU parity receipt
- FANOUT-01 executor result normalization to CandidateOrdinal
- TurboVec `IdMapIndex` integration
- cuVS/CAGRA/Qdrant allowlist adapters
- `KnnNeighborhoodSnapshotV1`
- GPU-resident leases

After FEAT-03C passes locally, the next safe tranche is **FEAT-03D + FEAT-04**: compile the proven logical rows into an explicitly padded physical GPU batch with a valid mask, then compare CandidateOrdinal and feature values against the CPU reference. Executor fanout remains behind that parity boundary.
