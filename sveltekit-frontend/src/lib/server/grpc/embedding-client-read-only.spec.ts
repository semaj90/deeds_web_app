import { beforeEach, describe, expect, it, vi } from 'vitest';

const redisMock = vi.hoisted(() => ({
  get: vi.fn(async () => null),
  set: vi.fn(async () => 'OK'),
}));
const embeddingFetchMock = vi.hoisted(() => vi.fn(async () => ({
  ok: true,
  json: async () => ({ embeddings: [Array(768).fill(0.03608439182435161)] }),
})));

vi.mock('../redis.js', () => ({ getRedis: () => redisMock }));
vi.mock('../env.server.js', () => ({
  ENV: {
    ACE_EMBED_BATCH_TIMEOUT_MS: 1000,
    EMBEDDING_GRPC_URL: '127.0.0.1:50051',
    EMBEDDING_GRPC_ENABLED: false,
    EMBEDDING_QUIC_ENABLED: false,
    NATS_URL: 'nats://127.0.0.1:4222',
    OLLAMA_BASE_URL: 'http://embedding-test.invalid',
  },
}));
vi.mock('../ollama.js', () => ({ ollamaFetch: embeddingFetchMock }));
vi.mock('../embedding/embedding-provider-v1.js', async (importOriginal) => ({
  ...await importOriginal<typeof import('../embedding/embedding-provider-v1.js')>(),
  resolveEmbeddingProviderV1: () => ({ provider: 'ollama', baseUrl: null }),
}));

import { generateEmbeddings } from './embedding-client.js';

describe('embedding client strict read-only cache policy', () => {
  beforeEach(() => {
    redisMock.get.mockClear();
    redisMock.set.mockClear();
    embeddingFetchMock.mockClear();
  });

  it('reads the cache, computes a miss, and never populates Redis in READ_ONLY', async () => {
    const sideEffects: Array<Record<string, unknown>> = [];
    const result = await generateEmbeddings(['query requiring an embedding'], {
      executionMode: 'READ_ONLY',
      recordSideEffect: (entry) => sideEffects.push(entry),
    });

    expect(result.vectors[0]).toHaveLength(768);
    expect(redisMock.get).toHaveBeenCalledTimes(1);
    expect(redisMock.set).not.toHaveBeenCalled();
    expect(embeddingFetchMock).toHaveBeenCalledTimes(1);
    expect(sideEffects).toEqual(expect.arrayContaining([
      expect.objectContaining({ subsystem: 'embedding-cache', operation: 'lookup', reads: 1, committedWrites: 0 }),
      expect.objectContaining({
        subsystem: 'embedding-cache', operation: 'populate-on-miss',
        attemptedWrites: 1, committedWrites: 0, suppressionReason: 'READ_ONLY_CACHE_LOOKUP_ONLY',
      }),
    ]));
  });
});
