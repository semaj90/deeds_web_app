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

describe('/api/rag/hyperrag', () => {
  beforeEach(() => {
    mocks.search.mockReset();
    mocks.bifrostChat.mockReset();

    mocks.search.mockResolvedValue({
      metadata: { query: 'graph retrieval', candidatesRetrieved: 2, candidatesFused: 2, candidatesReranked: 1, durationMs: 17, stages: { retrieve: 4, fuse: 3, hydrate: 5, rerank: 5 } },
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
    });

    mocks.bifrostChat.mockResolvedValue('Synthesized summary');
  });

  it('returns a canonical compatibility packet for authenticated users', async () => {
    const { POST } = await import('./+server.js');
    const request = new Request('http://localhost/api/rag/hyperrag', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'graph retrieval', limit: 5 }),
    });

    const response = await POST({ request, url: new URL(request.url), locals: { user: { id: 'u1' } } } as any);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.packet.query).toBe('graph retrieval');
    expect(body.packet.results).toHaveLength(1);
    expect(body.packet.results[0].id).toBe('packet-1');
    expect(body.packet.results[0].summary).toBe('packet summary one');
    expect(body.packet.turbovecPrefilter).toBe(false);
    expect(body.packet.turbovecCandidates).toEqual(['packet-1']);
    expect(body.bitfrostSummary).toBe('Synthesized summary');
    expect(mocks.search).toHaveBeenCalledTimes(1);
  });

  it('rejects unauthenticated requests', async () => {
    const { POST } = await import('./+server.js');
    const request = new Request('http://localhost/api/rag/hyperrag', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'graph retrieval' }),
    });

    const result = await POST({ request, url: new URL(request.url), locals: {} } as any).catch((err) => err);
    expect(result.status ?? result?.statusCode).toBe(401);
  });
});
