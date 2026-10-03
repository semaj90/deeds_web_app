# OpenSpec workboard run — 2026-09-26 18:53Z

## Pivot

Pivoted from the completed legacy-summary cosine mechanics lane to the pending identity/structural-lineage task list in `parent-atlas-repair-candidate-feature-matrix` and `parent-atlas-retrieval-lineage-dag-convergence`. This is a scoped workboard handoff, not a claim that all OpenSpec backlog items are complete.

## Completed in this run

- Collapsed the duplicate AtlasCoordinateV1 implementations: `packages/atlas-core` is the canonical implementation owner per the registry; the SvelteKit path remains a re-export for compatibility.
- Added and tested `qualifyEvidenceV2()` with exact source-binding → packet → lineage → indexed-chunk validation and independent representation/summary states.
- Ran a live, repeatable-read, read-only readiness recheck on the sealed 127-candidate / 1,520-chunk overlay.
- Refreshed the four-lane GAN receipt from that named readiness receipt.

## Measured outcome / blocker

- 1,520/1,520 binding, packet, PROVEN lineage, membership, and source digest checks matched.
- 114 chunk identities qualified; 1,406 current indexed chunk IDs disagree with lineage by within-file chunk ordinal. This is a structural lineage blocker; no remapping or write was attempted.
- `content_embedding`: 114 usable on exact chunk identities, 1,406 unqualified. `summary_text`: missing on all 1,520. 182 summary vectors are unbound. No immutable representation revision is present.
- Four-lane receipt reports structuralLineage `PARTIAL`; semantic projection `NOT_EXERCISED`.

## Next dependency

`INDEXED-CHUNK-CANONICAL-ID-RECONCILIATION-01` must identify the authoritative chunk-ID/chunk-boundary owner and explain the 1,406 disagreements before lineage repair, feature promotion, or HyperEdge parity.

## Safety

PostgreSQL writes: 0. Qdrant writes: 0. Valkey/Redis writes: 0. RabbitMQ publishes: 0. Graphify runs: 0. No DDL or container rebuilds.

Evidence: `docs/reports/mapreduce-chunk-readiness-v2-20260926T185021Z.json`, `docs/reports/gan-readonly-live-proof-v1-20260926T185300Z.json`.
