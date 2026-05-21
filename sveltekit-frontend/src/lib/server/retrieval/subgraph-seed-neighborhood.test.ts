// @vitest-environment node
import { describe, expect, it } from 'vitest';

import {
  buildSubgraphV1SeedNeighborhood,
  fromStableFileKey,
  normalizeFeatureLabel,
  toStableFileKey,
} from './subgraph-seed-neighborhood.js';

describe('subgraph_v1_seed_neighborhood', () => {
  it('builds deterministic seeds from route, file, symbol, and cluster priors', async () => {
    const result = await buildSubgraphV1SeedNeighborhood(
      {
        route: '/api/v1/chat/completions',
        symbol: 'POST',
        maxSeeds: 6,
        maxNeighbors: 6,
      },
      {
        resolveRouteContext: (route) => ({
          route,
          file: 'src/routes/api/v1/chat/completions/+server.ts',
          clusters: [72, 73, 94],
        }),
        expandFileStableKey: async () => [],
        fetchAuthority: async () => ({}),
      },
    );

    expect(result.version).toBe('subgraph_v1_seed_neighborhood');
    expect(result.labels.feature_family).toBe('api-route');
    expect(result.primaryFileTargets).toContain('src/routes/api/v1/chat/completions/+server.ts');
    expect(result.seeds.map((seed) => seed.kind)).toEqual(
      expect.arrayContaining(['route', 'file', 'symbol', 'cluster']),
    );
    expect(result.seeds.find((seed) => seed.kind === 'file')?.stableKey).toBe(
      'file:src/routes/api/v1/chat/completions/+server.ts',
    );
  });

  it('caps and ranks graph neighbors while excluding the seed file itself', async () => {
    const result = await buildSubgraphV1SeedNeighborhood(
      {
        filePath: 'src/lib/server/retrieval/hyperrag-fusion-service.ts',
        maxNeighbors: 2,
      },
      {
        resolveRouteContext: () => null,
        expandFileStableKey: async () => [
          'file:src/lib/server/retrieval/hyperrag-fusion-service.ts',
          'file:src/lib/server/retrieval/query-profile-router.ts',
          'file:src/lib/server/retrieval/routing-explanation.ts',
          'file:src/lib/server/ace/context-assembler.ts',
        ],
        fetchAuthority: async () => ({
          'file:src/lib/server/retrieval/query-profile-router.ts': { pagerank: 0.8 },
          'file:src/lib/server/retrieval/routing-explanation.ts': { pagerank: 0.3 },
          'file:src/lib/server/ace/context-assembler.ts': { pagerank: 0.6 },
        }),
      },
    );

    expect(result.neighborhood).toHaveLength(2);
    expect(result.neighborhood.every((node) => node.filePath !== result.contract.filePath)).toBe(true);
    expect(result.neighborhood[0].filePath).toBe('src/lib/server/retrieval/query-profile-router.ts');
    expect(result.neighborhood[0].score).toBeGreaterThan(result.neighborhood[1].score);
  });

  it('normalizes label aliases into canonical feature families', () => {
    expect(normalizeFeatureLabel('API')).toBe('api-route');
    expect(normalizeFeatureLabel('topology-cluster')).toBe('graph');
    expect(normalizeFeatureLabel('redis')).toBe('cache');
    expect(normalizeFeatureLabel('unknown-shape')).toBe('general');
  });

  it('round-trips stable file keys', () => {
    const filePath = 'src/lib/server/labels/normalize-labels.ts';
    expect(toStableFileKey(filePath)).toBe('file:src/lib/server/labels/normalize-labels.ts');
    expect(fromStableFileKey('file:src/lib/server/labels/normalize-labels.ts')).toBe(filePath);
    expect(fromStableFileKey(filePath)).toBe(filePath);
  });
});
