// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  compilePacketWithGemma4: vi.fn(),
}));

vi.mock('$lib/server/db/client', () => ({
  db: {
    execute: (...args: unknown[]) => mocks.execute(...args),
  },
}));

vi.mock('$lib/server/features/ai/ace/gemma4-packet-compiler.js', () => ({
  compilePacketWithGemma4: (...args: unknown[]) => mocks.compilePacketWithGemma4(...args),
}));

describe('/api/ace/packets', () => {
  beforeEach(() => {
    mocks.execute.mockReset();
    mocks.compilePacketWithGemma4.mockReset();

    mocks.execute
      .mockResolvedValueOnce({
        rows: [
          {
            id: 42,
            packet_uuid: '11111111-1111-1111-1111-111111111111',
            feature_id: 'feature-1',
            som_cluster: '7',
          },
        ],
      })
      .mockResolvedValue({ rows: [] });

    mocks.compilePacketWithGemma4.mockResolvedValue({
      facts: [
        {
          fact_type: 'structured_analysis',
          fact_key: 'featureRevision',
          fact_value: 'nlp-feature-compiler-v1',
          score: 1,
          metadata: {},
        },
      ],
      edges: [],
      state: { summary: 'compiled', token_hints: ['ast-unit'] },
    });
  });

  it('accepts structured analysis and passes it into ACE packet compilation', async () => {
    const { POST } = await import('./+server.js');
    const request = new Request('http://localhost/api/ace/packets', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        query_hash: 'query-1',
        prompt_hash: 'prompt-1',
        reward: 1,
        feature_id: 'feature-1',
        som_cluster: '7',
        structured_analysis: {
          document_id: 'doc-1',
          pass_results: [{ pass_name: 'structural' }],
          control5: { structural: true, lexical: true, linguistic: true, semantic: true, grounded: false },
          experiment_feature_matrix: { featureRevision: 'nlp-feature-compiler-v1', graphRevision: 'graph-rev-1', candidateCount: 1 },
        },
      }),
    });

    const response = await POST({ request, locals: { user: { id: 'u1' } } } as any);
    expect(response.status).toBe(200);
    expect(mocks.compilePacketWithGemma4).toHaveBeenCalledTimes(1);
    expect(mocks.compilePacketWithGemma4).toHaveBeenCalledWith(
      expect.objectContaining({
        structured_analysis: expect.objectContaining({
          document_id: 'doc-1',
        }),
      }),
    );

    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.factsWritten).toBe(5);
    expect(mocks.execute).toHaveBeenCalledTimes(7);
  });
});
