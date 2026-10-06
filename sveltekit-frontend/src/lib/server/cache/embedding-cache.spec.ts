import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  values: new Map<string, string>(),
  embed: vi.fn(),
  deleted: [] as string[],
}));

vi.mock('$lib/server/redis.js', () => ({
  getRedis: () => ({
    get: async (key: string) => state.values.get(key) ?? null,
    setex: async (key: string, _ttl: number, value: string) => { state.values.set(key, value); },
    del: async (key: string) => { state.deleted.push(key); state.values.delete(key); return 1; },
  }),
}));

vi.mock('$lib/server/embedding/canonical-embed.js', () => ({
  tryEmbedCanonical: (...args: unknown[]) => state.embed(...args),
}));

import { buildEmbeddingExactCacheKeyV1, getCachedEmbedding } from './embedding-cache.js';

const semantic768 = [1, ...new Array(767).fill(0)];

describe('EmbeddingGemma exact cache', () => {
  beforeEach(() => {
    state.values.clear();
    state.deleted.length = 0;
    state.embed.mockReset();
  });

  it('separates model identities for identical text', async () => {
    state.embed.mockResolvedValue({ embedding: semantic768 });

    await getCachedEmbedding('same text', { model: 'embeddinggemma:latest' });
    await getCachedEmbedding('same text', { model: 'other-model' });

    expect(buildEmbeddingExactCacheKeyV1('same text', 'embeddinggemma:latest'))
      .not.toBe(buildEmbeddingExactCacheKeyV1('same text', 'other-model'));
    expect(state.embed).toHaveBeenCalledTimes(2);
    expect(state.values.size).toBe(2);
  });

  it('evicts a legacy cached 384-D value and recomputes canonical semantic_768', async () => {
    const key = buildEmbeddingExactCacheKeyV1('same text');
    state.values.set(key, JSON.stringify(new Array(384).fill(0.1)));
    state.embed.mockResolvedValue({ embedding: semantic768 });

    const result = await getCachedEmbedding('same text');

    expect(result.vector).toHaveLength(768);
    expect(result.cached).toBe(false);
    expect(state.deleted).toEqual([key]);
  });

  it('rejects a non-768 canonical embedding response without caching it', async () => {
    state.embed.mockResolvedValue({ embedding: new Array(384).fill(0.1) });

    await expect(getCachedEmbedding('bad output')).rejects.toThrow('SEMANTIC_768_OUTPUT_INVALID');
    expect(state.values.size).toBe(0);
  });
});
