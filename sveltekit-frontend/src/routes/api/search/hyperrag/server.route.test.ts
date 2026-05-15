// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  search: vi.fn(),
  bifrostChat: vi.fn(),
}));

vi.mock('$lib/server/retrieval/hyperrag-fusion-service.js', () => ({
  HyperRagFusionService: {
    getInstance: () => ({
      search: (...args: unknown[]) => mocks.search(...args),
    }),
  },
}));

vi.mock('$lib/server/ollama.js', () => ({
  bifrostChat: (...args: unknown[]) => mocks.bifrostChat(...args),
}));

describe('/api/search/hyperrag', () => {
  const baseResult = {
    query: 'graph retrieval',
    variants: ['graph retrieval', 'graph search'],
    hits: [
      {
        id: 'hit-1',
        title: 'Hit One',
        score: 0.92,
        signals: { dense: 0.9, graphAuthority: 0.8, clusterMatch: 0.1, pagerank: 0.4, aceBoost: 0.05, turbovec: 0.15 },
        reasons: ['Semantic match in codebase', 'TurboVec ANN prefilter hit'],
      },
    ],
    graphPaths: [],
    synthesis: null,
    provenance: { qdrant: true, turbovec: true, redis: true, neo4j: true, ace: true },
  };

  beforeEach(() => {
    mocks.search.mockReset();
    mocks.bifrostChat.mockReset();
    
    mocks.search.mockImplementation(async (params: any) => {
      let synthesis = null;
      if (params.synthesize) {
        try {
          synthesis = await mocks.bifrostChat();
        } catch (e) {
          synthesis = null;
        }
      }
      return { ...baseResult, synthesis };
    });
    
    mocks.bifrostChat.mockResolvedValue('Synthesized summary');
  });

  it('rejects unauthenticated requests', async () => {
    const { POST } = await import('./+server.js');
    const request = new Request('http://localhost/api/search/hyperrag', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'graph retrieval' }),
    });

    const response = await POST({ request, url: new URL(request.url), locals: {} } as any);
    expect(response.status).toBe(401);

    const body = await response.json();
    expect(body.hits).toEqual([]);
    expect(body.graphPaths).toEqual([]);
    expect(body.provenance).toEqual({ qdrant: false, turbovec: false, redis: false, neo4j: false, ace: false });
  });

  it('rejects empty and oversized queries', async () => {
    const { POST } = await import('./+server.js');

    const emptyRequest = new Request('http://localhost/api/search/hyperrag', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: '   ' }),
    });
    const emptyResponse = await POST({ request: emptyRequest, url: new URL(emptyRequest.url), locals: { user: { id: 'u1' } } } as any);
    expect(emptyResponse.status).toBe(400);

    const oversizedRequest = new Request('http://localhost/api/search/hyperrag', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'x'.repeat(1025) }),
    });
    const oversizedResponse = await POST({ request: oversizedRequest, url: new URL(oversizedRequest.url), locals: { user: { id: 'u1' } } } as any);
    expect(oversizedResponse.status).toBe(400);
  });

  it('returns the canonical hyperrag shape for valid requests', async () => {
    const { POST } = await import('./+server.js');
    const request = new Request('http://localhost/api/search/hyperrag', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'graph retrieval', synthesize: false }),
    });

    const response = await POST({ request, url: new URL(request.url), locals: { user: { id: 'u1' } } } as any);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.query).toBe('graph retrieval');
    expect(Array.isArray(body.variants)).toBe(true);
    expect(Array.isArray(body.hits)).toBe(true);
    expect(Array.isArray(body.graphPaths)).toBe(true);
    expect(body.hits[0].reasons).toEqual(expect.arrayContaining(['Semantic match in codebase']));
    expect(body.hits[0].signals).toEqual(expect.objectContaining({ dense: expect.any(Number), turbovec: expect.any(Number) }));
    expect(body.provenance).toEqual(expect.objectContaining({ qdrant: true, neo4j: true, redis: true, turbovec: true, ace: true }));
    expect(body.synthesis).toBeNull();
    expect(mocks.bifrostChat).not.toHaveBeenCalled();
  });

  it('fails open when synthesis is requested but Gemma4/Bifrost is unavailable', async () => {
    mocks.bifrostChat.mockRejectedValueOnce(new Error('Gemma4 unavailable'));

    const { POST } = await import('./+server.js');
    const request = new Request('http://localhost/api/search/hyperrag', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'graph retrieval', synthesize: true }),
    });

    const response = await POST({ request, url: new URL(request.url), locals: { user: { id: 'u1' } } } as any);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.synthesis).toBeNull();
    expect(body.hits).toHaveLength(1);
    expect(mocks.bifrostChat).toHaveBeenCalledTimes(1);
  });
});
