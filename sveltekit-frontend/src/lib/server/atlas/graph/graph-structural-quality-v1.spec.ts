import { describe, expect, it } from 'vitest';
import { assessGraphStructuralQualityV1 } from './graph-structural-quality-v1.js';

describe('graph structural quality v1', () => {
  it('rejects a sparse near-isolated projection before community promotion', () => {
    const result = assessGraphStructuralQualityV1({
      graphRevision: 'graph:test:v1',
      projectionRevision: 'projection:test:v1',
      nodeCount: 69009,
      relationshipCount: 3452,
      weaklyConnectedComponentCount: 68000,
      isolatedNodeCount: 65000,
      largestComponentNodeCount: 100,
      communityCount: 4983,
      singletonCommunityCount: 4900,
      modularity: null,
      allowedRelationshipTypes: ['CALLS', 'IMPORTS', 'TESTS'],
    });

    expect(result.communityPromotionEligible).toBe(false);
    expect(result.reasonCodes).toContain('AVERAGE_DEGREE_TOO_LOW');
    expect(result.reasonCodes).toContain('COMMUNITY_SINGLETON_RATIO_HIGH');
  });

  it('accepts a connected bounded graph with non-degenerate communities', () => {
    const result = assessGraphStructuralQualityV1({
      graphRevision: 'graph:test:v1',
      projectionRevision: 'projection:test:v1',
      nodeCount: 5000,
      relationshipCount: 18000,
      weaklyConnectedComponentCount: 1,
      isolatedNodeCount: 0,
      largestComponentNodeCount: 5000,
      communityCount: 120,
      singletonCommunityCount: 4,
      modularity: 0.42,
      allowedRelationshipTypes: ['CALLS', 'REFERENCES', 'IMPORTS', 'TESTS'],
    });

    expect(result.communityPromotionEligible).toBe(true);
    expect(result.averageDegree).toBeCloseTo(7.2);
  });
});
