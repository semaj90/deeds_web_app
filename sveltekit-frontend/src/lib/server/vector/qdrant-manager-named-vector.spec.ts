// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { QdrantManager } from './qdrant-manager.js';

describe('QdrantManager hybridSearch named-vector resolution', () => {
  it('uses the configured summary vector instead of the global content default', async () => {
    const manager = new QdrantManager('http://qdrant-named-vector-test.invalid');
    const query = vi.fn(async () => ({
      points: [{ id: 'summary-1', score: 0.91, payload: { summary: 'test summary' } }],
    }));
    const getCollection = vi.fn(async () => ({
      config: { params: { sparse_vectors: {} } },
    }));

    manager.client = { query, getCollection } as any;

    const result = await manager.hybridSearch({
      collection: 'summary_lenses_768',
      query: 'summary vector contract',
      queryEmbedding: new Array(768).fill(0.01),
      limit: 1,
    });

    expect(result.results).toHaveLength(1);
    expect(query).toHaveBeenCalledWith(
      'summary_lenses_768',
      expect.objectContaining({
        using: 'summary',
        query: new Array(768).fill(0.01),
      }),
    );
    expect(query.mock.calls[0]?.[1]).not.toEqual(expect.objectContaining({ using: 'content' }));
  });
});
