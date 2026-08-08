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

  it('does NOT reject the dense_384 lane truncating a genuine 768-dim model output — that is intentional, not corruption', async () => {
    fetchSpy.mockResolvedValue(mockOllamaResponse(768));
    const { embedQueryForLane } = await import('../embedding-service.js');

    const result = await embedQueryForLane('test query', 'dense_384');
    expect(result.vector.length).toBe(384);
    expect(result.dimension).toBe(384);
  });
});
