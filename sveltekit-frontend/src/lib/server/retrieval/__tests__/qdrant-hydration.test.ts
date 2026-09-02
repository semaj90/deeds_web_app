import { describe, expect, it, vi, beforeEach } from 'vitest';

// @vitest-environment node

const resolveProjectionsBatchMock = vi.fn();

vi.mock('$lib/server/atlas/retrieval/projection-registry-v1.js', () => ({
  resolveProjectionsBatch: (...args: unknown[]) => resolveProjectionsBatchMock(...args),
}));

describe('hydrateCanonicalChunkIds (RF-QDRANT-HYDRATION-02)', () => {
  beforeEach(() => {
    resolveProjectionsBatchMock.mockReset();
  });

  it('attaches canonicalChunkId only when ProjectionRegistryV1 validates the point', async () => {
    const { hydrateCanonicalChunkIds } = await import('../retrieve-candidates.js');
    resolveProjectionsBatchMock.mockResolvedValue([
      {
        ok: true,
        ref: {
          executor: 'qdrant',
          collection: 'codebase_chunks_768_v2',
          vectorName: 'content',
          physicalPointId: 'point-1',
          projectionRevision: null,
          modelRevision: null,
          inputPolicyRevision: null,
        },
      },
      {
        ok: false,
        failure: { key: { canonicalPacketIdentity: 'point-2', representationIdentity: 'semantic_768' }, reason: 'CANONICAL_IDENTITY_MISMATCH' },
      },
    ]);

    const candidates: any[] = [
      { id: 'point-1', qdrantPointId: 'point-1', packetKey: 'pk-1' },
      { id: 'point-2', qdrantPointId: 'point-2', packetKey: 'pk-2' },
    ];

    await hydrateCanonicalChunkIds(candidates);

    expect(candidates[0].canonicalChunkId).toBe('point-1');
    expect(candidates[1].canonicalChunkId).toBeUndefined();
  });

  it('fails open (no candidates dropped or mutated) when ProjectionRegistryV1 throws', async () => {
    const { hydrateCanonicalChunkIds } = await import('../retrieve-candidates.js');
    resolveProjectionsBatchMock.mockRejectedValue(new Error('qdrant unreachable'));

    const candidates: any[] = [{ id: 'point-1', qdrantPointId: 'point-1', packetKey: 'pk-1' }];

    await expect(hydrateCanonicalChunkIds(candidates)).resolves.toBeUndefined();
    expect(candidates[0].canonicalChunkId).toBeUndefined();
    expect(candidates).toHaveLength(1);
  });

  it('is a no-op on an empty candidate list (never calls the registry)', async () => {
    const { hydrateCanonicalChunkIds } = await import('../retrieve-candidates.js');
    await hydrateCanonicalChunkIds([]);
    expect(resolveProjectionsBatchMock).not.toHaveBeenCalled();
  });

  it('deduplicates candidates sharing the same point id into one registry lookup', async () => {
    const { hydrateCanonicalChunkIds } = await import('../retrieve-candidates.js');
    resolveProjectionsBatchMock.mockResolvedValue([
      {
        ok: true,
        ref: {
          executor: 'qdrant',
          collection: 'codebase_chunks_768_v2',
          vectorName: 'content',
          physicalPointId: 'point-shared',
          projectionRevision: null,
          modelRevision: null,
          inputPolicyRevision: null,
        },
      },
    ]);

    const candidates: any[] = [
      { id: 'point-shared', qdrantPointId: 'point-shared', packetKey: 'pk-a' },
      { id: 'point-shared', qdrantPointId: 'point-shared', packetKey: 'pk-b' },
    ];

    await hydrateCanonicalChunkIds(candidates);

    expect(resolveProjectionsBatchMock).toHaveBeenCalledTimes(1);
    expect(resolveProjectionsBatchMock.mock.calls[0]?.[0]).toHaveLength(1);
    expect(candidates[0].canonicalChunkId).toBe('point-shared');
    expect(candidates[1].canonicalChunkId).toBe('point-shared');
  });
});
