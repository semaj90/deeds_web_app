import { afterEach, describe, expect, it, vi } from 'vitest';

import { rerankWithEg2Mrl8094, rerankWithMarco, scorePair } from './marco-reranker.js';

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

  it('reranks via :8094 EG2 ONNX MRL dims (768/512/256/128)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        embeddings: {
          '256': [
            [1, 0, ...Array(254).fill(0)],
            [1, 0, ...Array(254).fill(0)],
            [0, 1, ...Array(254).fill(0)],
          ],
        },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const scores = await rerankWithEg2Mrl8094('q', ['match', 'orth'], 256);
    expect(scores[0]).toBeCloseTo(1, 5);
    expect(scores[1]).toBeCloseTo(0, 5);
  });
});
