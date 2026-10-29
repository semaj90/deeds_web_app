// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { executeUnifiedRetrieval, summarizeRetrievalCandidates } = vi.hoisted(() => ({
  executeUnifiedRetrieval: vi.fn(),
  summarizeRetrievalCandidates: vi.fn(),
}));

vi.mock('$lib/server/retrieval/unified-orchestrator.js', () => ({
  executeUnifiedRetrieval,
  summarizeRetrievalCandidates,
}));

import { POST } from './+server.js';

describe('POST /api/admin/retrieval/stream', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('retrieves once and summarizes the same ranked candidates', async () => {
    const candidates = [{ score: 0.91, path: 'src/example.ts', symbol: 'example', kind: 'function' }];
    executeUnifiedRetrieval.mockResolvedValue({
      stages_completed: ['embedding', 'qdrant_search'],
      candidates,
      fallback_used: false,
    });
    summarizeRetrievalCandidates.mockResolvedValue({ summary: 'Grounded summary.' });

    const response = await POST({
      locals: { user: { id: 'user-1' } },
      request: new Request('http://localhost/api/admin/retrieval/stream', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query: 'find example' }),
      }),
    } as never);
    const stream = await response.text();

    expect(response.status).toBe(200);
    expect(executeUnifiedRetrieval).toHaveBeenCalledOnce();
    expect(summarizeRetrievalCandidates).toHaveBeenCalledOnce();
    expect(summarizeRetrievalCandidates).toHaveBeenCalledWith(candidates, 'find example');
    expect(stream).toContain('"stage":"summary"');
    expect(stream).toContain('Grounded summary.');
  });
});
