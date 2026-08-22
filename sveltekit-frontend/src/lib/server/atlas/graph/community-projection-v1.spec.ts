import { describe, expect, it } from 'vitest';
import {
  buildUndirectedCommunityProjectionV1,
  type CommunityProjectionPolicyV1,
} from './community-projection-v1.js';

const policy: CommunityProjectionPolicyV1 = {
  schema: 'atlas.community-projection-policy.v1',
  policyRevision: 'community-policy-fixture-v1',
  eligibleRelationshipTypes: ['CALLS', 'IMPORTS'],
  perTypeAggregation: 'SUM',
  typeWeights: {
    CALLS: 1,
    IMPORTS: 0.5,
  },
  crossTypeAggregation: 'WEIGHTED_SUM',
  selfLoopPolicy: 'DROP',
  zeroWeightPolicy: 'DROP',
};

const base = {
  sourceGraphRevision: 'graph-r1',
  sourceProjectionRevision: 'projection-r1',
  sourceNodeTableHash: 'node-hash',
  sourceEdgeTableHash: 'edge-hash',
  projectionRevision: 'community-projection-r1',
  vertexIds: [0, 1, 2, 3],
  policy,
};

describe('CommunityProjectionV1', () => {
  it('aggregates reciprocal typed edges deterministically without losing type evidence', () => {
    const projection = buildUndirectedCommunityProjectionV1({
      ...base,
      edges: [
        { srcGpuNodeId: 0, dstGpuNodeId: 1, edgeType: 'CALLS', weight: 2 },
        { srcGpuNodeId: 1, dstGpuNodeId: 0, edgeType: 'CALLS', weight: 3 },
        { srcGpuNodeId: 1, dstGpuNodeId: 0, edgeType: 'IMPORTS', weight: 4 },
      ],
    });

    expect(projection.edges).toHaveLength(1);
    expect(projection.edges[0]).toEqual({
      uGpuNodeId: 0,
      vGpuNodeId: 1,
      weight: 7,
      contributions: [
        {
          edgeType: 'CALLS',
          directedEdgeCount: 2,
          forwardCount: 1,
          reverseCount: 1,
          rawWeightSum: 5,
          aggregatedRawWeight: 5,
          typeWeight: 1,
          weightedContribution: 5,
        },
        {
          edgeType: 'IMPORTS',
          directedEdgeCount: 1,
          forwardCount: 0,
          reverseCount: 1,
          rawWeightSum: 4,
          aggregatedRawWeight: 4,
          typeWeight: 0.5,
          weightedContribution: 2,
        },
      ],
    });
    expect(projection.diagnostics.reciprocalPairCount).toBe(1);
    expect(projection.diagnostics.multiTypePairCount).toBe(1);
    expect(projection.communityIdsAssigned).toBe(false);
    expect(projection.identityAuthority).toBe(false);
  });

  it('drops ineligible relationship types and self-loops while preserving isolated vertices', () => {
    const projection = buildUndirectedCommunityProjectionV1({
      ...base,
      edges: [
        { srcGpuNodeId: 0, dstGpuNodeId: 1, edgeType: 'CALLS', weight: 1 },
        { srcGpuNodeId: 1, dstGpuNodeId: 1, edgeType: 'CALLS', weight: 2 },
        { srcGpuNodeId: 2, dstGpuNodeId: 3, edgeType: 'CONTAINS', weight: 1 },
      ],
    });

    expect(projection.vertexIds).toEqual([0, 1, 2, 3]);
    expect(projection.edges).toHaveLength(1);
    expect(projection.diagnostics).toMatchObject({
      inputEdgeCount: 3,
      eligibleInputEdgeCount: 2,
      excludedRelationshipEdgeCount: 1,
      selfLoopDroppedCount: 1,
      projectedEdgeCount: 1,
    });
  });

  it('is order-independent for vertices, edges, policy relationship order and type weight key order', () => {
    const left = buildUndirectedCommunityProjectionV1({
      ...base,
      vertexIds: [3, 1, 0, 2],
      policy: {
        ...policy,
        eligibleRelationshipTypes: ['IMPORTS', 'CALLS'],
        typeWeights: { IMPORTS: 0.5, CALLS: 1 },
      },
      edges: [
        { srcGpuNodeId: 2, dstGpuNodeId: 0, edgeType: 'IMPORTS', weight: 2 },
        { srcGpuNodeId: 1, dstGpuNodeId: 0, edgeType: 'CALLS', weight: 3 },
        { srcGpuNodeId: 0, dstGpuNodeId: 1, edgeType: 'CALLS', weight: 1 },
      ],
    });
    const right = buildUndirectedCommunityProjectionV1({
      ...base,
      edges: [
        { srcGpuNodeId: 0, dstGpuNodeId: 1, edgeType: 'CALLS', weight: 1 },
        { srcGpuNodeId: 1, dstGpuNodeId: 0, edgeType: 'CALLS', weight: 3 },
        { srcGpuNodeId: 2, dstGpuNodeId: 0, edgeType: 'IMPORTS', weight: 2 },
      ],
    });

    expect(left.policyChecksum).toBe(right.policyChecksum);
    expect(left.projectionChecksum).toBe(right.projectionChecksum);
    expect(left.edges).toEqual(right.edges);
  });

  it('supports explicit MAX, MEAN, and BINARY_PRESENCE per-type aggregation', () => {
    const edges = [
      { srcGpuNodeId: 0, dstGpuNodeId: 1, edgeType: 'CALLS' as const, weight: 2 },
      { srcGpuNodeId: 1, dstGpuNodeId: 0, edgeType: 'CALLS' as const, weight: 4 },
    ];

    const weights = (mode: CommunityProjectionPolicyV1['perTypeAggregation']) =>
      buildUndirectedCommunityProjectionV1({
        ...base,
        policy: {
          ...policy,
          eligibleRelationshipTypes: ['CALLS'],
          typeWeights: { CALLS: 1 },
          perTypeAggregation: mode,
        },
        edges,
      }).edges[0]?.weight;

    expect(weights('MAX')).toBe(4);
    expect(weights('MEAN')).toBe(3);
    expect(weights('BINARY_PRESENCE')).toBe(1);
  });

  it('fails closed when policy weights do not exactly match the eligible relationship set', () => {
    expect(() => buildUndirectedCommunityProjectionV1({
      ...base,
      policy: {
        ...policy,
        typeWeights: { CALLS: 1 },
      },
      edges: [],
    })).toThrow('COMMUNITY_POLICY_TYPE_WEIGHT_KEYS_MUST_MATCH_ELIGIBLE_TYPES');
  });

  it('fails closed when an edge endpoint is outside the frozen vertex set', () => {
    expect(() => buildUndirectedCommunityProjectionV1({
      ...base,
      edges: [
        { srcGpuNodeId: 0, dstGpuNodeId: 99, edgeType: 'CALLS', weight: 1 },
      ],
    })).toThrow('COMMUNITY_EDGE_ENDPOINT_NOT_IN_VERTEX_SET:0:99');
  });
});
