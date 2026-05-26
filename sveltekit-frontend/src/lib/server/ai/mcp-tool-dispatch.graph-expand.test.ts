// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockExpandNeighbours = vi.hoisted(() => vi.fn());
const mockBuildSubgraph = vi.hoisted(() => vi.fn());
const mockRedisGet = vi.hoisted(() => vi.fn());

vi.mock('$lib/server/search/neo4j-rerank.js', () => ({
  expandNeighbours: mockExpandNeighbours,
}));

vi.mock('$lib/server/retrieval/subgraph-seed-neighborhood.js', () => ({
  buildSubgraphV1SeedNeighborhood: mockBuildSubgraph,
}));

vi.mock('$lib/server/redis.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('$lib/server/redis.js')>();
  return {
    ...actual,
    getRedis: () => ({ get: mockRedisGet }),
    redis: { get: mockRedisGet },
  };
});

describe('tool_graph_expand_neighborhood', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns sourceRefs-first graph payload with compatibility neighbors', async () => {
    mockExpandNeighbours.mockResolvedValueOnce([
      'file:src/lib/server/retrieval/query-profile-router.ts',
      'file:src/lib/server/retrieval/routing-explanation.ts',
    ]);
    mockRedisGet.mockResolvedValueOnce(
      JSON.stringify({
        'file:src/lib/server/retrieval/query-profile-router.ts': 0.81,
      })
    );
    mockBuildSubgraph.mockResolvedValueOnce({
      version: 'subgraph_v1_seed_neighborhood',
      contract: {
        query: 'chat completions route',
        filePath: 'src/routes/api/v1/chat/completions/+server.ts',
        route: null,
        symbol: 'POST',
      },
      caps: { maxSeeds: 8, maxNeighbors: 24, maxHops: 2 },
      labels: { feature_family: 'api-route' },
      primaryFileTargets: ['src/routes/api/v1/chat/completions/+server.ts'],
      seeds: [],
      neighborhood: [],
    });

    const { tool_graph_expand_neighborhood } = await import('./mcp-tool-dispatch.js');
    const result = await tool_graph_expand_neighborhood({
      sourceRefs: ['src/routes/api/v1/chat/completions/+server.ts'],
      maxHops: 2,
      query: 'chat completions route',
      symbol: 'POST',
    });

    expect(result.success).toBe(true);
    expect(mockBuildSubgraph).toHaveBeenCalledWith(
      expect.objectContaining({
        query: 'chat completions route',
        symbol: 'POST',
        filePath: 'src/routes/api/v1/chat/completions/+server.ts',
        maxHops: 2,
      })
    );
    expect(result.data).toEqual(
      expect.objectContaining({
        ok: true,
        sourceRefs: expect.arrayContaining([
          'src/routes/api/v1/chat/completions/+server.ts',
          'src/lib/server/retrieval/query-profile-router.ts',
        ]),
        confidence: expect.any(Number),
        nodes: expect.arrayContaining([
          expect.objectContaining({
            stableKey: 'file:src/routes/api/v1/chat/completions/+server.ts',
            sourceRef: 'src/routes/api/v1/chat/completions/+server.ts',
            isSeed: true,
          }),
        ]),
        edges: expect.any(Array),
        center: 'file:src/routes/api/v1/chat/completions/+server.ts',
        seedEnvelope: expect.objectContaining({
          version: 'subgraph_v1_seed_neighborhood',
        }),
        neighbors: expect.arrayContaining([
          expect.objectContaining({
            stable_key: 'file:src/lib/server/retrieval/query-profile-router.ts',
            pagerank: 0.81,
          }),
        ]),
      })
    );
  });
});

describe('tool_turbovec_rank_chunks', () => {
  it('applies RotorQuant blended scoring formula and sorts descending', async () => {
    const { tool_turbovec_rank_chunks } = await import('./mcp-tool-dispatch.js');
    const result = await tool_turbovec_rank_chunks({
      query: 'chat completions route',
      sourceRefs: ['src/routes/api/v1/chat/completions/+server.ts', 'docs/notes/unverified.md'],
      vectorScores: {
        'src/routes/api/v1/chat/completions/+server.ts': 0.92,
        'docs/notes/unverified.md': 0.4,
      },
      graphScores: {
        'src/routes/api/v1/chat/completions/+server.ts': 0.8,
        'docs/notes/unverified.md': 0.2,
      },
      trustBuckets: {
        'src/routes/api/v1/chat/completions/+server.ts': 'local_verified',
        'docs/notes/unverified.md': 'web_unverified',
      },
      recency: {
        'src/routes/api/v1/chat/completions/+server.ts': 0.7,
        'docs/notes/unverified.md': 0.3,
      },
    });

    expect(result.success).toBe(true);
    expect(result.data).toEqual(
      expect.objectContaining({
        ok: true,
        formula: '0.45*vector + 0.25*graph + 0.20*trust + 0.10*recency',
        ranked: expect.arrayContaining([
          expect.objectContaining({
            sourceRef: 'src/routes/api/v1/chat/completions/+server.ts',
          }),
        ]),
      })
    );

    const payload = result.data as {
      ranked: Array<{ sourceRef: string; finalScore: number }>;
    };
    expect(payload.ranked[0]?.sourceRef).toBe('src/routes/api/v1/chat/completions/+server.ts');
    expect(payload.ranked[0]?.finalScore).toBeGreaterThan(payload.ranked[1]?.finalScore ?? 0);
  });
});
