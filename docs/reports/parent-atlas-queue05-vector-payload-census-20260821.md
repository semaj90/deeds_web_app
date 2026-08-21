# Parent Atlas QUEUE-05 vector payload census — 2026-08-21

Status: **OPEN / MIGRATION-BOUND**

## Scope

Fresh live-code census of the remaining dense-vector / tensor message boundaries relevant to Parent Atlas queue artifact transport. Vendored dependencies, backups, parked routes, report/snapshot directories, temp uploads, and test files are excluded by the repeatable audit script:

```bash
npx tsx scripts/atlas/audit-queue-large-payloads.mts
```

## Confirmed raw-vector paths

### 1. Legacy RabbitMQ manager

`src/lib/server/queue/rabbitmq-manager-fixed.ts`

Live chain:

```text
document.embed
  -> handleDocumentEmbedding()
  -> generateSingleEmbedding()
  -> vector.index.document { documentId, embedding[], collection, metadata }
  -> handleVectorIndex()
  -> qdrant.batchUpsert()
```

This path serializes the complete embedding array into RabbitMQ today.

### 2. Queue-worker inline/broker worker chain

`src/lib/server/queue/queue-worker.ts`

Live chain:

```text
DocumentEmbedWorker
  -> generateSingleEmbedding()
  -> dispatchOrExecuteInline('vector.index', { embedding[] ... })
  -> VectorIndexWorker
  -> inlineVectorIndex / Qdrant
```

This is a second raw-vector execution path and must not be silently conflated with the legacy manager path.

## Artifact-reference substrate now available

The queue tranche adds:

- `ArtifactAddressV1` / `ActionWorkItemV1` reference-only task contracts.
- `postgres-json-artifact-v1.ts` with content-addressed immutable JSON artifact storage and readback checksum verification.
- `workflow_artifacts` migration table in `drizzle/manual/parent_atlas_artifact_transport_v1.sql`.
- `artifact.materialized` / `artifact.failed` lifecycle events and replay-safe durable projection.
- task-envelope size policy that rejects oversized `ActionWorkItemV1` payloads.
- `artifact-transport-readiness-v1.ts`, a read-only deployment gate that proves the live `workflow_artifacts` table has the exact required columns, `artifact_id` primary key, and unique `artifact_hash` constraint.
- `prove-artifact-transport-readiness.mts`, a read-only runtime proof that exits blocked until the manual migration is actually present and structurally compatible.

Readiness proof command:

```bash
npx tsx scripts/atlas/prove-artifact-transport-readiness.mts
```

Expected pre-migration state:

```text
status: ARTIFACT_TRANSPORT_STORE_BLOCKED
readOnly: true
canonicalWriteAttempted: false
readiness.status: TABLE_MISSING
```

Expected post-migration state:

```text
status: ARTIFACT_TRANSPORT_STORE_READY
readOnly: true
canonicalWriteAttempted: false
readiness.status: READY
```

The proof is intentionally read-only. A green schema-readiness receipt permits the next compatibility-wiring tranche; it does not by itself prove artifact write/readback, Qdrant projection, or QUEUE-05 closure.

## Why QUEUE-05 is not checked off

Rewiring either raw path to `workflow_artifacts` before the manual migration is applied would turn a performance/transport concern into a runtime outage. Replacing `rabbitmq-manager-fixed.ts` with a wrapper around a copied legacy file was also rejected because the manager has many live importers and the copy would create a second physical queue owner.

Required completion sequence:

1. Apply `parent_atlas_artifact_transport_v1.sql` in the intended environment.
2. Run `prove-artifact-transport-readiness.mts`; require `ARTIFACT_TRANSPORT_STORE_READY` before changing producers.
3. Run the existing artifact lifecycle/write-readback proof against the intended non-production/test database.
4. Add a bounded compatibility reader/writer at both raw-vector paths.
5. Publish only `ArtifactAddressV1` plus small identity/revision metadata between embedding and vector-index stages.
6. Verify checksum/revision-set readback before Qdrant mutation.
7. Run `audit-queue-large-payloads.mts` and classify every remaining raw routing hit.
8. Benchmark message bytes and end-to-end latency before/after; only then check QUEUE-05 complete.

No production migration or Qdrant data mutation is performed by this branch.
