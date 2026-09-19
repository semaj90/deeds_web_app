import { beforeEach, describe, expect, it, vi } from 'vitest';

const { query, getQdrantClient, embedSemantic768 } = vi.hoisted(() => {
  const query = vi.fn();
  const getQdrantClient = vi.fn(() => ({ query }));
  const embedSemantic768 = vi.fn(async () => ({
    vector: Float32Array.from(Array.from({ length: 768 }, (_, index) => index === 0 ? 1 : 0)),
    model: 'embeddinggemma:test',
    cached: false,
    exec_ms: 1,
  }));
  return { query, getQdrantClient, embedSemantic768 };
});

vi.mock('$lib/server/vector/qdrant-singleton.js', () => ({ getQdrantClient }));
vi.mock('./semantic-768.js', () => ({ embedSemantic768 }));

import { scoreQdrantSemanticCandidatesV1 } from './qdrant-semantic-scorer.js';

function vector(index: number): number[] {
  return Array.from({ length: 768 }, (_, position) => position === index ? 1 : 0);
}

function point(packetKey: string, sourceRevision: string | null, projectionRevision = 'projection:test:v1') {
  return {
    id: `qdrant:${packetKey}`,
    score: 0.9,
    vector: vector(0),
    payload: {
      packet_key: packetKey,
      source_ref: `src/${packetKey}.ts`,
      source_revision: sourceRevision,
      projection_revision: projectionRevision,
    },
  };
}

describe('Qdrant semantic_768 manifest boundary', () => {
  beforeEach(() => {
    query.mockReset();
    embedSemantic768.mockClear();
  });

  it('fails closed when Qdrant payloads lack canonical source revisions', async () => {
    query.mockResolvedValue({ points: [point('packet:a', null)] });
    const receipt = await scoreQdrantSemanticCandidatesV1('find packet a', ['packet:a'], 1);
    expect(receipt.manifestStatus).toBe('BLOCKED_SOURCE_REVISION_AUTHORITY');
    expect(receipt.identityManifestChecksum).toBeNull();
    expect(receipt.matrixChecksum).toBeNull();
  });

  it('emits a manifest for a single qualified returned projection', async () => {
    query.mockResolvedValue({ points: [point('packet:a', 'sha256:source-a')] });
    const receipt = await scoreQdrantSemanticCandidatesV1('find packet a', ['packet:a'], 1);
    expect(receipt.manifestStatus).toBe('PROVEN_FOR_RETURNED_PROJECTION');
    expect(receipt.identityManifestChecksum).toMatch(/^[a-f0-9]{64}$/);
    expect(receipt.matrixChecksum).toMatch(/^[a-f0-9]{64}$/);
  });
});
