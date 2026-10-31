import { beforeEach, describe, expect, it, vi } from 'vitest';
import { syncSummaryPayloadToQdrant } from './qdrant-summary-sync.js';

const setPayload = vi.fn();
const scroll = vi.fn();
const retrieve = vi.fn();
const getCollections = vi.fn();

vi.mock('$lib/server/vector/qdrant-manager.js', () => ({
  getQdrantManager: () => ({
    getCollections,
    client: {
      scroll,
      setPayload,
      retrieve,
    },
  }),
}));

describe('qdrant-summary-sync', () => {
  beforeEach(() => {
    setPayload.mockReset();
    scroll.mockReset();
    retrieve.mockReset();
    getCollections.mockReset();
  });

  it('resolves the canonical hybrid collection and syncs all packet_key matches', async () => {
    getCollections.mockResolvedValue({
      collections: [
        { name: 'codebase_chunks_768_v2' },
        { name: 'codebase_chunks_768' },
        { name: 'codebase_chunks_384_hybrid' },
      ],
    });
    scroll.mockResolvedValue({
      points: [
        { id: 'point-1' },
        { id: 'point-2' },
      ],
    });
    setPayload.mockResolvedValue({});
    retrieve.mockImplementation(async (_collection, options) => options.ids.map((id) => ({
      id,
      payload: {
        ...setPayload.mock.calls.at(-1)?.[1].payload,
        packet_key: 'packet:auth:001',
        source_revision: `sha256:${'a'.repeat(64)}`,
        content_hash: `sha256:${'b'.repeat(64)}`,
      },
    })));

    const result = await syncSummaryPayloadToQdrant({
      packetKey: 'packet:auth:001',
      sourceRevision: `sha256:${'a'.repeat(64)}`,
      contentHash: `sha256:${'b'.repeat(64)}`,
      payload: {
        summary: 'Updated summary',
        source_ref: 'src/lib/server/auth.ts',
      },
    });

    expect(result.collection).toBe('codebase_chunks_768_v2');
    expect(result.updatedPoints).toBe(2);
    expect(scroll).toHaveBeenCalledTimes(1);
    expect(scroll).toHaveBeenCalledWith('codebase_chunks_768_v2', expect.objectContaining({ limit: 51 }));
    expect(setPayload).toHaveBeenCalledTimes(1);
    expect(setPayload).toHaveBeenCalledWith('codebase_chunks_768_v2', expect.objectContaining({ wait: true }));
    expect(retrieve).toHaveBeenCalledWith('codebase_chunks_768_v2', {
      ids: ['point-1', 'point-2'],
      with_payload: true,
      with_vector: false,
    });
    expect(setPayload).toHaveBeenCalledWith(
      'codebase_chunks_768_v2',
      expect.objectContaining({
        points: ['point-1', 'point-2'],
        payload: expect.objectContaining({
          packet_key: 'packet:auth:001',
          summary: 'Updated summary',
          source_ref: 'src/lib/server/auth.ts',
          qdrant_synced_at: expect.any(String),
        }),
      }),
    );
  });

  it('restricts a provided qdrantPointId to its exact revision', async () => {
    getCollections.mockResolvedValue({ collections: [{ name: 'codebase_chunks_768_v2' }] });
    scroll.mockResolvedValue({ points: [{ id: 'point-abc' }] });
    setPayload.mockResolvedValue({});
    retrieve.mockImplementation(async (_collection, options) => options.ids.map((id) => ({
      id,
      payload: {
        ...setPayload.mock.calls.at(-1)?.[1].payload,
        packet_key: 'packet:auth:002',
        source_revision: `sha256:${'c'.repeat(64)}`,
        content_hash: `sha256:${'d'.repeat(64)}`,
      },
    })));

    const result = await syncSummaryPayloadToQdrant({
      packetKey: 'packet:auth:002',
      sourceRevision: `sha256:${'c'.repeat(64)}`,
      contentHash: `sha256:${'d'.repeat(64)}`,
      qdrantPointId: 'point-abc',
      collection: 'codebase_chunks_768_v2',
      payload: {
        summary: 'Point-specific update',
      },
    });

    expect(result.collection).toBe('codebase_chunks_768_v2');
    expect(result.updatedPoints).toBe(1);
    expect(scroll).toHaveBeenCalledWith('codebase_chunks_768_v2', expect.objectContaining({
      filter: expect.objectContaining({ has_id: ['point-abc'] }),
    }));
    expect(setPayload).toHaveBeenCalledTimes(1);
    expect(retrieve).toHaveBeenCalledTimes(1);
    expect(setPayload).toHaveBeenCalledWith(
      'codebase_chunks_768_v2',
      expect.objectContaining({
        points: ['point-abc'],
        payload: expect.objectContaining({
          packet_key: 'packet:auth:002',
          summary: 'Point-specific update',
        }),
      }),
    );
  });

  it('does not update a point when the requested revision has no matching payload', async () => {
    getCollections.mockResolvedValue({ collections: [{ name: 'codebase_chunks_768_v2' }] });
    scroll.mockResolvedValue({ points: [] });

    const result = await syncSummaryPayloadToQdrant({
      packetKey: 'packet:auth:stale',
      sourceRevision: `sha256:${'e'.repeat(64)}`,
      contentHash: `sha256:${'f'.repeat(64)}`,
      payload: { summary: 'stale summary' },
    });

    expect(result.updatedPoints).toBe(0);
    expect(setPayload).not.toHaveBeenCalled();
    expect(retrieve).not.toHaveBeenCalled();
  });

  it('rejects a payload update when independent point readback disagrees', async () => {
    getCollections.mockResolvedValue({ collections: [{ name: 'codebase_chunks_768_v2' }] });
    scroll.mockResolvedValue({ points: [{ id: 'point-readback' }] });
    setPayload.mockResolvedValue({});
    retrieve.mockResolvedValue([{
      id: 'point-readback',
      payload: {
        packet_key: 'packet:wrong',
        source_revision: `sha256:${'a'.repeat(64)}`,
        content_hash: `sha256:${'b'.repeat(64)}`,
        summary: 'wrong summary',
      },
    }]);

    await expect(syncSummaryPayloadToQdrant({
      packetKey: 'packet:auth:003',
      sourceRevision: `sha256:${'a'.repeat(64)}`,
      contentHash: `sha256:${'b'.repeat(64)}`,
      payload: { summary: 'expected summary' },
    })).rejects.toThrow('QDRANT_SUMMARY_READBACK_MISMATCH:point-readback');
  });

  it('rejects a partial point readback after updating multiple matches', async () => {
    getCollections.mockResolvedValue({ collections: [{ name: 'codebase_chunks_768_v2' }] });
    scroll.mockResolvedValue({ points: [{ id: 'point-1' }, { id: 'point-2' }] });
    setPayload.mockResolvedValue({});
    retrieve.mockResolvedValue([{ id: 'point-1', payload: {} }]);

    await expect(syncSummaryPayloadToQdrant({
      packetKey: 'packet:auth:004',
      sourceRevision: `sha256:${'a'.repeat(64)}`,
      contentHash: `sha256:${'b'.repeat(64)}`,
      payload: { summary: 'expected summary' },
    })).rejects.toThrow('QDRANT_SUMMARY_READBACK_COUNT_MISMATCH:1:2');
  });

  it('rejects cohorts over the per-operation bound without mutating Qdrant', async () => {
    getCollections.mockResolvedValue({ collections: [{ name: 'codebase_chunks_768_v2' }] });
    scroll.mockResolvedValue({ points: Array.from({ length: 51 }, (_, index) => ({ id: `point-${index}` })) });

    await expect(syncSummaryPayloadToQdrant({
      packetKey: 'packet:auth:005',
      sourceRevision: `sha256:${'a'.repeat(64)}`,
      contentHash: `sha256:${'b'.repeat(64)}`,
      payload: { summary: 'bounded summary' },
    })).rejects.toThrow('QDRANT_SUMMARY_MATCH_LIMIT_EXCEEDED:51:50');

    expect(setPayload).not.toHaveBeenCalled();
    expect(retrieve).not.toHaveBeenCalled();
  });
});
