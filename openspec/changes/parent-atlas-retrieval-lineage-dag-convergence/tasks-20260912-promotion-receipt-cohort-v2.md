# Parent Atlas retrieval-lineage temporal addendum — 2026-09-12 — PROMOTION-RECEIPT-COHORT-01 v2

This file is append-only evidence. It does not rewrite prior retrieval-lineage task history.

## Status correction

`PROMOTION-RECEIPT-COHORT-01` is now wired to the existing lineage-qualified CandidateOrdinalMap producer instead of the older generic `candidate-ordinal-admission-v1.json` artifact.

Current implementation files:

- `scripts/atlas/materialize-lineage-qualified-candidate-map-v1.mts`
- `scripts/atlas/reconcile-promotion-receipt-cohort-v1.mjs`
- `scripts/atlas/run-rich-chunk-authority-spine-v1.mjs`
- `scripts/atlas/test-reconcile-promotion-receipt-cohort-v1.mjs`

## Frozen invariants

The selected cohort must bind exactly one:

- `workspaceRevision`
- `candidateSnapshotRevision`
- `ordinalMapChecksum`
- compatible current `graphRevision`

The lineage-qualified candidate receipt and materialized map must agree on workspace, snapshot revision, checksum, and row count. Missing map bytes or a stale workspace binding blocks the gate.

Historical receipts are classified, never rewritten or promoted.

The read-only authority runner anchors on `graphify-snapshot-native-readback-v1.json`, reruns receipt-currentness for that exact workspace, rebuilds the lineage-qualified candidate map for it, and stops immediately if the cohort remains blocked.

## Mutation boundary

No Graphify run is started.
No PostgreSQL canonical row is mutated.
No Qdrant/Neo4j/Valkey write occurs.
Only rebuildable filesystem reports/maps are written.

## Current proof state

Implementation: `WIRED`
Focused tests: `WRITTEN / WORKSTATION_EXECUTION_PENDING`
Live cohort result: `PENDING_WORKSTATION_REPLAY`

Do not begin `RICH-CHUNK-CONTRACT-01` until this gate reports `PROMOTION_RECEIPT_COHORT_PROVEN`.
