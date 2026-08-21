import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  artifactFailedEventSchema,
  artifactMaterializedEventSchema,
} from './event-fabric.js';
import {
  EventReplayGuard,
  projectArtifactFailure,
  verifyArtifactMaterialization,
} from './artifact-materialization-event-processing.js';

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

async function fixtureFile(bytes = Buffer.from('parent-atlas-artifact\n')) {
  const dir = await mkdtemp(join(tmpdir(), 'atlas-artifact-'));
  dirs.push(dir);
  const path = join(dir, 'artifact.bin');
  await writeFile(path, bytes);
  return { path, bytes, checksum: sha256(bytes) };
}

function materializedEvent(input: { path?: string; checksum?: string; byteLength?: number; storage?: 'FILESYSTEM' | 'ARROW_MMAP' | 'QDRANT' }) {
  return artifactMaterializedEventSchema.parse({
    eventId: '11111111-1111-4111-8111-111111111111',
    eventSource: 'proof:queue-artifact',
    eventType: 'artifact.materialized',
    occurredAt: '2026-08-21T18:00:00.000Z',
    payload: {
      actionKey: 'action:materialize:fixture',
      artifactId: 'artifact:fixture',
      artifactHash: 'sha256:fixture-artifact-hash',
      checksum: input.checksum ?? '0'.repeat(64),
      revisionSetHash: 'revision-set:fixture:0001',
      storage: input.storage ?? 'FILESYSTEM',
      locatorPath: input.path,
      byteLength: input.byteLength,
      producer: 'fixture-materializer',
      producerRevision: 'fixture-materializer.v1',
    },
  });
}

describe('artifact materialization lifecycle', () => {
  it('verifies filesystem bytes, byte length, and checksum', async () => {
    const fixture = await fixtureFile();
    const receipt = await verifyArtifactMaterialization(materializedEvent({
      path: fixture.path,
      checksum: fixture.checksum,
      byteLength: fixture.bytes.length,
    }));
    expect(receipt.status).toBe('VERIFIED');
    expect(receipt.gates.ARTIFACT_EXISTS).toBe(true);
    expect(receipt.gates.ARTIFACT_IS_FILE).toBe(true);
    expect(receipt.gates.BYTE_LENGTH_MATCH).toBe(true);
    expect(receipt.gates.CHECKSUM_MATCH).toBe(true);
    expect(receipt.actualChecksum).toBe(fixture.checksum);
    expect(receipt.eventCreatesArtifact).toBe(false);
  });

  it('rejects corrupt bytes even when the path and size are valid', async () => {
    const good = Buffer.from('AAAAAAAA');
    const corrupt = Buffer.from('BBBBBBBB');
    const fixture = await fixtureFile(corrupt);
    const receipt = await verifyArtifactMaterialization(materializedEvent({
      path: fixture.path,
      checksum: sha256(good),
      byteLength: corrupt.length,
    }));
    expect(receipt.status).toBe('FAILED');
    expect(receipt.reasonCodes).toEqual(['CHECKSUM_MISMATCH']);
    expect(receipt.gates.BYTE_LENGTH_MATCH).toBe(true);
    expect(receipt.gates.CHECKSUM_MATCH).toBe(false);
  });

  it('does not pretend filesystem verification proves Qdrant storage', async () => {
    const receipt = await verifyArtifactMaterialization(materializedEvent({ storage: 'QDRANT' }));
    expect(receipt.status).toBe('NOT_PROVEN');
    expect(receipt.reasonCodes).toEqual(['STORAGE_VERIFIER_NOT_IMPLEMENTED:QDRANT']);
  });

  it('treats eventSource + eventId as immutable replay occurrence identity', () => {
    const guard = new EventReplayGuard();
    const event = { eventSource: 'proof:queue-artifact', eventId: '11111111-1111-4111-8111-111111111111' };
    expect(guard.accept(event)).toBe(true);
    expect(guard.accept(event)).toBe(false);
    expect(guard.size()).toBe(1);
    expect(guard.accept({ ...event, eventSource: 'proof:other-source' })).toBe(true);
  });

  it('projects retryable failures into retry policy without marking success reusable', () => {
    const event = artifactFailedEventSchema.parse({
      eventId: '22222222-2222-4222-8222-222222222222',
      eventSource: 'proof:queue-artifact',
      eventType: 'artifact.failed',
      occurredAt: '2026-08-21T18:00:00.000Z',
      payload: {
        actionKey: 'action:materialize:fixture',
        operation: 'materialize',
        failureClass: 'TRANSIENT_DEPENDENCY',
        retryable: true,
        retryCount: 1,
        retryBudget: 3,
        errorHash: 'sha256:error',
        revisionSetHash: 'revision-set:fixture:0001',
        producer: 'fixture-materializer',
        producerRevision: 'fixture-materializer.v1',
      },
    });
    const projection = projectArtifactFailure(event);
    expect(projection.reuseDecision).toBe('RETRY');
    expect(projection.resultReusableAsSuccess).toBe(false);
  });

  it('selects an alternative for non-retryable repeated failure', () => {
    const event = artifactFailedEventSchema.parse({
      eventId: '33333333-3333-4333-8333-333333333333',
      eventSource: 'proof:queue-artifact',
      eventType: 'artifact.failed',
      occurredAt: '2026-08-21T18:00:00.000Z',
      payload: {
        actionKey: 'action:materialize:fixture',
        operation: 'materialize',
        failureClass: 'SCHEMA_REJECTED',
        retryable: false,
        retryCount: 1,
        retryBudget: 3,
        errorHash: 'sha256:same-error',
        revisionSetHash: 'revision-set:fixture:0001',
        producer: 'fixture-materializer',
        producerRevision: 'fixture-materializer.v1',
      },
    });
    expect(projectArtifactFailure(event).reuseDecision).toBe('SELECT_ALTERNATIVE');
  });
});
