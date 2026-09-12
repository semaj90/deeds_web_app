# CANDIDATE-MANIFEST-PAGINATION-01 — 2026-09-11

## Status

`IMPLEMENTED_PENDING_WORKSTATION_TEST`

## Contract

`src/lib/server/atlas/features/candidate-manifest-v1.ts` defines a derived, post-rerank
`CandidateManifestV1` plus a stable `CandidateCursorV1`.

The manifest freezes one ranked universe using:

- `workspaceRevision`
- `candidateSnapshotRevision`
- `rankingRevision`
- ordered canonical candidate identities/ordinals
- final admitted ranking scores
- `candidateSetChecksum`

The cursor binds:

- `candidateSetChecksum`
- `rankingRevision`
- `candidateSnapshotRevision`
- `lastRank`
- `lastScore`
- `lastCanonicalId`

## Invariants

- Pagination occurs **after** reranking.
- The paging layer does not rerank candidates.
- A cursor cannot replay against a different candidate set, ranking revision, or candidate snapshot.
- Dense `CandidateOrdinal` remains a snapshot-scoped execution coordinate only.
- Duplicate canonical identity or duplicate ordinal is rejected.
- Candidate manifests are short-lived derived read models and have `canonicalAuthority=false`.
- This contract replaces mutable datastore `OFFSET` semantics for ranked-result paging; internal
  slicing of the frozen manifest is permitted.
- ACE/BitFrost/Valkey may later cache the manifest by checksum/request identity, but no cache write
  is authorized by this gate.

## Proof

Focused tests:

```text
sveltekit-frontend/src/lib/server/atlas/features/candidate-manifest-v1.spec.ts
```

Required workstation command:

```powershell
cd sveltekit-frontend
npx vitest run src/lib/server/atlas/features/candidate-manifest-v1.spec.ts --run
```

No production caller is enabled by this contract. ContextManifest and neural-prefill admission stay
separate downstream gates.
