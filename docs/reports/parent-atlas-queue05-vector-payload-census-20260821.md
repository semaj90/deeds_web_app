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

## Step 1 executed live (2026-08-21, follow-on session)

Applied `parent_atlas_artifact_transport_v1.sql` directly against the live Postgres instance
(`docker exec -i legal-ai-postgres psql -U legal_admin -d legal_ai_db < ...`): `CREATE TABLE`
×4, `CREATE INDEX` ×3, all `IF NOT EXISTS` — no existing table altered or dropped.

Also fixed a real bug found while running the readiness probe for the first time: the freshly
merged `prove-artifact-transport-readiness.mts` was missing the standard `loadAtlasEnv()` call
every other script in `scripts/atlas/` uses — it crashed with `SASL: SCRAM-SERVER-FIRST-MESSAGE:
client password must be a string` before it could even query, because `DATABASE_URL` wasn't
loaded yet when the `db` client module was first imported (top-level import gets hoisted ahead
of any same-file env-loading call). Fixed by loading env first, then dynamic-`import()`-ing
`inspectArtifactTransportReadiness` after `loadAtlasEnv()` runs.

Live proof output, before and after:

```text
# before migration
status: ARTIFACT_TRANSPORT_STORE_BLOCKED
readiness.status: TABLE_MISSING
readiness.missingColumns: [9 columns]

# after migration
status: ARTIFACT_TRANSPORT_STORE_READY
readiness.status: READY
readiness.missingColumns: []
readiness.incompatibleColumns: []
readiness.primaryKeyProven: true
readiness.artifactHashUniqueProven: true
```

**`ARTIFACT_TRANSPORT_STORE_READY` is now real, not aspirational.** This satisfies step 1 of the
8-step completion sequence above.

## Step 2/3 executed live (2026-08-21, same session) — write/readback + idempotency proven

Ran `prove-queue-artifact-lifecycle.mts` against the now-ready live store. Found and fixed the
identical class of bug as step 1 first (same file lacked `loadAtlasEnv()`, same SASL crash before
querying) — fixed the same way (load env, then dynamic-`import()` the `db`/schema/handler
modules).

Live result:

```json
{
  "status": "QUEUE_ARTIFACT_LIFECYCLE_PROVEN",
  "materializedInserted": true,
  "replayInserted": false,
  "replayRowCount": 1,
  "corruptionRejected": true,
  "corruptionReason": "ARTIFACT_MATERIALIZATION_NOT_PROVEN:CHECKSUM_MISMATCH",
  "failedInserted": true,
  "failedRowCount": 1
}
```

Every sub-check passed: the first `artifact.materialized` event inserted; an exact replay of the
same `eventId` did NOT insert a second row (idempotent, `replayRowCount` stayed at 1); a corrupted
copy of the same artifact was correctly rejected on checksum mismatch before insert; the
`artifact.failed` event persisted correctly. This is real evidence against the live database, not
a mocked unit test — the proof script writes real rows (tagged with its own random `proofId`,
left in place as evidence, not cleaned up) and reads them back.

Steps 4–8 (compatibility reader/writer at both raw-vector paths, checksum/revision-set readback
before Qdrant mutation, large-payload audit, before/after benchmark) remain open. Do not treat
`QUEUE_ARTIFACT_LIFECYCLE_PROVEN` as `QUEUE-05 COMPLETE` — this proves the store's write/readback
contract works, not that the actual `document.embed`/`vector.index` producers have been switched
over to it yet.
