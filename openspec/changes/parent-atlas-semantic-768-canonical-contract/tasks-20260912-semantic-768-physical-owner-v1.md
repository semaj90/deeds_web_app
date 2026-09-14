# Temporal addendum — SEMANTIC-768-PHYSICAL-OWNER-01 — 2026-09-12

This file is append-only temporal evidence. It does not replace or rewrite the historical `tasks.md` ledger.

## Purpose

Adjudicate the current semantic_768 mutation writer without reopening the already-resolved physical storage contract.

Existing owner: `parent-atlas-semantic-768-canonical-contract`.

## Frozen physical owner

The existing `SemanticRepresentationV1` contract already freezes:

```text
table            codebase_chunk_index
column           content_embedding
storage type     halfvec(768)
representation   semantic_768
```

This gate therefore asks a narrower question:

> Which mutation writer, if any, can write that physical owner from a fully revision-qualified canonical chunk and independently read the same identity back?

Physical storage ownership does not imply canonical lineage authority.

## Implementation added

- `scripts/atlas/reconcile-semantic-768-physical-owner-v1.mjs`
- `scripts/atlas/test-reconcile-semantic-768-physical-owner-v1.mjs`

The reconciler consumes:

- `docs/reports/semantic-768-writer-ownership-v1.json`
- the source text of every classified writer surface

Every writer/reference surface is classified as one of:

```text
CANONICAL_CURRENT_WRITER
DELEGATES_TO_CANONICAL_WRITER
READ_ONLY_CONSUMER
DERIVED_PROJECTION
LEGACY_WRITER
CHALLENGER
MIGRATION_ARTIFACT
TEST_ONLY
DEAD_ORPHAN
UNRESOLVED
```

## Canonical-writer requirements

A writer targeting `codebase_chunk_index.content_embedding` is not admitted merely because it is revision-aware or because it writes 768 dimensions.

The current-writer contract requires source evidence for:

```text
canonicalChunkId / canonical_chunk_id
packetKey / packet_key
workspaceRevision / workspace_revision
sourceRevision / source_revision
embedding model revision
representation revision
dimension = 768
physical content_embedding write
explicit apply/authorization guard
source+workspace revision write guard
independent readback identity evidence
```

Pass only when:

```text
canonicalCurrentWriterCount = 1
unresolvedCurrentWriterCount = 0
```

## Current evidence expectation

The existing census predicts `SEMANTIC_768_PHYSICAL_OWNER_BLOCKED` today.

Key current facts:

- `codebase_chunk_index.content_embedding` is the frozen physical semantic_768 owner;
- multiple mutation-capable historical/legacy paths still exist;
- `backfill-graphify-file-embeddings-768.mjs` has strong source/workspace guards and immutable runtime provenance, but its current write path is keyed by the physical chunk row and does not itself prove the full canonical chunk + packet lineage required by `SemanticRepresentationV1`;
- the reachable legacy indexing route remains separately classified and cannot be promoted merely because it writes the same physical column.

Therefore no vector writes, caller rewrites, or Qdrant projections are authorized by this tranche.

## Mutation policy

```text
Postgres vector writes   0
Qdrant writes            0
schema changes           0
Graphify apply           0
ANN index creation       0
```

## Validation state

Focused Node tests are written for:

1. exactly one fully-qualified writer -> PROVEN;
2. physical-owner writer missing canonical chunk/packet lineage -> BLOCKED;
3. `atlas_packets.embedding` legacy writer never becomes canonical semantic writer.

They have not been executed in this ChatGPT runtime because the local container cannot fetch the branch from GitHub. Workstation execution remains required.

## Gate state

```text
SEMANTIC-768-PHYSICAL-OWNER-01    IMPLEMENTED / LIVE RUN PENDING
RICH-CHUNK-CONTRACT-01            BLOCKED UNTIL THIS GATE AND PROMOTION-RECEIPT-COHORT-01 PASS
```

## Safe workstation commands

```powershell
node --test scripts/atlas/test-reconcile-semantic-768-physical-owner-v1.mjs
node scripts/atlas/reconcile-semantic-768-physical-owner-v1.mjs
npx openspec validate parent-atlas-semantic-768-canonical-contract --type change --strict --json
```

Expected output report:

`docs/reports/semantic-768-physical-owner-v1.json`
