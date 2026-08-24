import { z } from 'zod';

export const GRAPH_STRUCTURAL_QUALITY_SCHEMA = 'atlas.graph-structural-quality.v1' as const;

export const graphStructuralQualityV1Schema = z.object({
  schema: z.literal(GRAPH_STRUCTURAL_QUALITY_SCHEMA),
  graphRevision: z.string().min(1),
  projectionRevision: z.string().min(1),
  nodeCount: z.number().int().nonnegative(),
  relationshipCount: z.number().int().nonnegative(),
  weaklyConnectedComponentCount: z.number().int().nonnegative(),
  isolatedNodeCount: z.number().int().nonnegative(),
  largestComponentNodeCount: z.number().int().nonnegative(),
  averageDegree: z.number().finite().nonnegative(),
  communityCount: z.number().int().nonnegative(),
  singletonCommunityCount: z.number().int().nonnegative(),
  modularity: z.number().finite().nullable(),
  allowedRelationshipTypes: z.array(z.string().min(1)).min(1),
  communityPromotionEligible: z.boolean(),
  reasonCodes: z.array(z.string().min(1)),
}).strict();

export type GraphStructuralQualityV1 = z.infer<typeof graphStructuralQualityV1Schema>;

export function assessGraphStructuralQualityV1(input: Omit<GraphStructuralQualityV1, 'schema' | 'communityPromotionEligible' | 'reasonCodes'>): GraphStructuralQualityV1 {
  const reasonCodes: string[] = [];
  const averageDegree = input.nodeCount === 0 ? 0 : (2 * input.relationshipCount) / input.nodeCount;
  const isolatedRatio = input.nodeCount === 0 ? 0 : input.isolatedNodeCount / input.nodeCount;
  const singletonRatio = input.communityCount === 0 ? 0 : input.singletonCommunityCount / input.communityCount;

  if (input.nodeCount > 0 && averageDegree < 1) reasonCodes.push('AVERAGE_DEGREE_TOO_LOW');
  if (isolatedRatio > 0.5) reasonCodes.push('ISOLATED_NODE_RATIO_HIGH');
  if (input.weaklyConnectedComponentCount > 1) reasonCodes.push('MULTIPLE_WEAK_COMPONENTS');
  if (singletonRatio > 0.8) reasonCodes.push('COMMUNITY_SINGLETON_RATIO_HIGH');
  if (input.communityCount > 0 && input.communityCount >= input.nodeCount * 0.9) reasonCodes.push('COMMUNITY_COUNT_NEAR_NODE_COUNT');
  if (input.largestComponentNodeCount === 0 && input.nodeCount > 0) reasonCodes.push('LARGEST_COMPONENT_MISSING');

  return graphStructuralQualityV1Schema.parse({
    ...input,
    schema: GRAPH_STRUCTURAL_QUALITY_SCHEMA,
    averageDegree,
    communityPromotionEligible: reasonCodes.length === 0,
    reasonCodes,
  });
}
