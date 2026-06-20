import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  generateSingleEmbedding: vi.fn(async () => Array.from({ length: 768 }, (_, i) => (i === 0 ? 1 : 0))),
  nearestCluster: vi.fn(async () => ({ clusterId: 7 })),
  getTopAuthorityNodes: vi.fn(async () => ([{ stableKey: 'semantic-1', graphAuthorityScore: 0.82, graphPageRank: 0.31 }])),
  getImpactNeighborhood: vi.fn(async () => ({ nodes: [{ id: 'semantic-1' }], relationships: [{ source: 'semantic-1', target: 'semantic-2', type: 'RELATED_TO' }] })),
  multiQueryGenerate: vi.fn(async () => ['graph retrieval', 'retrieval graph']),
  loadAceContextPlannerHit: vi.fn(async () => ({ packet: { query: 'graph retrieval' } })),
  buildAceContextPlannerState: vi.fn(() => ({ query: 'graph retrieval' })),
  searchByCluster: vi.fn(async () => ([{ id: 'lens-1', title: 'Cluster Lens', summary: 'Cluster summary', relevanceScore: 0.9 }])),
}));

vi.mock('$lib/server/env.server.js', () => ({
  ENV: {
    QDRANT_URL: 'http://qdrant.test',
    TURBOVEC_SIDECAR: 'http://turbovec.test',
  },
}));

vi.mock('$lib/server/grpc/embedding-client.js', () => ({
  generateSingleEmbedding: (...args: unknown[]) => mocks.generateSingleEmbedding(...args),
}));

vi.mock('./centroid-cache.js', () => ({
  nearestCluster: (...args: unknown[]) => mocks.nearestCluster(...args),
}));

vi.mock('$lib/server/graph/neo4j-gds.js', () => ({
  getTopAuthorityNodes: (...args: unknown[]) => mocks.getTopAuthorityNodes(...args),
  getImpactNeighborhood: (...args: unknown[]) => mocks.getImpactNeighborhood(...args),
  runDijkstraContext: vi.fn(async ({ sourceRef }) => ({
    sourceRef,
    hits: [],
    totalCount: 0,
    durationMs: 0,
    gdsUsed: false,
  })),
}));

vi.mock('$lib/server/ai/multi-query-generator.js', () => ({
  MultiQueryGenerator: {
    generate: (...args: unknown[]) => mocks.multiQueryGenerate(...args),
  },
}));

vi.mock('$lib/server/ace/context-cache-planner.js', () => ({
  buildAceContextPlannerState: (...args: unknown[]) => mocks.buildAceContextPlannerState(...args),
  loadAceContextPlannerHit: (...args: unknown[]) => mocks.loadAceContextPlannerHit(...args),
}));

vi.mock('./summary-lenses.js', () => ({
  SummaryLensesService: {
    searchByCluster: (...args: unknown[]) => mocks.searchByCluster(...args),
  },
}));

vi.mock('$lib/server/redis.js', () => ({
  getRedis: () => ({ get: vi.fn(async () => null) }),
}));

describe('HyperRagFusionService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the canonical shape with reasons, signals, provenance, and graph paths', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/collections/codebase_chunks_768/points/search')) {
        return new Response(JSON.stringify({
          result: [{
            id: 'semantic-1',
            score: 0.91,
            payload: {
              stable_key: 'semantic-1',
              path: 'src/lib/server/retrieval/hyperrag-fusion-service.ts',
              content: 'Semantic match body',
              graph_authority_score: 0.82,
              pageRank: 0.31,
              gpuCluster: 7,
            },
            vector: Array.from({ length: 768 }, (_, i) => (i === 0 ? 1 : 0)),
          }],
        }), { status: 200 });
      }

      if (url.includes('/collections/glyph_atlas/points/search')) {
        return new Response(JSON.stringify({
          result: [{
            id: 'lens-1',
            score: 0.81,
            payload: { path: 'src/lib/server/retrieval/summary-lenses.ts', content: 'Summary lens body' },
          }],
        }), { status: 200 });
      }

      if (url.includes('turbovec.test/search')) {
        return new Response(JSON.stringify({ ids: ['semantic-1'] }), { status: 200 });
      }

      return new Response('{}', { status: 404 });
    }));

    const { HyperRagFusionService } = await import('./hyperrag-fusion-service.js');
    const result = await HyperRagFusionService.getInstance().search({ query: 'graph retrieval', mode: 'codebase' });

    expect(result.query).toBe('graph retrieval');
    expect(Array.isArray(result.hits)).toBe(true);
    expect(Array.isArray(result.graphPaths)).toBe(true);
    expect(result.hits[0].reasons.length).toBeGreaterThan(0);
    expect(result.hits[0].signals).toEqual(expect.objectContaining({ dense: expect.any(Number), turbovec: expect.any(Number) }));
    expect('vector' in result.hits[0]).toBe(false);
    expect(result.provenance).toEqual(expect.objectContaining({ qdrant: true, turbovec: true, redis: true, neo4j: true, ace: true }));
    expect(result.graphPaths).toHaveLength(1);
    expect(result.routingExplanation).toEqual(expect.objectContaining({ profile: 'general' }));
    expect(result.routingExplanation?.redisCards).toEqual(expect.arrayContaining(['ace:cluster:7']));
    expect(result.routingExplanation?.subgraphSeedEnvelope).toEqual(
      expect.objectContaining({
        version: 'subgraph_v1_seed_neighborhood',
        contract: expect.objectContaining({ query: 'graph retrieval' }),
      }),
    );
  });

  it('fails open when TurboVec, Neo4j, Redis, and ACE lanes are unavailable', async () => {
    mocks.nearestCluster.mockResolvedValueOnce(null);
    mocks.getTopAuthorityNodes.mockRejectedValueOnce(new Error('neo4j unavailable'));
    mocks.loadAceContextPlannerHit.mockResolvedValueOnce(null);
    mocks.searchByCluster.mockResolvedValueOnce([]);

    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/collections/codebase_chunks_768/points/search')) {
        return new Response(JSON.stringify({
          result: [{
            id: 'semantic-1',
            score: 0.91,
            payload: { stable_key: 'semantic-1', path: 'src/lib/server/retrieval/hyperrag-fusion-service.ts', content: 'Semantic match body' },
            vector: Array.from({ length: 768 }, (_, i) => (i === 0 ? 1 : 0)),
          }],
        }), { status: 200 });
      }

      if (url.includes('/collections/glyph_atlas/points/search')) {
        return new Response(JSON.stringify({ result: [] }), { status: 200 });
      }

      if (url.includes('turbovec.test/search')) {
        throw new Error('TurboVec offline');
      }

      return new Response('{}', { status: 404 });
    }));

    const { HyperRagFusionService } = await import('./hyperrag-fusion-service.js');
    const result = await HyperRagFusionService.getInstance().search({ query: 'graph retrieval', mode: 'codebase' });

    expect(result.hits).toHaveLength(1);
    expect(result.provenance).toEqual(expect.objectContaining({ qdrant: true, turbovec: false, redis: false, neo4j: false, ace: false }));
    expect(Array.isArray(result.graphPaths)).toBe(true);
  });
});
