# Parent Atlas queue artifact lifecycle — proof tasks

Status date: 2026-08-21

This change completes the bounded artifact-lifecycle tranche before Arrow/FEAT work.
The event fabric transports observations about artifact-producing actions; it does
not own artifact bytes, canonical identity, or artifact truth.

## Ownership invariants

- Artifact bytes remain owned by their storage/materializer.
- `artifact.materialized` is an observation after storage-specific verification.
- `artifact.failed` is procedural failure evidence, not a success artifact.
- `eventSource + eventId` is immutable event-occurrence identity for replay detection.
- `actionKey`, `artifactId`, and `artifactHash` are domain identities, not event IDs.
- The queue must not mint canonical artifact identity or become an artifact registry.
- PostgreSQL/Qdrant/Valkey writes are outside this tranche.

## QUEUE-05 — ArtifactMaterializedEventV1

- [x] Register `artifact.materialized` in `eventFabricTypeSchema`.
- [x] Require `actionKey`, `artifactId`, `artifactHash`, SHA-256 `checksum`,
  `revisionSetHash`, storage kind, producer and producer revision.
- [x] Require locator path for filesystem/Arrow-mmap artifacts.
- [ ] Execute schema/unit tests.

## QUEUE-06 — ArtifactFailedEventV1

- [x] Register `artifact.failed` in `eventFabricTypeSchema`.
- [x] Require action/operation/failure/retry/error/revision/producer lineage.
- [x] Keep failed results non-reusable as success.
- [ ] Execute schema/unit tests.

## QUEUE-07 — materialization verification

Required proof gates:

- [x] `ACTION_KEY_PRESENT`.
- [x] `REVISION_SET_HASH_PRESENT`.
- [x] `PRODUCER_REVISION_PRESENT`.
- [x] `ARTIFACT_EXISTS` for filesystem/Arrow-mmap.
- [x] `ARTIFACT_IS_FILE` for filesystem/Arrow-mmap.
- [x] `BYTE_LENGTH_MATCH` when declared.
- [x] `CHECKSUM_MATCH` using streamed SHA-256 over materialized bytes.
- [x] Non-filesystem storage is `NOT_PROVEN` until a storage-specific verifier exists.
- [x] `artifact.materialized` event never creates the artifact.
- [ ] Execute focused tests.

## QUEUE-08 — idempotent replay

- [x] Add replay guard keyed by `eventSource + eventId`.
- [x] Duplicate artifact event delivery is suppressed before projection/analytics.
- [x] Domain identities do not substitute for event occurrence identity.
- [ ] Execute duplicate replay fixture.
- [ ] Durable cross-process replay persistence remains a later transport concern;
  this tranche proves consumer semantics within one worker lifetime.

## QUEUE-09 — failure-state projection

- [x] Project `artifact.failed` into procedural retry guidance.
- [x] Retryable + remaining budget -> `RETRY`.
- [x] Non-retryable -> `SELECT_ALTERNATIVE`.
- [x] Retry budget exhausted -> `STOP_RETRY_BUDGET_EXHAUSTED`.
- [x] Failed artifact result can never be reused as success.
- [ ] Bind this projection to the durable temporal action ledger after the bounded
  queue lifecycle proof passes.

## QUEUE-10 — bounded artifact lifecycle receipt

- [x] Add `scripts/atlas/prove-queue-artifact-lifecycle.mts`.
- [x] Create a temporary local artifact.
- [x] Verify path/file/size/SHA-256.
- [x] Dispatch the materialized event through the event-fabric dispatcher.
- [x] Replay the same event occurrence and prove only one materialized projection.
- [x] Corrupt a same-size copy and prove checksum verification fails.
- [x] Dispatch a failure event and prove no reusable SUCCESS state.
- [x] No RabbitMQ/Postgres/Qdrant/Valkey/canonical writes are required.
- [ ] Execute the proof script and require `status=PROVEN`.

## Deferred until QUEUE-10 runtime proof

- [ ] FEAT-01 Arrow IPC feature artifact contract.
- [ ] FEAT-02 write/read/checksum/mmap proof.
- [ ] FEAT-03 CandidateOrdinalMapV1 roundtrip through Arrow.
- [ ] FEAT-04 CPU materializer proof.
- [ ] GPU-FE-01 LibTorch/N-API materializer.
- [ ] GPU-FE-02 CPU/GPU parity receipt.
- [ ] Storage-specific Qdrant/Postgres/TurboVec artifact verifiers.

## Validation

```bash
cd sveltekit-frontend
npx vitest run src/lib/server/queue/artifact-materialization-event-processing.spec.ts
npx tsx scripts/atlas/prove-queue-artifact-lifecycle.mts
```

Expected proof result:

```text
status = PROVEN
QUEUE_07_CHECKSUM_MATCH = true
QUEUE_08_EVENT_REPLAY_IDEMPOTENT = true
QUEUE_09_FAILURE_STATE_PROJECTED = true
QUEUE_10_CORRUPT_COPY_REJECTED = true
```
