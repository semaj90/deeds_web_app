# RETRIEVAL-PROFILE-NORMALIZATION-01 — 2026-09-11

## Status

`IMPLEMENTED_PENDING_WORKSTATION_TEST`

## Contract

`src/lib/server/atlas/features/retrieval-profile-v1.ts` defines:

- `ChunkRetrievalProfileV1`
- `FileRetrievalProfileV1`
- `DirectoryRetrievalProfileV1`
- compact `RetrievalTopologyFeaturesV1`
- revision-qualified domain/topic evidence

The contract normalizes already-owned retrieval evidence; it does not create a datastore or a new
retrieval lane.

## Invariants

- Canonical source/chunk identity remains owned by PostgreSQL packet/chunk lineage.
- `semantic_768` remains the single canonical semantic representation.
- KMeans, SOM, PageRank, community, bridge score, and `manifold4` are derived features only.
- `somX`/`somY` are constrained to the admitted 20x20 grid and `somCell = y * 20 + x` when present.
- File/directory profile keys are derived artifact checksums, not canonical IDs.
- File aggregation rejects mixed source identity/revision.
- Directory aggregation rejects mixed repository/workspace revision.
- Concept/entity/ontology tuple IDs are references; tuple contents remain canonical elsewhere.
- Directory/domain metadata is a weak ranking prior; recommended maximum initial share is 10%.
- Executor count never creates additional evidence votes.

## Proof

Focused tests:

```text
sveltekit-frontend/src/lib/server/atlas/features/retrieval-profile-v1.spec.ts
```

Required workstation command:

```powershell
cd sveltekit-frontend
npx vitest run src/lib/server/atlas/features/retrieval-profile-v1.spec.ts --run
```

This gate does not authorize full-corpus profile materialization or Qdrant/Postgres/Neo4j/Valkey
writes. Full materialization remains downstream of current source->packet->chunk lineage authority.
