# Svelte Relation Batch and RabbitMQ Dependency Audit

Date: 2026-10-28

## Verdict

**Proposal generation: `DIRECT` (local, proposal-only). Canonical Svelte relation persistence: `UNRESOLVED` / not demonstrated.** The inspected structural-reference producer reads admitted membership and source through the existing sidecar, maps extracted facts in memory, and writes only local `facts.jsonl` and `receipt.json` artifacts. It does not call RabbitMQ, the transactional outbox, or a relation database writer. Its receipt explicitly sets `canonicalEligible`, `canonicalAuthority`, `writesPerformed`, and `snapshotUuidEstablished` to false.

This is not evidence that a future or separately operated batch path cannot use RabbitMQ. No producer-to-writer invocation was found connecting this Svelte proposal path to a canonical relation persistence operation. Keep Canonical Gate V2 `FAIL`; do not infer admission from proposal generation or transport recovery.

## Paths distinguished

| Path | Observed behavior | RabbitMQ classification |
| --- | --- | --- |
| `structural-reference-producer-smoke-v1.mjs` → `mapReferenceFacts` | Read-only extraction/mapping; writes local, unique run artifacts only | `DIRECT` local proposal path; no RabbitMQ dependency |
| `load-graph-ndjson.mjs` and `ingest-all-edges-to-postgres.mjs` | Explicit opt-in (`--apply`) scripts issue direct PostgreSQL `INSERT`/upsert operations to legacy `code_relations_v1` | `DIRECT` DB path; not shown as the current Svelte proposal path and not authorized by this audit |
| Workflow task outbox | PostgreSQL transaction inserts workflow task/outbox rows; publisher sends `atlas.tasks.v1` using RabbitMQ confirms | `OUTBOX_QUEUED` for workflow task delivery only |
| Code-evidence event consumer | Reads a queued event, validates it, performs PostgreSQL ledger readback, then ACKs; it does not create structural relations | Queue-backed verification/event path, not relation persistence |

## Outbox guarantees and limits found in source

- `outbox.ts` states workflow task and outbox rows are committed in one PostgreSQL transaction. The publisher holds row locks while publishing and marks delivery only after broker confirmation.
- A crash after broker confirmation but before the PostgreSQL commit can redeliver; the code documents an at-least-once model and requires idempotent consumers.
- Publish failures increment `attempt`; after the configured attempt threshold the row receives `failed_at`, removing it from the normal pending query. A complete operator retry/requeue procedure was not established here.
- `outbox-boot.ts` clears the publisher handle on AMQP `close`, but does not reconnect or restart the publisher. A healthy RabbitMQ container alone therefore does not prove the application publisher recovered.
- The inspected code-evidence consumer ACKs after verified readback and negatively acknowledges permanent failures without requeue. This is not evidence about graph relation consumers or their dead-letter recovery.
- Publisher confirms are present. No relation-specific publisher-confirm, consumer-ack, deduplication, or dead-letter path was found because no RabbitMQ-backed Svelte relation writer was found.

## Safety and scope

This was a source-only audit. It did not run a relation importer, query or mutate canonical relations, replay an outbox, restart RabbitMQ/TRACE, or change production services. The local proposal smoke itself writes receipt files when executed; it was not run for this audit.

## Evidence paths

- `scripts/atlas/structural-reference-producer-smoke-v1.mjs`
- `scripts/atlas/lib/structural-reference-relation-mapping-v1.mjs`
- `scripts/atlas/load-graph-ndjson.mjs`
- `scripts/atlas/ingest-all-edges-to-postgres.mjs`
- `sveltekit-frontend/src/lib/server/queue/outbox.ts`
- `sveltekit-frontend/src/lib/server/queue/outbox-boot.ts`
- `sveltekit-frontend/src/lib/server/queue/code-evidence-outbox-consumer.ts`
- `sveltekit-frontend/src/lib/server/queue/code-evidence-event-processing.ts`

## Required next proof

Before labeling the production batch path `DIRECT`, `OUTBOX_QUEUED`, or `MIXED`, identify the exact batch command/entrypoint and follow its call chain through the writer and any projection consumers. For an authorized persistence design, separately prove transaction boundary, outbox durability, idempotency key, publisher-confirm behavior, consumer ACK/DLQ handling, and recovery of failed rows. Until then, relation outputs remain proposal-only and no queue replay is warranted.

```yaml
likely_cause: The current Svelte relation producer only emits local proposal artifacts; no canonical writer is wired to it.
evidence: Producer and mapper source plus separate direct PostgreSQL importers and workflow-only outbox code.
patch_targets: []
safe_next_command: Review the exact relation batch entrypoint and its callers before selecting a persistence path.
smoke_command: Not run; this audit is source-only and does not authorize persistence.
report_path: docs/reports/svelte-relation-batch-rabbitmq-dependency-audit-2026-10-28.md
```
