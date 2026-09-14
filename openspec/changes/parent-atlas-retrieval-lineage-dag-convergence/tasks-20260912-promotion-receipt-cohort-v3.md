# Parent Atlas retrieval-lineage temporal addendum — 2026-09-12 — PROMOTION-RECEIPT-COHORT-01 v3

This file is append-only evidence. It supersedes the candidate-map selection described in the v2 addendum without modifying prior history.

## Identity-grain correction

The historical `materialize-lineage-qualified-candidate-map-v1.mts` artifact is a packet-grain canary and remains preserved for its original bounded proofs. It is not the current RichChunk/semantic-corpus ordinal owner.

The current authority spine now uses:

- `scripts/atlas/materialize-current-chunk-ordinal-map-v2.mts`
- `.tmp/atlas/current-chunk-ordinal-map-v2.json`
- `docs/reports/current-chunk-ordinal-map-v2.json`
- `scripts/atlas/reconcile-promotion-receipt-cohort-v2.mjs`
- `docs/reports/promotion-receipt-cohort-v2.json`

## Current-chunk ordinal contract

`canonicalId = atlas_packet_chunk_lineage.canonical_chunk_id`.

Every admitted ordinal must have:

- one unambiguous `revision_status='PROVEN'` packet/chunk lineage tuple,
- one `packet_key`,
- one `source_ref`,
- one revision-qualified `source_revision`,
- an exact `atlas_workspace_source_bindings` row for the explicitly selected `workspaceRevision`,
- a real `codebase_chunk_index.id` physical row.

No semantic revision and no graph revision is fabricated by the ordinal producer. Those are bound only by their independent owners later.

Historical workspace bindings do not invalidate an explicitly selected current revision; the v2 producer filters to the exact requested workspace rather than requiring the entire history table to contain only one revision.

## Promotion cohort

`PROMOTION-RECEIPT-COHORT-01 v2` additionally requires:

- candidate receipt schema `atlas.current-chunk-ordinal-map.v2`,
- identity grain `CANONICAL_CHUNK`,
- identity owner `atlas_packet_chunk_lineage`,
- receipt/map workspace, snapshot, row-count, and ordinal-checksum parity,
- one compatible current `graphRevision` for the same selected workspace.

## Current proof state

Current-chunk ordinal implementation: `WIRED`
Promotion cohort v2 implementation: `WIRED`
Focused/static tests: `WRITTEN / WORKSTATION_EXECUTION_PENDING`
Live current-workspace result: `PENDING_WORKSTATION_REPLAY`

The authority runner is `scripts/atlas/run-rich-chunk-authority-spine-v1.mjs`.

Do not begin `RICH-CHUNK-CONTRACT-01` until the runner reaches `RICH_CHUNK_AUTHORITY_SPINE_READY`.
