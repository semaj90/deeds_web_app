## Why

Added 2026-09-16 — this change previously had no `proposal.md`, which the
`parent-atlas-openspec-tasks-audit-fabric` audit correctly flagged (`structuralScore: 30`, lowest
`auditScore` of any change in that run). This file summarizes intent for a reader who hasn't
already worked through the full `tasks.md` ledger; it does not change any task, evidence, or status
recorded there.

This is an execution-order companion to `parent-atlas-neural-prefill-encoder` and
`parent-atlas-retrieval-fusion-reachability`. It narrows the next implementation queue after the
2026-09-11 storage/lineage audits — freezing ownership invariants (PostgreSQL packet/chunk/source/
workspace lineage is the one canonical identity; KNN/Top-K/KMeans/SOM/PageRank/classifiers/
ontology/GraphRAG/Qdrant/pgvector/cuVS/CAGRA are evidence producers or executors, never identity
owners), then sequencing the retrieval-profile, file/directory-aggregation, semantic-representation,
topology-feature, candidate-manifest/ranking, pagination, and context-handoff work that has to
happen in that order before any of the currently-parked search-tool reintegration work
(`SEARCH-REINTEGRATION-*`, TRACE-MCP expansion, Vibreti-style challenger work, query-sidecar
expansion) can resume.

## What Changes

See `tasks.md`'s own "Ordered execution queue" section for the authoritative 12-step sequence.
This proposal does not add, remove, or reorder any task — it exists only to give the change a
discoverable `proposal.md`, matching this repo's convention for most other active `parent-atlas-*`
changes.

## Note on the versioned `tasks-20260911-v2.md` .. `v6.md` files in this directory

**These are not orphaned duplicates or clutter — do not archive or delete them.** They are
deliberate, self-documented "append-only temporal addenda" (confirmed by reading their own headers,
e.g. `tasks-20260911-v2.md`: "Historical task ledgers and proof artifacts are immutable evidence
once written. Do not rewrite a whole ledger to reflect a later understanding when a temporal
addendum captures it instead."). This is the same archive-not-delete, evidence-preservation
philosophy this repo applies elsewhere (see root `CLAUDE.md`'s "Archival Rules" section) — just
applied at the single-change level via dated addenda rather than a separate cold-storage directory.
`tasks.md` itself is the current, authoritative ledger; the `v2`-`v6` files are its historical
provenance trail, referenced from `tasks.md`'s own "Current producer authority cross-reference"
section.

## Capabilities

No new capability is introduced by this proposal file. The capabilities under active development
are the ones already named throughout `tasks.md` (retrieval profile contracts, file/directory
aggregation, candidate manifest + ranking, stable pagination, context handoff) — this file adds no
new scope beyond documenting what already exists there.
