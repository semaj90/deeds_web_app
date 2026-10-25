// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  transaction: vi.fn(),
  compilePacketWithGemma4: vi.fn(),
}));

vi.mock('$lib/server/db/client', () => ({
  db: {
    execute: (...args: unknown[]) => mocks.execute(...args),
    transaction: (callback: (tx: { execute: (...args: unknown[]) => unknown }) => unknown) =>
      mocks.transaction(callback),
  },
}));

vi.mock('$lib/server/features/ai/ace/gemma4-packet-compiler.js', () => ({
  compilePacketWithGemma4: (...args: unknown[]) => mocks.compilePacketWithGemma4(...args),
}));

vi.mock('drizzle-orm', () => ({
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({
    text: Array.from(strings).join('?'),
    values,
  }),
}));

describe('/api/ace/packets', () => {
  beforeEach(() => {
    mocks.execute.mockReset();
    mocks.transaction.mockReset();
    mocks.compilePacketWithGemma4.mockReset();

    mocks.transaction.mockImplementation((callback) => callback({ execute: mocks.execute }));
    mocks.execute
      .mockResolvedValueOnce({
        rows: [
          {
            id: 42,
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

    const response = await POST({ request, locals: { user: { id: '7' } } } as any);
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
    expect(body.packetUuid).toMatch(/^[0-9a-f-]{36}$/i);
    expect(body.factsWritten).toBe(5);
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.execute).toHaveBeenCalledTimes(8);
    const runtimeInsert = (mocks.execute.mock.calls[0][0] as { text: string }).text;
    expect(runtimeInsert).toContain('INSERT INTO route_runtime_packets');
    expect(runtimeInsert).not.toContain('prompt_hash');
    expect(runtimeInsert).not.toContain('reward');
    expect((mocks.execute.mock.calls[1][0] as { text: string }).text).toContain('INSERT INTO route_packets');
  });
});
