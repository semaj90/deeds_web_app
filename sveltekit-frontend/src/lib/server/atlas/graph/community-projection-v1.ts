import { createHash } from 'node:crypto';
import { z } from 'zod';

export const CommunityRelationshipTypeSchema = z.enum([
  'CONTAINS',
  'MATERIALIZES',
  'IMPORTS',
  'CALLS',
  'REFERENCES',
  'DEPENDS_ON',
  'IMPLEMENTS',
  'USES_CONCEPT',
  'DERIVED_FROM',
  'SUMMARIZES',
  'PARTICIPATES_IN',
]);

export type CommunityRelationshipTypeV1 = z.infer<typeof CommunityRelationshipTypeSchema>;

export const CommunityProjectionPolicyV1Schema = z.object({
  schema: z.literal('atlas.community-projection-policy.v1'),
  policyRevision: z.string().min(1),
  eligibleRelationshipTypes: z.array(CommunityRelationshipTypeSchema).min(1),
  perTypeAggregation: z.enum(['SUM', 'MAX', 'MEAN', 'BINARY_PRESENCE']),
  typeWeights: z.record(z.string(), z.number().finite().positive()),
  crossTypeAggregation: z.literal('WEIGHTED_SUM'),
  selfLoopPolicy: z.literal('DROP'),
  zeroWeightPolicy: z.literal('DROP'),
}).strict();

export type CommunityProjectionPolicyV1 = z.infer<typeof CommunityProjectionPolicyV1Schema>;

export const DirectedCommunityEdgeV1Schema = z.object({
  srcGpuNodeId: z.number().int().nonnegative(),
  dstGpuNodeId: z.number().int().nonnegative(),
  edgeType: CommunityRelationshipTypeSchema,
  weight: z.number().finite().nonnegative(),
}).strict();

export type DirectedCommunityEdgeV1 = z.infer<typeof DirectedCommunityEdgeV1Schema>;

export interface CommunityProjectionInputV1 {
  sourceGraphRevision: string;
  sourceProjectionRevision: string;
  sourceNodeTableHash: string;
  sourceEdgeTableHash: string;
  projectionRevision: string;
  vertexIds: readonly number[];
  edges: readonly DirectedCommunityEdgeV1[];
  policy: CommunityProjectionPolicyV1;
}

export interface CommunityProjectionTypeContributionV1 {
  edgeType: CommunityRelationshipTypeV1;
  directedEdgeCount: number;
  forwardCount: number;
  reverseCount: number;
  rawWeightSum: number;
  aggregatedRawWeight: number;
  typeWeight: number;
  weightedContribution: number;
}

export interface UndirectedCommunityEdgeV1 {
  uGpuNodeId: number;
  vGpuNodeId: number;
  weight: number;
  contributions: readonly CommunityProjectionTypeContributionV1[];
}

export interface UndirectedCommunityProjectionV1 {
  schema: 'atlas.undirected-community-projection.v1';
  sourceGraphRevision: string;
  sourceProjectionRevision: string;
  sourceNodeTableHash: string;
  sourceEdgeTableHash: string;
  projectionRevision: string;
  policyRevision: string;
  policyChecksum: string;
  vertexIds: readonly number[];
  edges: readonly UndirectedCommunityEdgeV1[];
  diagnostics: {
    inputEdgeCount: number;
    eligibleInputEdgeCount: number;
    excludedRelationshipEdgeCount: number;
    selfLoopDroppedCount: number;
    reciprocalPairCount: number;
    multiTypePairCount: number;
    zeroWeightPairDroppedCount: number;
    projectedEdgeCount: number;
  };
  identityAuthority: false;
  communityIdsAssigned: false;
  canonicalWritesAttempted: false;
  projectionChecksum: string;
}

type MutableTypeBucket = {
  weights: number[];
  forwardCount: number;
  reverseCount: number;
};

type MutablePairBucket = Map<CommunityRelationshipTypeV1, MutableTypeBucket>;

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, stable(child)]),
    );
  }
  return value;
}

export function communityProjectionChecksum(value: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(stable(value)))
    .digest('hex');
}

function parsePolicy(input: CommunityProjectionPolicyV1): CommunityProjectionPolicyV1 {
  const policy = CommunityProjectionPolicyV1Schema.parse(input);
  const eligible = [...policy.eligibleRelationshipTypes].sort();
  if (new Set(eligible).size !== eligible.length) {
    throw new Error('COMMUNITY_POLICY_DUPLICATE_RELATIONSHIP_TYPE');
  }

  const typeWeightKeys = Object.keys(policy.typeWeights).sort();
  if (typeWeightKeys.length !== eligible.length || typeWeightKeys.some((key, index) => key !== eligible[index])) {
    throw new Error('COMMUNITY_POLICY_TYPE_WEIGHT_KEYS_MUST_MATCH_ELIGIBLE_TYPES');
  }
  for (const key of typeWeightKeys) CommunityRelationshipTypeSchema.parse(key);

  return {
    ...policy,
    eligibleRelationshipTypes: eligible as CommunityRelationshipTypeV1[],
    typeWeights: Object.fromEntries(typeWeightKeys.map((key) => [key, policy.typeWeights[key]])),
  };
}

function aggregate(weights: readonly number[], mode: CommunityProjectionPolicyV1['perTypeAggregation']): number {
  if (weights.length === 0) return 0;
  switch (mode) {
    case 'SUM':
      return weights.reduce((sum, value) => sum + value, 0);
    case 'MAX':
      return Math.max(...weights);
    case 'MEAN':
      return weights.reduce((sum, value) => sum + value, 0) / weights.length;
    case 'BINARY_PRESENCE':
      return 1;
  }
}

function pairKey(u: number, v: number): string {
  return `${u}:${v}`;
}

export function buildUndirectedCommunityProjectionV1(
  input: CommunityProjectionInputV1,
): UndirectedCommunityProjectionV1 {
  if (!input.sourceGraphRevision.trim()) throw new Error('COMMUNITY_SOURCE_GRAPH_REVISION_REQUIRED');
  if (!input.sourceProjectionRevision.trim()) throw new Error('COMMUNITY_SOURCE_PROJECTION_REVISION_REQUIRED');
  if (!input.sourceNodeTableHash.trim()) throw new Error('COMMUNITY_SOURCE_NODE_HASH_REQUIRED');
  if (!input.sourceEdgeTableHash.trim()) throw new Error('COMMUNITY_SOURCE_EDGE_HASH_REQUIRED');
  if (!input.projectionRevision.trim()) throw new Error('COMMUNITY_PROJECTION_REVISION_REQUIRED');

  const policy = parsePolicy(input.policy);
  const policyChecksum = communityProjectionChecksum(policy);
  const vertexIds = [...input.vertexIds];
  for (const vertexId of vertexIds) {
    if (!Number.isInteger(vertexId) || vertexId < 0) throw new Error(`COMMUNITY_INVALID_VERTEX_ID:${vertexId}`);
  }
  if (new Set(vertexIds).size !== vertexIds.length) throw new Error('COMMUNITY_DUPLICATE_VERTEX_ID');
  vertexIds.sort((left, right) => left - right);
  const vertexSet = new Set(vertexIds);
  const eligibleTypeSet = new Set<CommunityRelationshipTypeV1>(policy.eligibleRelationshipTypes);

  const buckets = new Map<string, { u: number; v: number; byType: MutablePairBucket }>();
  let eligibleInputEdgeCount = 0;
  let excludedRelationshipEdgeCount = 0;
  let selfLoopDroppedCount = 0;

  for (const raw of input.edges) {
    const edge = DirectedCommunityEdgeV1Schema.parse(raw);
    if (!vertexSet.has(edge.srcGpuNodeId) || !vertexSet.has(edge.dstGpuNodeId)) {
      throw new Error(`COMMUNITY_EDGE_ENDPOINT_NOT_IN_VERTEX_SET:${edge.srcGpuNodeId}:${edge.dstGpuNodeId}`);
    }
    if (!eligibleTypeSet.has(edge.edgeType)) {
      excludedRelationshipEdgeCount += 1;
      continue;
    }
    eligibleInputEdgeCount += 1;
    if (edge.srcGpuNodeId === edge.dstGpuNodeId) {
      selfLoopDroppedCount += 1;
      continue;
    }

    const u = Math.min(edge.srcGpuNodeId, edge.dstGpuNodeId);
    const v = Math.max(edge.srcGpuNodeId, edge.dstGpuNodeId);
    const key = pairKey(u, v);
    let pair = buckets.get(key);
    if (!pair) {
      pair = { u, v, byType: new Map() };
      buckets.set(key, pair);
    }
    let typeBucket = pair.byType.get(edge.edgeType);
    if (!typeBucket) {
      typeBucket = { weights: [], forwardCount: 0, reverseCount: 0 };
      pair.byType.set(edge.edgeType, typeBucket);
    }
    typeBucket.weights.push(edge.weight);
    if (edge.srcGpuNodeId === u) typeBucket.forwardCount += 1;
    else typeBucket.reverseCount += 1;
  }

  let reciprocalPairCount = 0;
  let multiTypePairCount = 0;
  let zeroWeightPairDroppedCount = 0;
  const projectedEdges: UndirectedCommunityEdgeV1[] = [];

  for (const pair of [...buckets.values()].sort((left, right) => left.u - right.u || left.v - right.v)) {
    const contributions: CommunityProjectionTypeContributionV1[] = [];
    let hasForward = false;
    let hasReverse = false;
    for (const [edgeType, bucket] of [...pair.byType.entries()].sort(([left], [right]) => left.localeCompare(right))) {
      hasForward ||= bucket.forwardCount > 0;
      hasReverse ||= bucket.reverseCount > 0;
      const aggregatedRawWeight = aggregate(bucket.weights, policy.perTypeAggregation);
      const typeWeight = policy.typeWeights[edgeType];
      const weightedContribution = aggregatedRawWeight * typeWeight;
      contributions.push({
        edgeType,
        directedEdgeCount: bucket.weights.length,
        forwardCount: bucket.forwardCount,
        reverseCount: bucket.reverseCount,
        rawWeightSum: bucket.weights.reduce((sum, value) => sum + value, 0),
        aggregatedRawWeight,
        typeWeight,
        weightedContribution,
      });
    }
    if (hasForward && hasReverse) reciprocalPairCount += 1;
    if (contributions.length > 1) multiTypePairCount += 1;

    const weight = contributions.reduce((sum, contribution) => sum + contribution.weightedContribution, 0);
    if (weight === 0) {
      zeroWeightPairDroppedCount += 1;
      continue;
    }
    if (!Number.isFinite(weight) || weight < 0) throw new Error(`COMMUNITY_PROJECTED_WEIGHT_INVALID:${pair.u}:${pair.v}`);

    projectedEdges.push({
      uGpuNodeId: pair.u,
      vGpuNodeId: pair.v,
      weight,
      contributions,
    });
  }

  const withoutChecksum = {
    schema: 'atlas.undirected-community-projection.v1' as const,
    sourceGraphRevision: input.sourceGraphRevision,
    sourceProjectionRevision: input.sourceProjectionRevision,
    sourceNodeTableHash: input.sourceNodeTableHash,
    sourceEdgeTableHash: input.sourceEdgeTableHash,
    projectionRevision: input.projectionRevision,
    policyRevision: policy.policyRevision,
    policyChecksum,
    vertexIds,
    edges: projectedEdges,
    diagnostics: {
      inputEdgeCount: input.edges.length,
      eligibleInputEdgeCount,
      excludedRelationshipEdgeCount,
      selfLoopDroppedCount,
      reciprocalPairCount,
      multiTypePairCount,
      zeroWeightPairDroppedCount,
      projectedEdgeCount: projectedEdges.length,
    },
    identityAuthority: false as const,
    communityIdsAssigned: false as const,
    canonicalWritesAttempted: false as const,
  };

  return {
    ...withoutChecksum,
    projectionChecksum: communityProjectionChecksum(withoutChecksum),
  };
}
