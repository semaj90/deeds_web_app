import { describe, expect, it, vi } from 'vitest';
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
  it('resolves the canonical hybrid collection and syncs all packet_key matches', async () => {
    getCollections.mockResolvedValue({
      collections: [
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
      payload: {
        summary: 'Updated summary',
        source_ref: 'src/lib/server/auth.ts',
      },
    });

    expect(result.collection).toBe('codebase_chunks_384_hybrid');
    expect(result.updatedPoints).toBe(2);
    expect(scroll).toHaveBeenCalledTimes(1);
    expect(setPayload).toHaveBeenCalledTimes(2);
    expect(setPayload).toHaveBeenNthCalledWith(
      1,
      'codebase_chunks_384_hybrid',
      expect.objectContaining({
        points: ['point-1'],
        payload: expect.objectContaining({
          packet_key: 'packet:auth:001',
          summary: 'Updated summary',
          source_ref: 'src/lib/server/auth.ts',
          qdrant_synced_at: expect.any(String),
        }),
      }),
    );
  });

  it('uses the provided qdrantPointId without scrolling', async () => {
    getCollections.mockResolvedValue({ collections: [{ name: 'codebase_chunks_384' }] });
    scroll.mockResolvedValue({ points: [] });
    setPayload.mockResolvedValue({});

    const result = await syncSummaryPayloadToQdrant({
      packetKey: 'packet:auth:002',
      qdrantPointId: 'point-abc',
      collection: 'codebase_chunks_384',
      payload: {
        summary: 'Point-specific update',
      },
    });

    expect(result.collection).toBe('codebase_chunks_384');
    expect(result.updatedPoints).toBe(1);
    expect(scroll).not.toHaveBeenCalled();
    expect(setPayload).toHaveBeenCalledTimes(1);
    expect(setPayload).toHaveBeenCalledWith(
      'codebase_chunks_384',
      expect.objectContaining({
        points: ['point-abc'],
        payload: expect.objectContaining({
          packet_key: 'packet:auth:002',
          summary: 'Point-specific update',
        }),
      }),
    );
  });
});
