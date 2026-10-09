## Why

Workspace snapshots (`capture-workspace-source-snapshot-v1.mts` + byte readback) hash ~27,900 files
two or three times and fail if any file changes anywhere during the 5-6 minute window. In a
multi-agent repo this blocked Gate 2 admission (`parent-atlas-gate2-chunk-lineage-convergence`,
WORKSPACE-RESEAL-01: 2 files changed after capture).

## What changes

Make observation incremental and cheap, keep sealing and admission separate and explicit:
`OBSERVED != SEALED != ADMITTED`. A per-file digest cache (path + size + mtime ns, racy-mtime
guard) feeds capture; the full byte readback stays an independent oracle. A candidate snapshot is
immutable; `valid`, `current` and `admitted` are independent states. Admission is append-only,
needs the explicit operator phrase, and binds the exact workspaceRevision + manifest checksum.
Scheduling and any SSE/SSR surface only create or display candidates and never grant authority.

## Out of scope

Graphify runs, semantic backfill, ordinal completion, ACE/BitFrost writes, schema changes without a
reviewed numbered migration. Extend existing owners (origin runtime, capture lib, source-binding
tables); check `docs/architecture/runtime-ownership-registry.json` before adding any new one.
