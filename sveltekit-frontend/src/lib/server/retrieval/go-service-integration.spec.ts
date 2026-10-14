import { describe, expect, it, vi } from 'vitest';
import { queryGoService } from './go-service-integration.js';

describe('Go retrieval query representation guard', () => {
  it('rejects 384-D and non-finite query vectors before network access', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(queryGoService(
      { grpcUrl: '127.0.0.1:50053' },
      { query: 'test', query_embedding: new Array(384).fill(0.1), top_k: 5 },
    )).rejects.toThrow('GO_RETRIEVAL_QUERY_VECTOR_INVALID');
    await expect(queryGoService(
      { grpcUrl: '127.0.0.1:50053' },
      { query: 'test', query_embedding: [...new Array(767).fill(0.1), Number.NaN], top_k: 5 },
    )).rejects.toThrow('GO_RETRIEVAL_QUERY_VECTOR_INVALID');

    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
