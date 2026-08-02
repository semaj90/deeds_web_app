import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/embedding-cache-service.js', () => ({
  embeddingCacheService: {
    getEmbedding: vi.fn(async () => null),
    cacheEmbedding: vi.fn(async () => undefined),
  },
}));

vi.mock('$lib/server/embedding/canonical-embed.js', () => ({
  tryEmbedCanonical: vi.fn(async (text: string) => ({
    model: 'embeddinggemma:latest',
    embedding: new Array(768).fill(text.length / 1000),
    source: 'api-embed' as const,
  })),
}));

vi.mock('$lib/server/embedding/embedding-backend-resolution.js', () => ({
  resolveEmbeddingBackend: vi.fn(() => ({
    provider: 'llama-server',
    baseUrl: 'http://127.0.0.1:8090',
    model: 'embeddinggemma:latest',
  })),
  validateResolvedBackend: vi.fn(async () => ({
    valid: true,
    errors: [],
    fingerprint: {
      isOllama: false,
      isLlamaServer: true,
      supportsEmbeddings: true,
      modelList: ['embeddinggemma:latest'],
    },
  })),
}));

describe('getBatchedEmbeddings', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('routes misses through the canonical embedding lane', async () => {
    const { getBatchedEmbeddings } = await import('./embed.js');
    const { tryEmbedCanonical } = await import('$lib/server/embedding/canonical-embed.js');
    const { embeddingCacheService } = await import('$lib/server/embedding-cache-service.js');

    const result = await getBatchedEmbeddings(['alpha', 'beta']);

    expect(result).toHaveLength(2);
    expect(result[0]).toHaveLength(768);
    expect(result[1]).toHaveLength(768);
    expect(tryEmbedCanonical).toHaveBeenCalledTimes(2);
    expect(embeddingCacheService.cacheEmbedding).toHaveBeenCalledTimes(2);
    expect(embeddingCacheService.cacheEmbedding).toHaveBeenNthCalledWith(
      1,
      'alpha',
      expect.any(Array),
      'embeddinggemma:latest',
    );
    expect(embeddingCacheService.cacheEmbedding).toHaveBeenNthCalledWith(
      2,
      'beta',
      expect.any(Array),
      'embeddinggemma:latest',
    );
  });
});
