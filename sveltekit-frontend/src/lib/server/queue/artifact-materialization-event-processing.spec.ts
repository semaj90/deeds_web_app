import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  deriveArtifactFailureDecision,
  EventReplayGuard,
  verifyMaterializedArtifact,
} from './artifact-materialization-event-processing.js';
import {
  artifactFailedEventSchema,
  artifactMaterializedEventSchema,
} from './event-fabric.js';

const dirs: string[] = [];

async function tempFile(bytes: Buffer): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'atlas-artifact-'));
  dirs.push(dir);
  const path = join(dir, 'artifact.bin');
  await writeFile(path, bytes);
  return path;
}

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

function checksum(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function materializedEvent(path: string, bytes: Buffer) {
  return artifactMaterializedEventSchema.parse({
    eventId: '11111111-1111-4111-8111-111111111111',
    eventType: 'artifact.materialized',
    occurredAt: '2026-08-21T18:00:00.000Z',
    schemaRevision: 'queue-artifact-v1',
    payload: {
      actionKey: 'action-key-00000001',
      artifactId: 'artifact-1',
      artifactHash: checksum(bytes),
      checksum: checksum(bytes),
      revisionSetHash: 'revision-set-0001',
      storage: 'ARROW_IPC',
      locatorPath: path,
      byteLength: bytes.length,
      producer: 'artifact-materializer',
      producerRevision: 'producer-v1',
    },
  });
}

describe('artifact materialization verification', () => {
  it('proves an exact materialized file by size and SHA-256', async () => {
    const bytes = Buffer.from('candidate-feature-matrix-v1');
    const path = await tempFile(bytes);

    const result = await verifyMaterializedArtifact(materializedEvent(path, bytes));

    expect(result).toEqual({
      status: 'PROVEN',
      byteLength: bytes.length,
      checksum: checksum(bytes),
    });
  });

  it('rejects changed bytes even when the claimed checksum is unchanged', async () => {
    const expected = Buffer.from('original-artifact');
    const path = await tempFile(Buffer.from('corrupt-artifact!'));

    const result = await verifyMaterializedArtifact(materializedEvent(path, expected));

    expect(result.status).toBe('REJECTED');
    if (result.status === 'REJECTED') {
      expect(['BYTE_LENGTH_MISMATCH', 'CHECKSUM_MISMATCH']).toContain(result.reason);
    }
  });

  it('refuses to pretend Qdrant is filesystem-verified', async () => {
    const bytes = Buffer.from('irrelevant');
    const path = await tempFile(bytes);
    const event = artifactMaterializedEventSchema.parse({
      ...materializedEvent(path, bytes),
      payload: {
        ...materializedEvent(path, bytes).payload,
        storage: 'QDRANT',
        locatorPath: undefined,
      },
    });

    await expect(verifyMaterializedArtifact(event)).resolves.toEqual({
      status: 'REJECTED',
      reason: 'STORAGE_VERIFIER_UNAVAILABLE',
    });
  });
});

describe('artifact failure reuse decisions', () => {
  it('retries a retryable failure while budget remains', () => {
    const event = artifactFailedEventSchema.parse({
      eventId: '22222222-2222-4222-8222-222222222222',
      eventType: 'artifact.failed',
      occurredAt: '2026-08-21T18:00:00.000Z',
      payload: {
        actionKey: 'action-key-00000001',
        operation: 'materialize-feature-matrix',
        failureClass: 'TRANSIENT_DEPENDENCY',
        retryable: true,
        retryCount: 1,
        retryBudget: 3,
        errorHash: 'error-hash-1',
        inputArtifactRefs: [],
      },
    });

    expect(deriveArtifactFailureDecision(event)).toBe('RETRY');
  });

  it('selects an alternative for a permanent or exhausted failure', () => {
    const event = artifactFailedEventSchema.parse({
      eventId: '33333333-3333-4333-8333-333333333333',
      eventType: 'artifact.failed',
      occurredAt: '2026-08-21T18:00:00.000Z',
      payload: {
        actionKey: 'action-key-00000001',
        operation: 'materialize-feature-matrix',
        failureClass: 'SCHEMA_REJECTED',
        retryable: false,
        retryCount: 0,
        retryBudget: 0,
        errorHash: 'error-hash-2',
        inputArtifactRefs: [],
      },
    });

    expect(deriveArtifactFailureDecision(event)).toBe('SELECT_ALTERNATIVE');
  });
});

describe('event replay guard', () => {
  it('recognizes a repeated event occurrence and remains bounded', () => {
    const guard = new EventReplayGuard(2);
    guard.mark('e1');
    guard.mark('e2');
    expect(guard.has('e1')).toBe(true);

    guard.mark('e3');
    expect(guard.has('e1')).toBe(false);
    expect(guard.has('e2')).toBe(true);
    expect(guard.has('e3')).toBe(true);
  });
});
