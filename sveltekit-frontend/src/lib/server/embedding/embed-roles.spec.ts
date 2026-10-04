// @vitest-environment node
/**
 * EMBED-CALLER-CONVERGENCE-01: embedTextAs / embedTextsAs apply the contract prompt
 * (embedding-contract-768.ts) before the cache-first facade, so cache keys differ per role.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  generateSingleEmbedding: vi.fn(async (t: string) => [t.length]),
  generateEmbeddings: vi.fn(async (texts: string[]) => ({ vectors: texts.map((t) => [t.length]) })),
  getCachedEmbedding: vi.fn(async (_text: string) => null),
  cacheEmbedding: vi.fn(async () => undefined),
  batchGetCachedEmbeddings: vi.fn(async (texts: string[]) => texts.map(() => null)),
  batchCacheEmbeddings: vi.fn(async () => undefined),
  getPersistedEmbedding: vi.fn(async () => null),
  persistEmbedding: vi.fn(async (_text: string, _v: number[]) => undefined),
  batchGetPersistedEmbeddings: vi.fn(async (texts: string[]) => texts.map(() => null)),
  batchPersistEmbeddings: vi.fn(async () => undefined),
}));

vi.mock('$lib/server/grpc/embedding-client.js', () => ({
  generateEmbeddings: h.generateEmbeddings,
  generateSingleEmbedding: h.generateSingleEmbedding,
  checkGrpcHealth: vi.fn(),
}));
vi.mock('$lib/server/embedding-cache.js', () => ({
  getCachedEmbedding: h.getCachedEmbedding,
  cacheEmbedding: h.cacheEmbedding,
  batchGetCachedEmbeddings: h.batchGetCachedEmbeddings,
  batchCacheEmbeddings: h.batchCacheEmbeddings,
}));
vi.mock('$lib/server/embedding/embedding-persist.js', () => ({
  getPersistedEmbedding: h.getPersistedEmbedding,
  persistEmbedding: h.persistEmbedding,
  batchGetPersistedEmbeddings: h.batchGetPersistedEmbeddings,
  batchPersistEmbeddings: h.batchPersistEmbeddings,
}));
vi.mock('$lib/server/circuit-breaker.js', () => ({ ollamaBreaker: { call: (fn: () => unknown) => fn() } }));
vi.mock('$lib/server/utils/retry.js', () => ({
  retry: (fn: () => unknown) => fn(),
  retryPredicates: { networkOrServer: () => true },
}));
vi.mock('$lib/server/embedding/knn-helper.js', () => ({}));
vi.mock('$lib/server/embedding-cache-service.js', () => ({ embeddingCacheService: {} }));

import { embedTextAs, embedTextsAs } from './embed.js';

beforeEach(() => {
  for (const fn of Object.values(h)) (fn as ReturnType<typeof vi.fn>).mockClear();
});

describe('embedTextAs', () => {
  it('document role => "title: {path} | text: {trimmed content}" reaches the generator and the cache keys', async () => {
    await embedTextAs('document', '  const a = 1;\n ', 'src/a.ts');
    const expected = 'title: src/a.ts | text: const a = 1;';
    expect(h.generateSingleEmbedding).toHaveBeenCalledWith(expected);
    expect(h.getCachedEmbedding).toHaveBeenCalledWith(expected);
    expect(h.persistEmbedding).toHaveBeenCalledWith(expected, expect.any(Array));
  });

  it('document role without a title falls back to "none"', async () => {
    await embedTextAs('document', 'hello');
    expect(h.generateSingleEmbedding).toHaveBeenCalledWith('title: none | text: hello');
  });

  it('retrieval_query and code_query use their task prefixes', async () => {
    await embedTextAs('retrieval_query', 'find auth');
    await embedTextAs('code_query', 'find auth');
    expect(h.generateSingleEmbedding).toHaveBeenNthCalledWith(1, 'task: search result | query: find auth');
    expect(h.generateSingleEmbedding).toHaveBeenNthCalledWith(2, 'task: code retrieval query | query: find auth');
  });

  it('the same words under different roles never share a cache key', async () => {
    await embedTextAs('retrieval_query', 'same words');
    await embedTextAs('document', 'same words');
    const keys = h.getCachedEmbedding.mock.calls.map((c) => c[0]);
    expect(new Set(keys).size).toBe(2);
  });

  it('rejects empty input before touching the cache', async () => {
    await expect(embedTextAs('document', '   ')).rejects.toThrow('EMBEDDINGGEMMA_EMPTY_INPUT');
    expect(h.getCachedEmbedding).not.toHaveBeenCalled();
  });
});

describe('embedTextsAs', () => {
  it('formats every item with its aligned title before the batch path', async () => {
    await embedTextsAs('document', [' a ', 'b'], ['x.ts', undefined]);
    expect(h.generateEmbeddings).toHaveBeenCalledTimes(1);
    expect(h.generateEmbeddings.mock.calls[0][0]).toEqual(['title: x.ts | text: a', 'title: none | text: b']);
  });
});
