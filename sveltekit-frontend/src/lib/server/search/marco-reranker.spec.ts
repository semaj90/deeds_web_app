import { afterEach, describe, expect, it, vi } from 'vitest';

import { rerankWithMarco, scorePair } from './marco-reranker.js';

describe('marco-reranker mixedbread backend smoke', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('posts the mixedbread reranker model id without changing the scaffold shape', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ scores: [0.88, 0.77] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const scores = await rerankWithMarco('find canonical rerank', ['doc-1', 'doc-2']);

    expect(scores).toEqual([0.88, 0.77]);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/rerank');
    expect(init?.method).toBe('POST');

    const body = JSON.parse(String(init?.body));
    expect(body.query).toBe('find canonical rerank');
    expect(body.documents).toEqual(['doc-1', 'doc-2']);
    expect(body.model).toBe('mixedbread-ai/mxbai-rerank-base-v2');
  });

  it('keeps the single-pair convenience wrapper aligned', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ scores: [0.91] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(scorePair('q', 'doc')).resolves.toBe(0.91);
  });
});
