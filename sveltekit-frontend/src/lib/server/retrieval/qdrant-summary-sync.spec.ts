import { beforeEach, describe, expect, it, vi } from 'vitest';
import { syncSummaryPayloadToQdrant } from './qdrant-summary-sync.js';

const setPayload = vi.fn();
const scroll = vi.fn();
const getCollections = vi.fn();

vi.mock('$lib/server/vector/qdrant-manager.js', () => ({
  getQdrantManager: () => ({
    getCollections,
    client: {
      scroll,
      setPayload,
    },
  }),
}));

describe('qdrant-summary-sync', () => {
  beforeEach(() => {
    setPayload.mockReset();
    scroll.mockReset();
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
    expect(setPayload).toHaveBeenCalledTimes(1);
    expect(setPayload).toHaveBeenCalledWith(
      'codebase_chunks_768_v2',
      expect.objectContaining({
        filter: expect.objectContaining({
          must: expect.arrayContaining([
            { key: 'packet_key', match: { value: 'packet:auth:001' } },
            { key: 'source_revision', match: { value: `sha256:${'a'.repeat(64)}` } },
            { key: 'content_hash', match: { value: `sha256:${'b'.repeat(64)}` } },
          ]),
        }),
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
    expect(setPayload).toHaveBeenCalledWith(
      'codebase_chunks_768_v2',
      expect.objectContaining({
        filter: expect.objectContaining({ has_id: ['point-abc'] }),
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
  });
});
