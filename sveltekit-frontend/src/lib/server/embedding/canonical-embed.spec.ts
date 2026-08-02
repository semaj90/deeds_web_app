import { afterEach, describe, expect, it, vi } from 'vitest';

describe('tryEmbedCanonical', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('prefers the local api embed lane before any fallback', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      expect(String(input)).toBe('http://127.0.0.1:5173/api/embed');
      return new Response(JSON.stringify({
        embedding: new Array(768).fill(0.25),
        model: 'embeddinggemma:latest',
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    });

    vi.stubGlobal('fetch', fetchMock);

    const { tryEmbedCanonical } = await import('./canonical-embed.js');
    const result = await tryEmbedCanonical('semantic retrieval proof', {
      baseUrl: 'http://127.0.0.1:5173',
      model: 'embeddinggemma:latest',
    });

    expect(result).not.toBeNull();
    expect(result?.source).toBe('api-embed');
    expect(result?.model).toBe('embeddinggemma:latest');
    expect(result?.embedding).toHaveLength(768);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
