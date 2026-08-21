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

## Why QUEUE-05 is not checked off

Rewiring either raw path to `workflow_artifacts` before the manual migration is applied would turn a performance/transport concern into a runtime outage. Replacing `rabbitmq-manager-fixed.ts` with a wrapper around a copied legacy file was also rejected because the manager has many live importers and the copy would create a second physical queue owner.

Required completion sequence:

1. Apply and verify `parent_atlas_artifact_transport_v1.sql` in the intended environment.
2. Add a bounded compatibility reader/writer at both raw-vector paths.
3. Publish only `ArtifactAddressV1` plus small identity/revision metadata between embedding and vector-index stages.
4. Verify checksum/revision-set readback before Qdrant mutation.
5. Run `audit-queue-large-payloads.mts` and classify every remaining raw routing hit.
6. Benchmark message bytes and end-to-end latency before/after; only then check QUEUE-05 complete.

No production migration or Qdrant data mutation is performed by this branch.
