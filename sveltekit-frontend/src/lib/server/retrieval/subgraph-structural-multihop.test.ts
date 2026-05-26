import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  expandNeighbours: vi.fn(async (stableKey: string) => {
    if (stableKey === 'file:src/routes/api/sample/+server.ts') {
      return [
        'file:src/lib/server/sample/service.ts',
        'file:src/lib/server/db/schema/sample.schema.ts',
        'file:src/routes/api/sample/+server.ts',
      ];
    }

    if (stableKey === 'file:src/lib/server/sample/service.ts') {
      return [
        'file:src/lib/server/db/schema/sample.schema.ts',
        'file:src/lib/server/sample/helpers.ts',
      ];
    }

    return [];
  }),
  fetchAuthorityScores: vi.fn(async (stableKeys: string[]) => Object.fromEntries(
    stableKeys.map((stableKey, index) => [stableKey, { pagerank: 0.9 - index * 0.1 }]),
  )),
}));

vi.mock('$lib/server/search/neo4j-rerank.js', () => ({
  expandNeighbours: (...args: unknown[]) => mocks.expandNeighbours(...args),
  fetchAuthorityScores: (...args: unknown[]) => mocks.fetchAuthorityScores(...args),
}));

describe('subgraph_v2_structural_multihop', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns route, service, and schema chains with cycle and recommendation signals', async () => {
    const { buildSubgraphV2StructuralMultihop } = await import('./subgraph-structural-multihop.js');

    const result = await buildSubgraphV2StructuralMultihop({
      filePath: 'src/routes/api/sample/+server.ts',
      maxHops: 3,
      maxNodes: 16,
      maxCycles: 4,
    });

    expect(result.version).toBe('subgraph_v2_structural_multihop');
    expect(result.seed.version).toBe('subgraph_v1_seed_neighborhood');
    expect(result.chains.route.nodes.map((node) => node.filePath)).toContain('src/routes/api/sample/+server.ts');
    expect(result.chains.service.nodes.map((node) => node.filePath)).toContain('src/lib/server/sample/service.ts');
    expect(result.chains.schema.nodes.map((node) => node.filePath)).toContain('src/lib/server/db/schema/sample.schema.ts');
    expect(result.issues.map((issue) => issue.code)).toContain('cycle_detected');
    expect(result.recommendations).toEqual(expect.arrayContaining([
      expect.stringContaining('Reduce maxHops or pass a narrower anchor'),
    ]));
    expect(result.diagnostics.cycleCount).toBeGreaterThan(0);
  });

  it('flags missing seed inputs and recommends an anchor', async () => {
    const { buildSubgraphV2StructuralMultihop } = await import('./subgraph-structural-multihop.js');

    const result = await buildSubgraphV2StructuralMultihop({
      maxHops: 2,
      maxNodes: 8,
    });

    expect(result.issues.map((issue) => issue.code)).toContain('missing_seed');
    expect(result.recommendations).toEqual(expect.arrayContaining([
      expect.stringContaining('stable anchor'),
    ]));
  });

  it('reports node cap pressure with a concrete recommendation', async () => {
    const { buildSubgraphV2StructuralMultihop } = await import('./subgraph-structural-multihop.js');

    const result = await buildSubgraphV2StructuralMultihop({
      filePath: 'src/routes/api/sample/+server.ts',
      maxHops: 3,
      maxNodes: 2,
      maxCycles: 1,
    });

    expect(result.issues.map((issue) => issue.code)).toContain('node_cap_reached');
    expect(result.issues.map((issue) => issue.code)).toContain('cycle_detected');
    expect(result.recommendations).toEqual(expect.arrayContaining([
      expect.stringContaining('Increase maxNodes only after narrowing the seed contract'),
    ]));
    expect(result.diagnostics.truncated).toBe(true);
  });
});
