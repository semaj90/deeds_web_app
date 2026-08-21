import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  artifactFailedEventSchema,
  artifactMaterializedEventSchema,
  createDefaultEventFabricHandlers,
} from '../../src/lib/server/queue/event-fabric.js';
import {
  EventReplayGuard,
  projectArtifactFailure,
  verifyArtifactMaterialization,
} from '../../src/lib/server/queue/artifact-materialization-event-processing.js';
import { dispatchEventFabricEvent } from '../../src/lib/server/workers/code-evidence-projection-worker.js';

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

async function main() {
  const dir = await mkdtemp(join(tmpdir(), 'atlas-queue-artifact-proof-'));
  const artifactPath = join(dir, 'artifact.bin');
  const goodBytes = Buffer.from('parent-atlas-queue-artifact-proof-v1\n');
  const corruptBytes = Buffer.from(goodBytes.map((byte, index) => index === 0 ? byte ^ 1 : byte));
  const expectedChecksum = sha256(goodBytes);
  const replay = new EventReplayGuard();
  const counters = { materialized: 0, failed: 0 };

  try {
    await writeFile(artifactPath, goodBytes);
    const materialized = artifactMaterializedEventSchema.parse({
      eventId: '44444444-4444-4444-8444-444444444444',
      eventSource: 'proof:queue-artifact-lifecycle',
      eventType: 'artifact.materialized',
      occurredAt: '2026-08-21T18:00:00.000Z',
      traceId: 'queue-artifact-proof-v1',
      payload: {
        actionKey: 'action:queue-artifact-proof',
        artifactId: 'artifact:queue-artifact-proof',
        artifactHash: `sha256:${expectedChecksum}`,
        checksum: expectedChecksum,
        checksumAlgorithm: 'sha256',
        revisionSetHash: 'revision-set:queue-artifact-proof:v1',
        storage: 'FILESYSTEM',
        locatorPath: artifactPath,
        byteLength: goodBytes.length,
        producer: 'prove-queue-artifact-lifecycle.mts',
        producerRevision: 'proof-v1',
      },
    });

    const handlers = createDefaultEventFabricHandlers();
    handlers['artifact.materialized'] = async (event) => {
      const receipt = await verifyArtifactMaterialization(event);
      if (receipt.status !== 'VERIFIED') throw new Error(`VERIFY_FAILED:${receipt.reasonCodes.join(',')}`);
      counters.materialized += 1;
    };
    handlers['artifact.failed'] = async () => { counters.failed += 1; };

    const goodReceipt = await verifyArtifactMaterialization(materialized);
    if (goodReceipt.status !== 'VERIFIED') throw new Error(`GOOD_ARTIFACT_NOT_VERIFIED:${goodReceipt.reasonCodes.join(',')}`);

    const firstAccepted = replay.accept(materialized);
    if (firstAccepted) await dispatchEventFabricEvent(materialized, handlers);
    const replayAccepted = replay.accept(materialized);
    if (replayAccepted) await dispatchEventFabricEvent(materialized, handlers);

    await writeFile(artifactPath, corruptBytes);
    const corruptReceipt = await verifyArtifactMaterialization(materialized);

    const failed = artifactFailedEventSchema.parse({
      eventId: '55555555-5555-4555-8555-555555555555',
      eventSource: 'proof:queue-artifact-lifecycle',
      eventType: 'artifact.failed',
      occurredAt: '2026-08-21T18:00:01.000Z',
      traceId: 'queue-artifact-proof-v1',
      payload: {
        actionKey: 'action:queue-artifact-proof',
        operation: 'materialize',
        failureClass: 'STALE_ARTIFACT',
        retryable: false,
        retryCount: 1,
        retryBudget: 3,
        errorHash: `sha256:${sha256(Buffer.from('checksum mismatch'))}`,
        revisionSetHash: 'revision-set:queue-artifact-proof:v1',
        producer: 'prove-queue-artifact-lifecycle.mts',
        producerRevision: 'proof-v1',
        inputArtifactRefs: ['artifact:queue-artifact-proof'],
      },
    });
    const failureProjection = projectArtifactFailure(failed);
    await dispatchEventFabricEvent(failed, handlers);

    const receipt = {
      schema: 'atlas.queue-artifact-lifecycle-proof.v1',
      status:
        goodReceipt.status === 'VERIFIED'
        && firstAccepted
        && !replayAccepted
        && counters.materialized === 1
        && corruptReceipt.status === 'FAILED'
        && corruptReceipt.reasonCodes.includes('CHECKSUM_MISMATCH')
        && failureProjection.reuseDecision === 'SELECT_ALTERNATIVE'
        && failureProjection.resultReusableAsSuccess === false
        ? 'PROVEN'
        : 'FAILED',
      gates: {
        QUEUE_05_ARTIFACT_MATERIALIZED_SCHEMA: true,
        QUEUE_06_ARTIFACT_FAILED_SCHEMA: true,
        QUEUE_07_ARTIFACT_EXISTS: goodReceipt.gates.ARTIFACT_EXISTS,
        QUEUE_07_ARTIFACT_IS_FILE: goodReceipt.gates.ARTIFACT_IS_FILE,
        QUEUE_07_BYTE_LENGTH_MATCH: goodReceipt.gates.BYTE_LENGTH_MATCH,
        QUEUE_07_CHECKSUM_MATCH: goodReceipt.gates.CHECKSUM_MATCH,
        QUEUE_07_PRODUCER_REVISION_PRESENT: goodReceipt.gates.PRODUCER_REVISION_PRESENT,
        QUEUE_07_ACTION_KEY_PRESENT: goodReceipt.gates.ACTION_KEY_PRESENT,
        QUEUE_07_REVISION_SET_HASH_PRESENT: goodReceipt.gates.REVISION_SET_HASH_PRESENT,
        QUEUE_08_EVENT_REPLAY_IDEMPOTENT: firstAccepted && !replayAccepted && counters.materialized === 1,
        QUEUE_09_FAILURE_STATE_PROJECTED: counters.failed === 1 && failureProjection.resultReusableAsSuccess === false,
        QUEUE_10_CORRUPT_COPY_REJECTED: corruptReceipt.status === 'FAILED' && corruptReceipt.reasonCodes.includes('CHECKSUM_MISMATCH'),
      },
      goodArtifact: {
        checksum: goodReceipt.actualChecksum,
        byteLength: goodReceipt.actualByteLength,
      },
      corruptArtifact: {
        checksum: corruptReceipt.actualChecksum,
        reasonCodes: corruptReceipt.reasonCodes,
      },
      replay: {
        eventSource: materialized.eventSource,
        eventId: materialized.eventId,
        firstAccepted,
        replayAccepted,
        materializedProjectionCount: counters.materialized,
      },
      failureProjection,
      durableQueueUsed: false,
      postgresWritesAttempted: false,
      qdrantWritesAttempted: false,
      valkeyWritesAttempted: false,
      canonicalWritesAllowed: false,
    };

    console.log(JSON.stringify(receipt, null, 2));
    if (receipt.status !== 'PROVEN') process.exitCode = 1;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

await main();
