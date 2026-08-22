# Candidate Ordinal + Feature Snapshot Contract Addendum

Status: **IMPLEMENTED_UNPROVEN**

This tranche implements the pure CAND-01/02/03 and FEAT-01/02 contract/materialization boundary on top of the existing `CandidateFeatureRowV1` owner. It does not wire SearchRuntime, create Arrow files, allocate GPU buffers, query Qdrant, or change canonical persistence.

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
  revision-safe one-row-per-ordinal snapshot
  canonicalOwnerChanged = false
```

`CandidateOrdinal` is valid only under `candidateSnapshotRevision`. It is not a packet key, symbol identity, tree identity, Qdrant point ID, or GPU node ID.

## Implemented files

```text
sveltekit-frontend/src/lib/server/atlas/features/canonical-candidate-v1.ts
sveltekit-frontend/src/lib/server/atlas/features/candidate-feature-snapshot-v1.ts
sveltekit-frontend/src/lib/server/atlas/features/candidate-feature-snapshot-v1.spec.ts
```

## CAND contract

`CanonicalCandidateV1` carries:

```text
candidateOrdinal
canonicalId
packetKey
 treeNodeId
symbolVersionId
workspaceRevision
sourceRevision
graphRevision
semanticRevision
candidateSnapshotRevision
degradedIdentity
evidenceRefs
```

`materializeCandidateOrdinalMap()`:

1. parses canonical identity inputs,
2. rejects mixed workspace revisions,
3. rejects duplicate canonical IDs,
4. sorts deterministically by canonical identity coordinates,
5. assigns dense ordinals `0..N-1`,
6. binds every row to one `candidateSnapshotRevision`,
7. emits a deterministic SHA-256 map checksum,
8. records `identityAuthority=false`.

The negative identity guard explicitly rejects equality between `canonicalId` and any executor-local `candidateOrdinal`, Qdrant point ID, or GPU node ID. This is a proof helper, not permission to derive canonical identity from those coordinates.

## FEAT contract

`materializeCandidateFeatureSnapshot()` consumes only:

```text
CandidateOrdinalMapV1
CandidateFeatureRowV1[]
featureRevision
producerRevision
```

It performs no store reads and no feature synthesis.

For every row it requires exact agreement with the ordinal map for:

```text
candidateOrdinal
canonicalId
packetKey
treeNodeId
symbolVersionId
workspaceRevision
sourceRevision
graphRevision
semanticRevision
degradedIdentity
```

It also requires one common `featureRevision`, exactly one row for every ordinal, no duplicates, and no missing logical rows.

This is deliberately different from physical GPU padding. A later materializer may pad a device matrix to an alignment boundary, but logical `CandidateFeatureSnapshotV1` never invents fake candidates or sentinel rows.

## Proof gates written

- [ ] **CAND-01** canonical candidate identity round-trip through ordinal map.
- [ ] **CAND-02** deterministic map checksum and ordinal assignment under input permutation.
- [ ] **CAND-03** CandidateOrdinal/Qdrant point ID/GPU node ID substitution is rejected.
- [ ] **FEAT-01** exactly one feature row materializes per CandidateOrdinal.
- [ ] **FEAT-02A** row identity and source/graph/semantic revision drift fail closed.
- [ ] **FEAT-02B** feature revision drift fails closed.
- [ ] **FEAT-02C** missing learned values remain governed by the existing `CandidateFeatureRowV1` null + availability contract.

These gates remain unchecked until the focused Vitest actually runs successfully.

## Focused validation

```powershell
cd C:\Users\james\Videos\deeds_web_app\sveltekit-frontend
node_modules\.bin\vitest run `
  src/lib/server/atlas/features/candidate-feature-snapshot-v1.spec.ts
```

Also rerun the existing feature-row/manifold tests before promotion.

## Explicitly deferred

- FEAT-03A CPU dense/columnar materializer
- FEAT-03B Arrow IPC **file** writer
- FEAT-03C mmap reader
- FEAT-03D GPU gather/pack challenger and physical row padding
- FEAT-04 CPU/GPU parity receipt
- FANOUT-01 executor result normalization to CandidateOrdinal
- TurboVec `IdMapIndex` integration
- cuVS/CAGRA/Qdrant allowlist adapters
- `KnnNeighborhoodSnapshotV1`
- GPU-resident leases

The next safe tranche after focused proof is **FEAT-03A/03B**: compile this logical snapshot into an explicitly typed columnar CPU representation and Arrow IPC file artifact, preserving the exact ordinal-map checksum and candidate snapshot revision.
