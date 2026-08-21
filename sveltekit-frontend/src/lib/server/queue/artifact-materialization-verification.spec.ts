import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { verifyArtifactMaterialization } from './artifact-materialization-verification.js';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function address(filePath: string, bytes: Uint8Array, byteLength = bytes.byteLength) {
  return {
    schema: 'atlas.artifact-address.v1' as const,
    artifactId: 'artifact:test:queue07',
    artifactHash: `sha256:${sha256(bytes)}`,
    schemaId: 'atlas.test-artifact.v1',
    checksum: sha256(bytes),
    revisionSetHash: 'revision-set:0123456789abcdef',
    revisions: { workspace: 'workspace:test' },
    locator: {
      storage: 'MMAP' as const,
      path: filePath,
      byteLength,
      dtype: 'u8' as const,
      shape: [bytes.byteLength],
    },
  };
}

async function fixture(bytes = new TextEncoder().encode('queue-artifact-proof')) {
  const root = await mkdtemp(path.join(tmpdir(), 'atlas-queue-artifact-'));
  roots.push(root);
  const filePath = path.join(root, 'artifact.bin');
  await writeFile(filePath, bytes);
  return { bytes, filePath };
}

describe('verifyArtifactMaterialization', () => {
  it('proves a checksummed file-backed artifact', async () => {
    const { bytes, filePath } = await fixture();
    const result = await verifyArtifactMaterialization({
      actionKey: 'action:0123456789abcdef',
      producerRevision: 'producer:v1',
      artifact: address(filePath, bytes),
    });

    expect(result.status).toBe('PROVEN');
    expect(result.gates).toMatchObject({
      ACTION_KEY_PRESENT: true,
      PRODUCER_REVISION_PRESENT: true,
      REVISION_SET_HASH_PRESENT: true,
      ARTIFACT_EXISTS: true,
      ARTIFACT_IS_FILE: true,
      BYTE_LENGTH_MATCH: true,
      CHECKSUM_MATCH: true,
      STORAGE_VERIFIER_AVAILABLE: true,
    });
  });

  it('rejects checksum drift instead of trusting stat()', async () => {
    const { bytes, filePath } = await fixture();
    const artifact = address(filePath, bytes);
    await writeFile(filePath, new TextEncoder().encode('corrupted-queue-artifact'));

    const result = await verifyArtifactMaterialization({
      actionKey: 'action:0123456789abcdef',
      producerRevision: 'producer:v1',
      artifact,
    });

    expect(result.status).toBe('REJECTED');
    expect(result.reason).toBe('BYTE_LENGTH_MISMATCH');
  });

  it('rejects equal-length corruption by checksum', async () => {
    const bytes = new TextEncoder().encode('abcdefgh');
    const { filePath } = await fixture(bytes);
    const artifact = address(filePath, bytes);
    await writeFile(filePath, new TextEncoder().encode('abcdEfgh'));

    const result = await verifyArtifactMaterialization({
      actionKey: 'action:0123456789abcdef',
      producerRevision: 'producer:v1',
      artifact,
    });

    expect(result.status).toBe('REJECTED');
    expect(result.reason).toBe('CHECKSUM_MISMATCH');
    expect(result.gates.BYTE_LENGTH_MATCH).toBe(true);
    expect(result.gates.CHECKSUM_MATCH).toBe(false);
  });

  it('fails closed for storage without a verifier', async () => {
    const result = await verifyArtifactMaterialization({
      actionKey: 'action:0123456789abcdef',
      producerRevision: 'producer:v1',
      artifact: {
        schema: 'atlas.artifact-address.v1',
        artifactId: 'artifact:qdrant:test',
        artifactHash: 'artifact-hash:0123456789abcdef',
        schemaId: 'atlas.test-artifact.v1',
        checksum: 'checksum:0123456789abcdef',
        revisionSetHash: 'revision-set:0123456789abcdef',
        revisions: { workspace: 'workspace:test' },
        locator: { storage: 'QDRANT', collection: 'test', pointId: '1' },
      },
    });

    expect(result.status).toBe('NOT_PROVEN');
    expect(result.reason).toBe('STORAGE_VERIFIER_NOT_IMPLEMENTED:QDRANT');
    expect(result.gates.STORAGE_VERIFIER_AVAILABLE).toBe(false);
  });
});
