// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  searchAce: vi.fn(),
}));

vi.mock('$lib/server/ai/ace-search.js', () => ({
  searchAce: (...args: unknown[]) => mocks.searchAce(...args),
}));

describe('/api/search/ace', () => {
  const baseResult = {
    query: 'token pressure',
    hits: [
      {
        chunk_id: 'src/lib/server/ace/context-assembler.ts:100-120',
        file: 'context-assembler.ts',
        lines: '100-120',
        summary: 'This chunk explains how ACE prompt weights are built and token budget is enforced.',
        why: 'Hybrid semantic + topology match',
        tags: ['ace', 'topology', 'token-budget'],
        weights: {
          attention_weight: 0.93,
          cosine_weight: 0.42,
          bm25_weight: 0.18,
          topology_weight: 0.22,
          authority_weight: 0.18,
          llm_synthesis_weight: 0.52,
        },
      },
    ],
    ontology: { entities: ['TURBO_CTX_SIZE'], relations: [['query', 'needs', 'budget']] },
    llm_synthesis: { summary: 'Compact ACE packet lowers token pressure.', next_actions: ['Reduce chunk count'], token_estimate: 72 },
  };

  beforeEach(() => {
    mocks.searchAce.mockReset();
    mocks.searchAce.mockResolvedValue(baseResult);
  });

  it('rejects unauthenticated requests', async () => {
    const { POST } = await import('./+server.js');
    const request = new Request('http://localhost/api/search/ace', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'token pressure' }),
    });

    const response = await POST({ request, url: new URL(request.url), locals: {} } as any);
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.hits).toEqual([]);
    expect(body.ontology).toEqual({ entities: [], relations: [] });
    expect(body.llm_synthesis.summary).toBe('');
  });

  it('rejects invalid query payloads', async () => {
    const { POST } = await import('./+server.js');
    const request = new Request('http://localhost/api/search/ace', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: '' }),
    });

    const response = await POST({ request, url: new URL(request.url), locals: { user: { id: '1' } } } as any);
    expect(response.status).toBe(400);
  });

  it('returns the ACE search shape for valid requests', async () => {
    const { POST } = await import('./+server.js');
    const request = new Request('http://localhost/api/search/ace', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'token pressure', intent: 'legal', limit: 3 }),
    });

    const response = await POST({ request, url: new URL(request.url), locals: { user: { id: '1' } } } as any);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.query).toBe('token pressure');
    expect(body.hits).toHaveLength(1);
    expect(body.hits[0].summary).toContain('ACE prompt weights');
    expect(body.ontology.entities).toContain('TURBO_CTX_SIZE');
    expect(body.llm_synthesis.summary).toContain('Compact ACE packet');
    expect(mocks.searchAce).toHaveBeenCalledTimes(1);
  });
});
