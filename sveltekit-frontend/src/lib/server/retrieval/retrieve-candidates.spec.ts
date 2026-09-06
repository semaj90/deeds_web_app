// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockEmbedQueryForLane, mockDenseSearch } = vi.hoisted(() => ({
  mockEmbedQueryForLane: vi.fn(),
  mockDenseSearch: vi.fn(),
}));

vi.mock('./embedding-service.js', () => ({
  embedQueryForLane: mockEmbedQueryForLane,
}));

vi.mock('$lib/server/vector/qdrant-manager.js', () => ({
  getQdrantManager: async () => ({
    denseSearch: mockDenseSearch,
  }),
}));

import { retrieveQdrant } from './retrieve-candidates.js';

describe('retrieveQdrant', () => {
  beforeEach(() => {
    mockEmbedQueryForLane.mockReset();
    mockDenseSearch.mockReset();
  });

  it('queries the clean v2 collection with the content vector contract', async () => {
    mockEmbedQueryForLane.mockResolvedValue({
      vector: new Float32Array(768).fill(0.01),
      model: 'embeddinggemma:latest',
      dimension: 768,
      cached: false,
      exec_ms: 1,
    });
    mockDenseSearch.mockResolvedValue({
      results: [
        {
          id: '11111111-1111-4111-8111-111111111111',
          score: 0.998,
          payload: {
            packet_key: 'packet-1',
            source_ref: 'src/lib/example.ts',
            summary: 'match',
            content: 'match',
          },
        },
      ],
    });

    const results = await retrieveQdrant('exact symbol proof');

    expect(mockEmbedQueryForLane).toHaveBeenCalledWith('exact symbol proof', 'dense_768');
    expect(mockDenseSearch).toHaveBeenCalledTimes(1);
    expect(mockDenseSearch).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'codebase_chunks_768_v2',
        limit: expect.any(Number),
        query: 'exact symbol proof',
        queryVector: expect.any(Array),
        vectorName: 'content',
      }),
    );
    expect(results).toHaveLength(1);
    expect(results[0]?.packetKey).toBe('packet-1');
    expect(results[0]?.embeddingLane).toBe('dense_768');
  });
});
