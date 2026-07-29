// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockEmbedQueryForLane, mockHybridSearch } = vi.hoisted(() => ({
  mockEmbedQueryForLane: vi.fn(),
  mockHybridSearch: vi.fn(),
}));

vi.mock('./embedding-service.js', () => ({
  embedQueryForLane: mockEmbedQueryForLane,
}));

vi.mock('$lib/server/vector/qdrant-manager.js', () => ({
  getQdrantManager: async () => ({
    hybridSearch: mockHybridSearch,
  }),
}));

import { retrieveQdrant } from './retrieve-candidates.js';

describe('retrieveQdrant', () => {
  beforeEach(() => {
    mockEmbedQueryForLane.mockReset();
    mockHybridSearch.mockReset();
  });

  it('queries the clean v2 collection with the content vector contract', async () => {
    mockEmbedQueryForLane.mockResolvedValue({
      vector: new Float32Array(768).fill(0.01),
      model: 'embeddinggemma:latest',
      dimension: 768,
      cached: false,
      exec_ms: 1,
    });
    mockHybridSearch.mockResolvedValue({
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
    expect(mockHybridSearch).toHaveBeenCalledTimes(1);
    expect(mockHybridSearch).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'codebase_chunks_768_v2',
        limit: expect.any(Number),
        query: 'exact symbol proof',
        queryEmbedding: expect.any(Array),
      }),
    );
    expect(results).toHaveLength(1);
    expect(results[0]?.packetKey).toBe('packet-1');
    expect(results[0]?.embeddingLane).toBe('dense_768');
  });
});
