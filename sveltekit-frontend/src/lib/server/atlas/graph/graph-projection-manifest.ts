import { z } from 'zod';
import type { SGraphSearchAlgorithm } from './s-graph-search.js';

export const GraphProjectionLayoutSchema = z.enum(['COO', 'CSR', 'CSC']);
export const GraphProjectionExecutorSchema = z.enum([
  'TYPESCRIPT_REFERENCE',
  'NETWORKX_REFERENCE',
  'BOOST_GRAPH_CPU',
  'CUGRAPH_GPU',
  'NEO4J_GDS',
]);

export const GraphProjectionManifestV1Schema = z.object({
  schema: z.literal('atlas.graph-projection-manifest.v1'),
  workspaceRevision: z.string().min(1),
  sourceRevision: z.string().min(1),
  graphRevision: z.string().min(1),
  projectionRevision: z.string().min(1),
  directed: z.boolean(),
  weighted: z.boolean(),
  multigraph: z.boolean(),
  symmetrized: z.boolean(),
  transposed: z.boolean(),
  renumbered: z.boolean(),
  layout: GraphProjectionLayoutSchema,
  nodeCount: z.number().int().nonnegative(),
  edgeCount: z.number().int().nonnegative(),
  edgeWeightMinimum: z.number().finite().nonnegative().nullable(),
  negativeWeightsPresent: z.boolean(),
  executor: GraphProjectionExecutorSchema,
  producerRevision: z.string().min(1),
}).strict();
export type GraphProjectionManifestV1 = z.infer<typeof GraphProjectionManifestV1Schema>;

export const GraphAlgorithmCompatibilityV1Schema = z.object({
  schema: z.literal('atlas.graph-algorithm-compatibility.v1'),
  algorithm: z.string().min(1),
  compatible: z.boolean(),
  reasonCodes: z.array(z.string().min(1)).min(1).max(12),
}).strict();
export type GraphAlgorithmCompatibilityV1 = z.infer<typeof GraphAlgorithmCompatibilityV1Schema>;

/**
 * Projection compatibility is validated before executor dispatch. This avoids
 * conflating a mathematically valid algorithm with an incompatible graph view.
 */
export function validateSearchProjection(
  manifest: GraphProjectionManifestV1,
  algorithm: SGraphSearchAlgorithm,
): GraphAlgorithmCompatibilityV1 {
  const reasons: string[] = [];
  let compatible = true;

  if (manifest.nodeCount === 0) {
    compatible = false;
    reasons.push('EMPTY_GRAPH');
  }
  if (manifest.negativeWeightsPresent && (algorithm === 'UNIFORM_COST' || algorithm === 'A_STAR')) {
    compatible = false;
    reasons.push('NONNEGATIVE_EDGE_COST_REQUIRED');
  }
  if (algorithm === 'BREADTH_FIRST' && manifest.weighted) {
    reasons.push('BFS_IGNORES_EDGE_WEIGHTS');
  }
  if ((algorithm === 'GREEDY_BEST_FIRST' || algorithm === 'BEAM') && manifest.weighted) {
    reasons.push('HEURISTIC_POLICY_MAY_IGNORE_GLOBAL_WEIGHT_OPTIMALITY');
  }
  if (manifest.transposed) reasons.push('TRANSPOSED_TRAVERSAL_DIRECTION');
  if (manifest.symmetrized) reasons.push('SYMMETRIZED_GRAPH_SEMANTICS');
  if (reasons.length === 0) reasons.push('PROJECTION_COMPATIBLE');

  return GraphAlgorithmCompatibilityV1Schema.parse({
    schema: 'atlas.graph-algorithm-compatibility.v1',
    algorithm,
    compatible,
    reasonCodes: reasons,
  });
}
