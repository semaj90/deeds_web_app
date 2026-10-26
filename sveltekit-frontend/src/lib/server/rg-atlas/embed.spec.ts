import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/env.server.js', () => ({
  ENV: {
    EMBEDDING_PROVIDER: 'llama-server',
    EMBEDDING_BASE_URL: 'http://127.0.0.1:8090',
    LLAMA_SERVER_URL: 'http://127.0.0.1:8090',
    OLLAMA_EMBED_BASE_URL: 'http://127.0.0.1:11434',
    OLLAMA_BASE_URL: 'http://127.0.0.1:11434',
  },
}));

vi.mock('$lib/server/grpc/embedding-client.js', () => ({
  generateEmbeddings: vi.fn(async (texts: string[]) => ({
    vectors: texts.map((text) => new Array(768).fill(text.length / 1000)),
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

  it('delegates the complete batch to the shared artifact-qualified provider client', async () => {
    const { getBatchedEmbeddings } = await import('./embed.js');
    const { generateEmbeddings } = await import('$lib/server/grpc/embedding-client.js');

    const result = await getBatchedEmbeddings(['alpha', 'beta']);

    expect(result).toHaveLength(2);
    expect(result[0]).toHaveLength(768);
    expect(result[1]).toHaveLength(768);
    expect(generateEmbeddings).toHaveBeenCalledWith(['alpha', 'beta']);
  });

  it('rejects noncanonical model labels instead of assigning their vectors to semantic_768', async () => {
    const { getBatchedEmbeddings } = await import('./embed.js');
    const { validateResolvedBackend } = await import('$lib/server/embedding/embedding-backend-resolution.js');
    await expect(getBatchedEmbeddings(['alpha'], 'other-model')).rejects.toThrow(
      'RG_ATLAS_EMBEDDING_MODEL_MUST_BE_CANONICAL_SEMANTIC_768',
    );
    expect(validateResolvedBackend).not.toHaveBeenCalled();
  });
});
