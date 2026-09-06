import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

function mockOllamaResponse(embeddingLength: number) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ embedding: new Array(embeddingLength).fill(0.1) }),
  } as Response;
}

describe('embedQueryForLane — fail-closed dimension guard (dense_768)', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.resetModules();
    // Keep these compatibility tests on the Ollama path even when the
    // workstation's .env enables the strict llama-server lane globally.
    process.env.ATLAS_CANONICAL_EMBEDDING_STRICT = 'false';
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('succeeds when Ollama returns a genuine 768-dim vector on the dense_768 lane', async () => {
    fetchSpy.mockResolvedValue(mockOllamaResponse(768));
    const { embedQueryForLane } = await import('../embedding-service.js');

    const result = await embedQueryForLane('test query', 'dense_768');
    expect(result.vector.length).toBe(768);
    expect(result.dimension).toBe(768);
  });

  it('throws SEMANTIC_768_DIMENSION_MISMATCH instead of silently zero-padding a short vector', async () => {
    // Simulates a misconfigured model returning 384 dims on the canonical dense_768 lane —
    // the exact silent-corruption path found during the LOD-taxonomy authority audit.
    // Before this fix, truncateVector() would zero-pad this to a dimensionally-valid-looking
    // (but semantically corrupted) 768-length vector with no error anywhere in the chain.
    fetchSpy.mockResolvedValue(mockOllamaResponse(384));
    const { embedQueryForLane } = await import('../embedding-service.js');

    await expect(embedQueryForLane('test query', 'dense_768')).rejects.toThrow(
      /SEMANTIC_768_DIMENSION_MISMATCH/,
    );
  });

  it('rejects the retired dense_384 lane instead of deriving a new runtime vector', async () => {
    const { embedQueryForLane } = await import('../embedding-service.js');

    await expect(embedQueryForLane('test query', 'dense_384')).rejects.toThrow(
      /EMBEDDING_LANE_RETIRED:dense_384/,
    );
  });

  it('does not send an Ollama-shaped request to LLAMA_SERVER_URL when it is the only llama setting', async () => {
    const keys = [
      'EMBEDDING_BASE_URL',
      'EMBEDDING_PROVIDER',
      'ATLAS_CANONICAL_EMBEDDING_STRICT',
      'EMBEDDING_SERVER_MODEL',
      'OLLAMA_BASE_URL',
      'OLLAMA_URL',
      'LLAMA_SERVER_URL',
    ] as const;
    const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));

    try {
      delete process.env.EMBEDDING_BASE_URL;
      delete process.env.EMBEDDING_PROVIDER;
      delete process.env.ATLAS_CANONICAL_EMBEDDING_STRICT;
      delete process.env.EMBEDDING_SERVER_MODEL;
      process.env.LLAMA_SERVER_URL = 'http://127.0.0.1:8090';
      delete process.env.OLLAMA_BASE_URL;
      delete process.env.OLLAMA_URL;

      vi.resetModules();
      fetchSpy.mockResolvedValue(mockOllamaResponse(768));
      const { embedQueryForLane } = await import('../embedding-service.js');

      await embedQueryForLane('test query', 'dense_768');

      const requestUrls = fetchSpy.mock.calls.map(([input]) => String(input));
      expect(requestUrls).toContain('http://127.0.0.1:11434/api/embeddings');
      expect(requestUrls.some((url) => url.startsWith('http://127.0.0.1:8090/'))).toBe(false);
      expect(requestUrls.some((url) => url.endsWith('/api/embed') || url.endsWith('/api/embeddings'))).toBe(true);
    } finally {
      for (const key of keys) {
        const value = previous[key];
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });
});
