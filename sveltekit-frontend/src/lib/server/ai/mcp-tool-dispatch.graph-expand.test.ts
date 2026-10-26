// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DISPATCHER_TOOLS_SCHEMAS } from '../../../mcp/dispatcher-tools-schemas.js';

const mockExpandNeighbourPathEdges = vi.hoisted(() => vi.fn());
const mockBuildSubgraph = vi.hoisted(() => vi.fn());
const mockRedisGet = vi.hoisted(() => vi.fn());
const mockRapidsBfs = vi.hoisted(() => vi.fn());
const mockRapidsSourceRefBfs = vi.hoisted(() => vi.fn());
const mockRapidsCommunity = vi.hoisted(() => vi.fn());

vi.mock('$lib/server/atlas/graph/atlas-rapids-pagerank-client.js', () => ({
  createAtlasRapidsPageRankClient: () => ({ bfs: mockRapidsBfs, sourceRefBfs: mockRapidsSourceRefBfs }),
}));

vi.mock('$lib/server/graph/rapids-community-client.js', () => ({
  runRapidsCommunityV1: mockRapidsCommunity,
}));

vi.mock('$lib/server/search/neo4j-rerank.js', () => ({
  expandNeighbourPathEdges: mockExpandNeighbourPathEdges,
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

  it('advertises Leiden with the same bounded diagnostic request contract', () => {
    const tool = DISPATCHER_TOOLS_SCHEMAS.find(({ name }) => name === 'graph:community_leiden');
    expect(tool?.inputSchema).toEqual(expect.objectContaining({
      properties: expect.objectContaining({
        nodes: expect.objectContaining({ maxItems: 512 }),
        edges: expect.objectContaining({ maxItems: 4096 }),
      }),
      required: expect.arrayContaining(['graphRevision', 'topologyHash', 'projectionRevision', 'nodes', 'edges']),
    }));
    expect(tool?.description).toContain('diagnostic-only');
  });

  it('bounds diagnostic Leiden requests and labels results noncanonical', async () => {
    mockRapidsCommunity.mockResolvedValueOnce({
      schema: 'atlas.community-partition-response.v1',
      algorithm: 'leiden',
      algorithmId: 'cugraph.leiden.26.06',
      backend: 'cugraph',
      graphRevision: 'graph:r1',
      topologyHash: 'sha256:topology',
      projectionRevision: 'projection:r1',
      assignments: [],
      communities: [],
    });
    const { executeGraphCommunityLeidenMcpTool } = await import('./mcp-tool-dispatch.js');
    const invalid = await executeGraphCommunityLeidenMcpTool({
      graphRevision: 'graph:r1', topologyHash: 'sha256:topology', projectionRevision: 'projection:r1',
      nodes: [], edges: [],
    });
    expect(invalid.success).toBe(false);
    expect(mockRapidsCommunity).not.toHaveBeenCalled();

    const valid = await executeGraphCommunityLeidenMcpTool({
      graphRevision: 'graph:r1', topologyHash: 'sha256:topology', projectionRevision: 'projection:r1',
      nodes: [{ nodeId: 'node:a' }, { nodeId: 'node:b' }],
      edges: [{ source: 'node:a', target: 'node:b', weight: 1 }],
      randomState: 7,
    });
    expect(valid.success).toBe(true);
    expect(mockRapidsCommunity).toHaveBeenCalledWith(expect.objectContaining({
      algorithm: 'leiden', graphRevision: 'graph:r1', randomState: 7,
    }));
    expect(valid.data).toEqual(expect.objectContaining({
      status: 'DIAGNOSTIC_ONLY', canonicalAuthority: false, productionAdmitted: false, writesPerformed: false,
    }));
  });

  it('returns sourceRefs-first graph payload with compatibility neighbors', async () => {
    mockExpandNeighbourPathEdges.mockResolvedValueOnce([
      { from: 'file:src/start.ts', to: 'file:src/lib/server/retrieval/query-profile-router.ts', relation: 'CALLS', hop: 1 },
      { from: 'file:src/lib/server/retrieval/query-profile-router.ts', to: 'file:src/lib/server/retrieval/routing-explanation.ts', relation: 'IMPORTS', hop: 2 },
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
    expect(result.data).toEqual(expect.objectContaining({
      edges: [
        expect.objectContaining({ relation: 'CALLS', hop: 1 }),
        expect.objectContaining({ relation: 'IMPORTS', hop: 2 }),
      ],
      confidence: 0,
    }));
  });

  it('routes only checksum-qualified resident graph lookups and rejects unbounded inputs', async () => {
    mockRapidsBfs.mockResolvedValueOnce({
      schema: 'atlas.graph-bfs-receipt.v1',
      graphRevision: 'g-1',
      writesPerformed: false,
      canonicalAuthority: false,
    });
    const { executeGraphResidentBfsMcpTool } = await import('./mcp-tool-dispatch.js');
    const invalid = await executeGraphResidentBfsMcpTool({ graphRevision: 'g-1', startNodeKey: 'node:1' });
    expect(invalid.success).toBe(false);
    expect(mockRapidsBfs).not.toHaveBeenCalled();

    const valid = await executeGraphResidentBfsMcpTool({
      graphRevision: 'g-1',
      projectionRevision: 'p-1',
      projectionChecksum: 'sha256:p',
      startNodeKey: 'node:1',
      depthLimit: 2,
      expectedArtifactChecksum: 'sha256:a',
      expectedGraphOrdinalMapChecksum: 'sha256:o',
    });
    expect(valid.success).toBe(true);
    expect(mockRapidsBfs).toHaveBeenCalledWith(expect.objectContaining({
      graphRevision: 'g-1',
      expectedGraphOrdinalMapChecksum: 'sha256:o',
    }));
  });

  it('routes exact revision-qualified resident sourceRef lookups without allowing arbitrary references', async () => {
    mockRapidsSourceRefBfs.mockResolvedValueOnce({
      schema: 'atlas.graph-source-ref-bfs-receipt.v1',
      sourceRef: 'src/start.ts',
      sourceRevision: 'source:r1',
      workspaceRevision: 'workspace:r1',
      graphRevision: 'g-1',
      projectionRevision: 'p-1',
      projectionChecksum: 'sha256:p',
      artifactChecksum: 'sha256:a',
      graphOrdinalMapChecksum: 'sha256:o',
      matches: [],
      writesPerformed: false,
      canonicalAuthority: false,
    });
    const { executeGraphResidentSourceRefBfsMcpTool } = await import('./mcp-tool-dispatch.js');
    const invalid = await executeGraphResidentSourceRefBfsMcpTool({
      graphRevision: 'g-1',
      sourceRef: 'src/start.ts',
    });
    expect(invalid.success).toBe(false);
    expect(mockRapidsSourceRefBfs).not.toHaveBeenCalled();

    const valid = await executeGraphResidentSourceRefBfsMcpTool({
      graphRevision: 'g-1',
      projectionRevision: 'p-1',
      projectionChecksum: 'sha256:p',
      sourceRef: 'src/start.ts',
      expectedSourceRevision: 'source:r1',
      expectedWorkspaceRevision: 'workspace:r1',
      depthLimit: 1,
      expectedArtifactChecksum: 'sha256:a',
      expectedGraphOrdinalMapChecksum: 'sha256:o',
    });
    expect(valid.success).toBe(true);
    expect(mockRapidsSourceRefBfs).toHaveBeenCalledWith(expect.objectContaining({
      sourceRef: 'src/start.ts',
      expectedSourceRevision: 'source:r1',
      expectedWorkspaceRevision: 'workspace:r1',
    }));
  });

  it('validates graph MCP seeds and forwards bounded requests to the real expander', async () => {
    mockExpandNeighbourPathEdges.mockResolvedValueOnce([
      { from: 'file:src/start.ts', to: 'file:src/neighbor.ts', relation: 'CALLS', hop: 1 },
    ]);
    mockRedisGet.mockResolvedValueOnce(null);
    mockBuildSubgraph.mockResolvedValueOnce({
      version: 'subgraph_v1_seed_neighborhood',
      contract: {},
      caps: { maxSeeds: 8, maxNeighbors: 24, maxHops: 2 },
      labels: {},
      primaryFileTargets: [],
      seeds: [],
      neighborhood: [],
    });

    const { executeGraphExpandMcpTool } = await import('./mcp-tool-dispatch.js');
    const missingSeed = await executeGraphExpandMcpTool({ maxHops: 2 });
    expect(missingSeed.success).toBe(false);
    expect(mockExpandNeighbourPathEdges).not.toHaveBeenCalled();

    const result = await executeGraphExpandMcpTool({
      sourceRefs: ['src/start.ts'],
      maxHops: 2,
      limit: 12,
    });

    expect(result.success).toBe(true);
    expect(mockExpandNeighbourPathEdges).toHaveBeenCalledWith('file:src/start.ts', 2, 12);
    expect(mockBuildSubgraph).toHaveBeenCalledWith(
      expect.objectContaining({ maxHops: 2 })
    );
  });

  it('honors an explicit one-hop limit despite the legacy depth default', async () => {
    mockExpandNeighbourPathEdges.mockResolvedValueOnce([]);
    mockRedisGet.mockResolvedValueOnce(null);
    mockBuildSubgraph.mockResolvedValueOnce({
      version: 'subgraph_v1_seed_neighborhood',
      contract: {},
      caps: { maxSeeds: 8, maxNeighbors: 24, maxHops: 1 },
      labels: {},
      primaryFileTargets: [],
      seeds: [],
      neighborhood: [],
    });

    const { executeGraphExpandMcpTool } = await import('./mcp-tool-dispatch.js');
    const result = await executeGraphExpandMcpTool({ sourceRefs: ['src/start.ts'], maxHops: 1 });

    expect(result.success).toBe(true);
    expect(mockExpandNeighbourPathEdges).toHaveBeenCalledWith('file:src/start.ts', 1, 40);
    expect(mockBuildSubgraph).toHaveBeenCalledWith(expect.objectContaining({ maxHops: 1 }));
    expect(result.data).toEqual(expect.objectContaining({
      confidence: 0,
      nodes: [expect.objectContaining({ isSeed: true })],
      edges: [],
    }));
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
