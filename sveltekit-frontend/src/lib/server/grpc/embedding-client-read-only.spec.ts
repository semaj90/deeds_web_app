import { beforeEach, describe, expect, it, vi } from 'vitest';

const redisMock = vi.hoisted(() => ({
  get: vi.fn(async () => null),
  set: vi.fn(async () => 'OK'),
}));
const envMock = vi.hoisted(() => ({
  ACE_EMBED_BATCH_TIMEOUT_MS: 1000,
  EMBEDDING_GRPC_URL: '127.0.0.1:50051',
  EMBEDDING_GRPC_ENABLED: false,
  EMBEDDING_QUIC_ENABLED: false,
  NATS_URL: 'nats://127.0.0.1:4222',
  OLLAMA_BASE_URL: 'http://embedding-test.invalid',
  EMBEDDING_MODEL_ARTIFACT_REVISION: `sha256:${'a'.repeat(64)}`,
  EMBEDDING_TOKENIZER_REVISION: `embedded-in-artifact:sha256:${'a'.repeat(64)}`,
  EMBEDDING_INPUT_POLICY_REVISION: 'semantic-input-test-v1',
}));
const liveDigest = vi.hoisted(() => ({ value: 'a'.repeat(64) }));
const embeddingFetchMock = vi.hoisted(() => vi.fn(async (url: string) => url.endsWith('/api/tags')
  ? { ok: true, json: async () => ({ models: [{ name: 'embeddinggemma:latest', digest: liveDigest.value }] }) }
  : { ok: true, json: async () => ({ embeddings: [Array(768).fill(0.03608439182435161)] }) }));

vi.mock('../redis.js', () => ({ getRedis: () => redisMock }));
vi.mock('../env.server.js', () => ({
  ENV: envMock,
}));
vi.mock('../ollama.js', () => ({ embedOrChatFetch: embeddingFetchMock }));
vi.mock('../embedding/embedding-provider-v1.js', async (importOriginal) => ({
  ...await importOriginal<typeof import('../embedding/embedding-provider-v1.js')>(),
  resolveEmbeddingProviderV1: () => ({
    provider: 'ollama', baseUrl: 'http://embedding-test.invalid', modelId: 'embeddinggemma:latest',
    dimensions: 768, representationId: 'semantic_768',
  }),
}));

import { generateEmbeddings } from './embedding-client.js';

describe('embedding client strict read-only cache policy', () => {
  beforeEach(() => {
    envMock.EMBEDDING_MODEL_ARTIFACT_REVISION = `sha256:${'a'.repeat(64)}`;
    liveDigest.value = 'a'.repeat(64);
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
    expect(redisMock.get.mock.calls[0][0]).toMatch(/^embed:v2:sha256:[a-f0-9]{64}$/);
    expect(redisMock.set).not.toHaveBeenCalled();
    expect(embeddingFetchMock).toHaveBeenCalledTimes(2);
    expect(sideEffects).toEqual(expect.arrayContaining([
      expect.objectContaining({ subsystem: 'embedding-cache', operation: 'lookup', reads: 1, committedWrites: 0 }),
      expect.objectContaining({
        subsystem: 'embedding-cache', operation: 'populate-on-miss',
        attemptedWrites: 1, committedWrites: 0, suppressionReason: 'READ_ONLY_CACHE_LOOKUP_ONLY',
      }),
    ]));
  });

  it('writes generated vectors only under the qualified identity key', async () => {
    await generateEmbeddings(['cacheable query'], { executionMode: 'MUTATING' });

    await vi.waitFor(() => expect(redisMock.set).toHaveBeenCalledTimes(1));
    const [key, serialized] = redisMock.set.mock.calls[0];
    expect(key).toMatch(/^embed:v2:sha256:[a-f0-9]{64}$/);
    const entry = JSON.parse(serialized);
    expect(entry.dimension).toBe(768);
    expect(entry.cacheIdentity).toMatchObject({
      representationId: 'semantic_768',
      modelArtifactRevision: `sha256:${liveDigest.value}`,
      tokenizerRevision: `ollama-manifest-bound:sha256:${liveDigest.value}`,
      inputPolicyRevision: envMock.EMBEDDING_INPUT_POLICY_REVISION,
    });
  });

  it('bypasses Redis when live model artifact identity is missing', async () => {
    liveDigest.value = '';
    const sideEffects: Array<Record<string, unknown>> = [];

    const result = await generateEmbeddings(['query requiring an embedding'], {
      executionMode: 'MUTATING',
      recordSideEffect: (entry) => sideEffects.push(entry),
    });

    expect(result.vectors[0]).toHaveLength(768);
    expect(redisMock.get).not.toHaveBeenCalled();
    expect(redisMock.set).not.toHaveBeenCalled();
    expect(sideEffects).toContainEqual(expect.objectContaining({
      subsystem: 'embedding-cache', operation: 'lookup', reads: 0,
      suppressionReason: 'EMBEDDING_CACHE_IDENTITY_UNQUALIFIED',
    }));
  });

  it('uses the live Ollama manifest digest instead of the configured local-file digest', async () => {
    liveDigest.value = 'b'.repeat(64);

    await generateEmbeddings(['query requiring an embedding'], { executionMode: 'MUTATING' });

    await vi.waitFor(() => expect(redisMock.set).toHaveBeenCalledTimes(1));
    const [, serialized] = redisMock.set.mock.calls[0];
    const entry = JSON.parse(serialized);
    expect(entry.cacheIdentity.modelArtifactRevision).toBe(`sha256:${'b'.repeat(64)}`);
    expect(entry.cacheIdentity.modelArtifactRevision).not.toBe(envMock.EMBEDDING_MODEL_ARTIFACT_REVISION);
  });
});
