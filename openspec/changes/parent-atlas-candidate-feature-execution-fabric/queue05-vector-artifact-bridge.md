# QUEUE-05 vector artifact bridge — bounded tranche

Status: **IMPLEMENTED_UNPROVEN / PRODUCER-CONSUMER WIRING OPEN**

## Ownership

This tranche does not create a vector, queue, artifact, or Qdrant owner.

```text
embedding producer
  -> materializeLegacyVectorArtifact()
  -> workflow_artifacts (immutable checksum/revision-qualified artifact)
  -> VectorArtifactQueueEnvelopeV1 (reference only)
  -> consumer resolves + verifies artifact
  -> existing Qdrant mutation owner
```

`ArtifactAddressV1` and `workflow_artifacts` remain the artifact-address and durable artifact owners. The compatibility bridge only removes large vectors from the broker envelope.

## Implemented

- [x] `vector-artifact-transport-v1.ts` defines a strict reference-only queue envelope.
- [x] Producer bridge materializes the complete vector using the existing Postgres JSON artifact owner.
- [x] Consumer bridge resolves the existing artifact and requires checksum/revision-set verification through `readLegacyVectorArtifact()`.
- [x] Envelope `documentId` and `collection` must agree with the materialized payload or resolution fails closed.
- [x] Unit fixtures prove the envelope contains no `embedding` or `vector` field.
- [x] Unit fixture proves the vector is materialized producer-side and only reconstructed consumer-side.
- [x] Add opt-in live proof `prove-queue05-vector-artifact-bridge.mts`.
- [x] Live proof performs no Qdrant mutation.

## Still open before QUEUE-05 may close

- [ ] Switch `rabbitmq-manager-fixed.ts::handleDocumentEmbedding()` from publishing `embedding[]` to `VectorArtifactQueueEnvelopeV1`.
- [ ] Switch the corresponding `handleVectorIndex()` consumer to resolve and verify the artifact before the existing Qdrant upsert.
- [ ] Switch `queue-worker.ts::DocumentEmbedWorker` / `dispatchOrExecuteInline('vector.index', ...)` broker path to a reference-only envelope.
- [ ] Switch `VectorIndexWorker` to accept/resolve that envelope; inline fallback may continue to pass an in-process vector because it does not cross RabbitMQ, but broker publication must not.
- [ ] Re-run `audit-queue-large-payloads.mts` and require zero unclassified vector-array broker routes for the two documented QUEUE-05 chains.
- [ ] Benchmark message bytes before/after and record end-to-end latency.
- [ ] Verify artifact checksum/revision-set immediately before the Qdrant mutation boundary.

## Workstation validation

```text
cd C:\Users\james\Videos\deeds_web_app\sveltekit-frontend
npx vitest run src/lib/server/queue/vector-artifact-transport-v1.spec.ts

$env:ATLAS_QUEUE05_VECTOR_ARTIFACT_PROOF='1'
npx tsx scripts/atlas/prove-queue05-vector-artifact-bridge.mts
Remove-Item Env:ATLAS_QUEUE05_VECTOR_ARTIFACT_PROOF
```

Expected live receipt:

```text
QUEUE05_VECTOR_ARTIFACT_BRIDGE_PROVEN
referenceOnlyEnvelope=true
checksumReadbackVerified=true
qdrantMutationAttempted=false
producerConsumerWiringProven=false
```

Do not mark QUEUE-05 complete from this receipt. It proves the compatibility substrate; the two live raw-vector broker paths still have to be rewired and re-audited.
