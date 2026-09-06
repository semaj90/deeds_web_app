// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  search: vi.fn(),
  bifrostChat: vi.fn(),
}));

vi.mock('$lib/server/retrieval/search-runtime.js', () => ({
  createSearchRuntime: () => ({
    search: (...args: unknown[]) => mocks.search(...args),
  }),
}));

vi.mock('$lib/server/ollama.js', () => ({
  bifrostChat: (...args: unknown[]) => mocks.bifrostChat(...args),
  VLM_MODELS: { legal: 'gemma4-legal-iq4xs-direct.gguf' },
}));

// The repository-root Vitest runner does not install SvelteKit's `$lib`
// alias. Bridge this route import to the real classifier for the test.
vi.mock('$lib/server/atlas/agentic-file-compiler/query-classifier.js', async () =>
  import('../../../../lib/server/atlas/agentic-file-compiler/query-classifier.js'));
vi.mock('$lib/server/atlas/agentic-file-compiler/retrieval-plan.js', async () =>
  import('../../../../lib/server/atlas/agentic-file-compiler/retrieval-plan.js'));

describe('/api/search/hyperrag', () => {
  const baseResult = {
    metadata: { query: 'graph retrieval', candidatesRetrieved: 2, candidatesFused: 2, candidatesReranked: 2, durationMs: 12, stages: { retrieve: 1, fuse: 1, hydrate: 1, rerank: 1 } },
    provenance: {
      retrievalSources: ['postgres_trigram', 'qdrant', 'ast_tree'],
      fusionMethod: 'rrf',
      rerankModel: 'mixedbread-ai/mxbai-rerank-base-v2',
      rerankerUsed: true,
      promotionAttempted: true,
    },
    packets: [
      {
        packet_key: 'packet-1',
        source_ref: 'src/lib/example.ts',
        summary: 'packet summary one',
        content: 'packet content one',
        retrieval_score: 0.91,
        blended_score: 0.94,
        cross_encoder_score: 0.95,
        rank_after: 1,
        semantic_title: 'Packet One',
        domain: 'codebase',
        page_rank_score: 0.12,
        som_cluster: 8,
        lexical: { score: 0.7 },
      },
    ],
  };

  beforeEach(() => {
    mocks.search.mockReset();
    mocks.bifrostChat.mockReset();

    mocks.search.mockResolvedValue(baseResult);
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
    expect(body.classification).toEqual(expect.objectContaining({
      schema: 'atlas.query-classification.v1',
      operation: 'INSPECT',
      producerRevision: 'hyperrag-front-door-v1',
    }));
    expect(body.retrievalPlan).toBeNull();
    expect(Array.isArray(body.variants)).toBe(true);
    expect(Array.isArray(body.hits)).toBe(true);
    expect(Array.isArray(body.graphPaths)).toBe(true);
    expect(body.hits[0].reasons).toEqual(expect.arrayContaining(['retrieval:canonical', 'domain:codebase']));
    expect(body.hits[0].signals).toEqual(
      expect.objectContaining({
        graphAuthority: 0.12,
        clusterMatch: 8,
        pagerank: 0.12,
        topoClass: 'codebase',
        lexicalBoost: 0.7,
      })
    );
    expect(body.provenance).toEqual(expect.objectContaining({ qdrant: true, neo4j: true, redis: true, turbovec: false, ace: false }));
    expect(body.synthesis).toBeNull();
    expect(mocks.bifrostChat).not.toHaveBeenCalled();
  });

  it('compiles a revision-qualified retrieval plan and applies its candidate budget', async () => {
    const { POST } = await import('./+server.js');
    const request = new Request('http://localhost/api/search/hyperrag', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-request-id': 'req-plan-1' },
      body: JSON.stringify({ query: 'graph retrieval', workspaceRevision: 'sha256:workspace-1', topK: 7 }),
    });

    const response = await POST({ request, url: new URL(request.url), locals: { user: { id: 'u1' } } } as any);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.retrievalPlan).toEqual(expect.objectContaining({
      schema: 'atlas.retrieval-plan.v1',
      requestId: 'req-plan-1',
      workspaceRevision: 'sha256:workspace-1',
      candidateBudget: 7,
      semanticRepresentation: 'semantic_768',
    }));
    expect(mocks.search).toHaveBeenCalledWith(expect.objectContaining({ topK: 7 }));
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
