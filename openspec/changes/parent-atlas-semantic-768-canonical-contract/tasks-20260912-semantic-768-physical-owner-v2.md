# Parent Atlas semantic_768 temporal addendum — 2026-09-12 — SEMANTIC-768-PHYSICAL-OWNER-01 v2

This file is append-only evidence. It does not rewrite prior semantic_768 task history.

## Physical owner remains frozen

Logical representation: `semantic_768`
Physical PostgreSQL owner: `codebase_chunk_index.content_embedding`
Physical type: `halfvec(768)`

`content_embedding_768` remains legacy/transitional storage and must not satisfy the current writer gate by identifier-prefix matching.

## Canonical current writer wiring

The intended operator path remains:

`scripts/atlas/backfill-graphify-file-embeddings-768.mjs`

It now requires, before selection:

- exactly one `atlas_packet_chunk_lineage` row for the chunk
- `revision_status = 'PROVEN'`
- non-null `canonical_chunk_id`
- non-null `packet_key`
- non-null revision-qualified `source_revision`
- exact `atlas_workspace_source_bindings` match for the requested `workspaceRevision`

Apply mode rechecks the same canonical tuple inside the `UPDATE` and then independently reads back:

- chunk row ID
- canonical chunk ID
- packet key
- source ref
- source revision
- workspace revision
- embedding model
- embedding version / representation revision
- vector dimensions

The transaction fails closed if the guarded update or readback does not match exactly.

No Qdrant/TurboVec write is performed by this writer.

## Writer census correction

`audit-semantic-768-writer-ownership-v1.mjs` now matches `content_embedding` as a whole SQL identifier, explicitly excluding `content_embedding_768`. This prevents the legacy full-repo indexer and `index-stream` route from impersonating the physical semantic owner by prefix matching.

Historical `content_embedding` re-embed jobs are classified as `MIGRATION_ARTIFACT`, not current owner candidates.

## Current proof state

Canonical writer implementation: `WIRED`
Writer census correction: `WIRED`
Focused tests: `WRITTEN / WORKSTATION_EXECUTION_PENDING`
Live owner result: `PENDING_WORKSTATION_REPLAY`

Do not execute the semantic writer with `--apply` without separate explicit authorization. The authority spine runner never invokes apply mode.

Do not begin `RICH-CHUNK-CONTRACT-01` until `SEMANTIC_768_PHYSICAL_OWNER_PROVEN` and `PROMOTION_RECEIPT_COHORT_PROVEN` both hold.
