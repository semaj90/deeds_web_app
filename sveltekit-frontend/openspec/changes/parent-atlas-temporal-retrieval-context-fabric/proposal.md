## Why

Operator direction 2026-09-20 (pasted temporal document/claim design). A reuse audit (TRCF-01, read-only) shows most of it is
already owned, and that two parallel owners exist for the same contracts. This change is a **docs-only convergence layer**: it
reconciles existing owners and defines only the four genuinely missing contracts. It writes no code, schema, or data.

## Reuse audit findings (verified 2026-09-20)

| Contract | Owner A (path-imported) | Owner B (`temporal-indexing-fabric.ts`, exported from package index) |
|---|---|---|
| SourceArtifactV1 | `packages/parent-atlas/src/core/source-artifact-v1.ts` | duplicate schema inside fabric file |
| SourceCoordinateMapV1 | `sveltekit-frontend/.../indexing/source-coordinate-map-v1.ts` | duplicate schema inside fabric file |
| KnowledgeClaimV1 | `core/knowledge/knowledge-claim-v1.ts` (VERIFIED/STALE/UNRESOLVED/CONFLICTED/RETRACTED) | fabric file (CURRENT/STALE_EVIDENCE/CONTRADICTED/SUPERSEDED/UNVERIFIED) |
| CandidateFeatureSnapshotV1 | `.../features/candidate-feature-snapshot-v1.ts` (implemented) | none |
| DocumentObservationV1, RunManifestV1, SourceRevisionDeltaV1, TemporalDocumentIndexV1 | none | fabric file (already exist; NOT missing) |

Missing (no owner found by grep of packages/, src/, scripts/, python/): `TemporalSourceEdgeV1`, `TemporalQueryPlanV1`,
`TemporalEvidenceBundleV1`, `DiagnosticIncidentV1`.

## What Changes (docs only)

- Pick one owner per duplicated contract (recommendation: Owner A for artifact/coordinate/claim; fabric file keeps only the
  contracts nobody else has) and record it; consolidation is a later, separately approved task (archive, never delete).
- Define a claim-state mapping between the two claim vocabularies instead of adding a third.
- Define the four missing contracts and the claim-invalidation transition rules.
- Map physical retrieval (B-tree, GIN FTS, pg_trgm, pgvector) and the cache boundary; no temporal vector index.

## Non-Goals

- No Postgres 18 `WITHOUT OVERLAPS` on source revisions (immutable revisions + edges); reserve it for claim validity ranges only.
- No new coordinate owner; no per-consumer UTF-16 recomputation.
- No change to DIM-08: the 219k backfill stays on HOLD; representation gates continue read-only.
- No BitFrost/ACE authority: caches hold products, never source truth.
