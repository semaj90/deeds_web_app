#!/usr/bin/env node
import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { sql } from 'drizzle-orm';

import { db } from '../../src/lib/server/db/client.js';
import {
  artifactFailedEventSchema,
  artifactMaterializedEventSchema,
} from '../../src/lib/server/queue/event-fabric.js';
import {
  persistArtifactLifecycleEvent,
} from '../../src/lib/server/queue/artifact-event-processing.js';

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

const proofId = randomUUID();
const actionKey = `queue-proof:${proofId}`;
const root = await mkdtemp(path.join(tmpdir(), 'atlas-queue-lifecycle-'));
const artifactPath = path.join(root, 'artifact.bin');
const original = new TextEncoder().encode('queue-lifecycle-0001');
const corrupted = new TextEncoder().encode('queue-lifecycle-0002');

if (original.byteLength !== corrupted.byteLength) {
  throw new Error('proof fixture corruption must preserve byte length');
}

const checksum = sha256(original);
const artifact = {
  schema: 'atlas.artifact-address.v1' as const,
  artifactId: `artifact:${proofId}`,
  artifactHash: `sha256:${checksum}`,
  schemaId: 'atlas.queue-lifecycle-proof-artifact.v1',
  checksum,
  revisionSetHash: `revision-set:${sha256(new TextEncoder().encode(proofId))}`,
  revisions: {
    workspace: `proof:${proofId}`,
    producer: 'queue-lifecycle-proof:v1',
  },
  locator: {
    storage: 'MMAP' as const,
    path: artifactPath,
    byteLength: original.byteLength,
    dtype: 'u8' as const,
    shape: [original.byteLength],
  },
};

const report = {
  schema: 'atlas.queue-artifact-lifecycle-proof.v1',
  proofId,
  actionKey,
  materializedInserted: false,
  replayInserted: true,
  replayRowCount: -1,
  corruptionRejected: false,
  corruptionReason: null as string | null,
  failedInserted: false,
  failedRowCount: -1,
  status: 'NOT_PROVEN',
};

try {
  await writeFile(artifactPath, original);

  const materialized = artifactMaterializedEventSchema.parse({
    eventId: randomUUID(),
    eventType: 'artifact.materialized',
    occurredAt: new Date().toISOString(),
    schemaRevision: 'event-fabric:v1',
    payload: {
      actionKey,
      artifact,
      fencingToken: '1',
      producerRevision: 'queue-lifecycle-proof:v1',
      inputArtifactRefs: [],
      metadata: { proofId },
    },
  });

  const first = await persistArtifactLifecycleEvent(materialized);
  const replay = await persistArtifactLifecycleEvent(materialized);
  report.materializedInserted = first.inserted;
  report.replayInserted = replay.inserted;

  const materializedRows = await db.execute<{ count: string | number | bigint }>(sql`
    SELECT COUNT(*) AS count
    FROM workflow_artifact_events
    WHERE event_id = ${materialized.eventId}::uuid
  `);
  report.replayRowCount = Number(materializedRows.rows?.[0]?.count ?? -1);

  await writeFile(artifactPath, corrupted);
  const corruptReplay = artifactMaterializedEventSchema.parse({
    ...materialized,
    eventId: randomUUID(),
    occurredAt: new Date().toISOString(),
  });
  try {
    await persistArtifactLifecycleEvent(corruptReplay);
  } catch (error) {
    report.corruptionRejected = true;
    report.corruptionReason = error instanceof Error ? error.message : String(error);
  }

  const failed = artifactFailedEventSchema.parse({
    eventId: randomUUID(),
    eventType: 'artifact.failed',
    occurredAt: new Date().toISOString(),
    schemaRevision: 'event-fabric:v1',
    payload: {
      actionKey,
      expectedOutputSchema: artifact.schemaId,
      fencingToken: '1',
      producerRevision: 'queue-lifecycle-proof:v1',
      failureClass: 'IDENTITY_MISMATCH',
      retryable: false,
      errorHash: `sha256:${sha256(corrupted)}`,
      inputArtifactRefs: [],
      metadata: {
        proofId,
        retryCount: 0,
        retryBudget: 0,
        corruptionReason: report.corruptionReason,
      },
    },
  });
  const failedInsert = await persistArtifactLifecycleEvent(failed);
  report.failedInserted = failedInsert.inserted;

  const failedRows = await db.execute<{ count: string | number | bigint }>(sql`
    SELECT COUNT(*) AS count
    FROM workflow_artifact_events
    WHERE event_id = ${failed.eventId}::uuid
      AND event_type = 'artifact.failed'
  `);
  report.failedRowCount = Number(failedRows.rows?.[0]?.count ?? -1);

  const proven =
    report.materializedInserted === true &&
    report.replayInserted === false &&
    report.replayRowCount === 1 &&
    report.corruptionRejected === true &&
    report.corruptionReason?.includes('CHECKSUM_MISMATCH') === true &&
    report.failedInserted === true &&
    report.failedRowCount === 1;

  report.status = proven ? 'QUEUE_ARTIFACT_LIFECYCLE_PROVEN' : 'QUEUE_ARTIFACT_LIFECYCLE_NOT_PROVEN';
  console.log(JSON.stringify(report, null, 2));
  if (!proven) process.exitCode = 1;
} finally {
  await rm(root, { recursive: true, force: true });
}
