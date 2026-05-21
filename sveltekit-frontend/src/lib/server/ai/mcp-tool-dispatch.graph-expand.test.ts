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

  it('returns deterministic seed envelope plus neighbor expansion payload', async () => {
    mockExpandNeighbours.mockResolvedValueOnce([
      'file:src/lib/server/retrieval/query-profile-router.ts',
      'file:src/lib/server/retrieval/routing-explanation.ts',
    ]);
    mockRedisGet.mockResolvedValueOnce(
      JSON.stringify({
        'file:src/lib/server/retrieval/query-profile-router.ts': 0.81,
      }),
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
      stableKeys: ['file:src/routes/api/v1/chat/completions/+server.ts'],
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
      }),
    );
    expect(result.data).toEqual(
      expect.objectContaining({
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
      }),
    );
  });
});
