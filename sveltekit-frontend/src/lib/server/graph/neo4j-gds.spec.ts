import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  ensureProjection: vi.fn(async (input: { projectionName?: string; force?: boolean }) => ({
    created: Boolean(input.force),
    nodeCount: 12,
    relationshipCount: 34,
  })),
  runPageRank: vi.fn(async (input: { projectionName?: string }) => ({
    nodesUpdated: input.projectionName === 'codeTopology' ? 7 : 0,
    durationMs: 11,
  })),
  getTopPageRank: vi.fn(async (input: { limit: number; nodeType?: string; scoreProperty?: string }) => ([
    {
      labels: ['File'],
      stableKey: 'semantic-1',
      path: 'src/lib/server/graph/neo4j-gds.ts',
      graphPageRank: 0.91,
      louvainCommunity: 2,
    },
    {
      labels: ['File'],
      stableKey: 'semantic-2',
      path: 'src/lib/server/graph/graph-analytics-service.ts',
      graphPageRank: 0.73,
      louvainCommunity: 2,
    },
  ].slice(0, input.limit))),
  expandGraph: vi.fn(async (input: { stableKey: string; maxDepth?: number; limit?: number }) => ({
    nodes: [
      {
        labels: ['File'],
        stableKey: `${input.stableKey}:neighbor`,
        path: 'src/lib/server/graph/graph-retrieval-adapter.ts',
        distance: input.maxDepth ?? 3,
      },
    ],
    apocUsed: true,
  })),
}));

vi.mock('./graph-analytics-service.js', () => ({
  getGraphAnalyticsService: () => ({
    ensureProjection: (...args: Parameters<typeof mocks.ensureProjection>) => mocks.ensureProjection(...args),
    runPageRank: (...args: Parameters<typeof mocks.runPageRank>) => mocks.runPageRank(...args),
    getTopPageRank: (...args: Parameters<typeof mocks.getTopPageRank>) => mocks.getTopPageRank(...args),
    expandGraph: (...args: Parameters<typeof mocks.expandGraph>) => mocks.expandGraph(...args),
  }),
}));

vi.mock('./graph-retrieval-adapter.js', () => ({
  getTopPageRankBounded: (limit: number, nodeType?: string) =>
    mocks.getTopPageRank({ limit, nodeType }),
  expandGraphBounded: (stableKey: string, maxDepth?: number, limit?: number) =>
    mocks.expandGraph({ stableKey, maxDepth, limit }),
}));

describe('neo4j-gds wrappers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('delegates projection and PageRank to the canonical graph service', async () => {
    const { ensureGdsProjection, runPageRankMutate } = await import('./neo4j-gds.js');

    await expect(ensureGdsProjection(true)).resolves.toEqual({
      created: true,
      nodeCount: 12,
      relationshipCount: 34,
    });
    expect(mocks.ensureProjection).toHaveBeenCalledWith({
      projectionName: 'codeTopology',
      force: true,
    });

    await expect(runPageRankMutate()).resolves.toEqual({
      nodesUpdated: 7,
      durationMs: 11,
    });
    expect(mocks.runPageRank).toHaveBeenCalledWith({
      projectionName: 'codeTopology',
    });
  });

  it('delegates graph reads to the bounded retrieval adapter and preserves the legacy shape', async () => {
    const { getTopAuthorityNodes, getImpactNeighborhood } = await import('./neo4j-gds.js');

    await expect(getTopAuthorityNodes(1)).resolves.toEqual([
      {
        labels: ['File'],
        stableKey: 'semantic-1',
        path: 'src/lib/server/graph/neo4j-gds.ts',
        graphPageRank: 0.91,
        louvainCommunity: 2,
      },
    ]);
    expect(mocks.getTopPageRank).toHaveBeenCalledWith({
      limit: 1,
      nodeType: undefined,
      scoreProperty: undefined,
    });

    await expect(getImpactNeighborhood('semantic-1', 2, 5)).resolves.toEqual({
      stableKey: 'semantic-1',
      affected: [
        {
          labels: ['File'],
          stableKey: 'semantic-1:neighbor',
          path: 'src/lib/server/graph/graph-retrieval-adapter.ts',
          distance: 2,
        },
      ],
      totalCount: 1,
      durationMs: expect.any(Number),
    });
    expect(mocks.expandGraph).toHaveBeenCalledWith({
      stableKey: 'semantic-1',
      maxDepth: 2,
      limit: 5,
    });
  });
});
