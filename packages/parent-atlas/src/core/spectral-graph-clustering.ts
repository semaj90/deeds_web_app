import { createHash } from 'node:crypto';
import { z } from 'zod';

const id = z.string().min(1);
const revision = z.string().min(1);
const checksum = z.string().regex(/^[a-f0-9]{64}$/);

export const SPECTRAL_EDGE_FAMILIES = [
  'AST_CALL',
  'AST_IMPORT',
  'AST_REFERENCE',
  'NARY_INCIDENCE',
  'ONTOLOGY_ROLE',
  'SEMANTIC_KNN',
  'LEXICAL_COOCCURRENCE',
  'WORKFLOW_DEPENDENCY',
] as const;

export const spectralGraphEdgeRecipeSchema = z.object({
  edge_family: z.enum(SPECTRAL_EDGE_FAMILIES),
  weight: z.number().finite().nonnegative(),
  canonical_fact: z.boolean(),
  derived_similarity: z.boolean(),
  maximum_edges_per_vertex: z.number().int().positive().max(4096).nullable().default(null),
  source_receipt_ids: z.array(id).min(1),
}).strict().superRefine((value, ctx) => {
  if (value.canonical_fact === value.derived_similarity) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'edge recipe must be exactly one of canonical-fact or derived-similarity' });
  }
  if (value.edge_family === 'SEMANTIC_KNN' && !value.derived_similarity) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['derived_similarity'], message: 'semantic KNN edges are derived similarity edges' });
  }
});
export type SpectralGraphEdgeRecipeV1 = z.infer<typeof spectralGraphEdgeRecipeSchema>;

export const spectralGraphProjectionPlanSchema = z.object({
  schema: z.literal('atlas.spectral-graph-projection-plan.v1').default('atlas.spectral-graph-projection-plan.v1'),
  plan_id: id,
  workflow_id: id,
  workflow_revision: z.number().int().nonnegative(),
  source_snapshot_revision: revision,
  graph_revision: revision,
  feature_revision: revision,
  row_identity_checksum: checksum,
  vertex_count: z.number().int().positive(),
  edge_recipes: z.array(spectralGraphEdgeRecipeSchema).min(1),
  symmetrization: z.enum(['MAX', 'MEAN', 'SUM']),
  remove_self_loops: z.literal(true).default(true),
  sparse_representation: z.enum(['COO', 'CSR']),
  canonical_relationships_remain_external: z.literal(true).default(true),
  canonical_authority: z.literal(false).default(false),
}).strict();
export type SpectralGraphProjectionPlanV1 = z.infer<typeof spectralGraphProjectionPlanSchema>;

export const SPECTRAL_METHODS = ['BALANCED_CUT', 'MODULARITY_MAXIMIZATION'] as const;

export const spectralClusteringPlanSchema = z.object({
  schema: z.literal('atlas.spectral-clustering-plan.v1').default('atlas.spectral-clustering-plan.v1'),
  plan_id: id,
  workflow_id: id,
  workflow_revision: z.number().int().nonnegative(),
  graph_projection_plan_id: id,
  graph_revision: revision,
  method: z.enum(SPECTRAL_METHODS),
  executor: z.literal('CUGRAPH_SINGLE_GPU'),
  num_clusters: z.number().int().min(2).max(4096),
  num_eigenvectors: z.number().int().min(1).max(4096),
  eigen_tolerance: z.number().finite().positive(),
  eigen_max_iterations: z.number().int().positive(),
  kmeans_tolerance: z.number().finite().positive(),
  kmeans_max_iterations: z.number().int().positive(),
  random_seed: z.number().int().nonnegative(),
  cluster_count_owner: z.enum(['FIXED_POLICY', 'EIGENGAP_CHALLENGER', 'LEIDEN_CHALLENGER', 'OPERATOR']),
  exact_relationship_promotion_required: z.literal(true).default(true),
  canonical_authority: z.literal(false).default(false),
}).strict().superRefine((value, ctx) => {
  if (value.num_eigenvectors > value.num_clusters) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['num_eigenvectors'], message: 'num_eigenvectors must be <= num_clusters' });
  }
});
export type SpectralClusteringPlanV1 = z.infer<typeof spectralClusteringPlanSchema>;

export const spectralClusterAssignmentSchema = z.object({
  vertex_ordinal: z.number().int().nonnegative(),
  candidate_id: id,
  cluster_id: z.number().int().nonnegative(),
}).strict();

export const spectralClusteringReceiptSchema = z.object({
  schema: z.literal('atlas.spectral-clustering-receipt.v1').default('atlas.spectral-clustering-receipt.v1'),
  receipt_id: id,
  workflow_id: id,
  workflow_revision: z.number().int().nonnegative(),
  plan_id: id,
  source_snapshot_revision: revision,
  graph_revision: revision,
  row_identity_checksum: checksum,
  method: z.enum(SPECTRAL_METHODS),
  executor: z.literal('CUGRAPH_SINGLE_GPU'),
  vertex_count: z.number().int().positive(),
  edge_count: z.number().int().nonnegative(),
  cluster_count: z.number().int().min(2),
  assignments_checksum: checksum,
  modularity_score: z.number().finite().nullable().default(null),
  edge_cut_score: z.number().finite().nullable().default(null),
  ratio_cut_score: z.number().finite().nullable().default(null),
  runtime_ms: z.number().finite().nonnegative(),
  peak_gpu_bytes: z.number().int().nonnegative().nullable().default(null),
  status: z.enum(['WRITTEN_UNPROVEN', 'VERIFIED', 'REJECTED']),
  source_receipt_ids: z.array(id).min(1),
  canonical_authority: z.literal(false).default(false),
  producer_revision: revision,
}).strict();
export type SpectralClusteringReceiptV1 = z.infer<typeof spectralClusteringReceiptSchema>;

export const graphClusterRoutingFeatureSchema = z.object({
  schema: z.literal('atlas.graph-cluster-routing-feature.v1').default('atlas.graph-cluster-routing-feature.v1'),
  candidate_id: id,
  row_ordinal: z.number().int().nonnegative(),
  row_identity_checksum: checksum,
  graph_revision: revision,
  spectral_cluster_id: z.number().int().nonnegative(),
  spectral_method: z.enum(SPECTRAL_METHODS),
  spectral_receipt_id: id,
  pagerank: z.number().finite().nullable().default(null),
  ppr: z.number().finite().nullable().default(null),
  leiden_community: z.string().min(1).nullable().default(null),
  kmeans_cluster: z.number().int().nonnegative().nullable().default(null),
  som_cell: z.string().min(1).nullable().default(null),
  canonical_authority: z.literal(false).default(false),
}).strict();
export type GraphClusterRoutingFeatureV1 = z.infer<typeof graphClusterRoutingFeatureSchema>;

export const subgraphSynthesisRequestSchema = z.object({
  schema: z.literal('atlas.subgraph-synthesis-request.v1').default('atlas.subgraph-synthesis-request.v1'),
  request_id: id,
  workflow_id: id,
  workflow_revision: z.number().int().nonnegative(),
  seed_candidate_ids: z.array(id).min(1).max(1024),
  graph_revision: revision,
  spectral_cluster_ids: z.array(z.number().int().nonnegative()).max(128).default([]),
  maximum_vertices: z.number().int().positive().max(100_000),
  maximum_edges: z.number().int().positive().max(1_000_000),
  include_edge_families: z.array(z.enum(SPECTRAL_EDGE_FAMILIES)).min(1),
  exact_source_promotion_required: z.literal(true).default(true),
  canonical_authority: z.literal(false).default(false),
}).strict();
export type SubgraphSynthesisRequestV1 = z.infer<typeof subgraphSynthesisRequestSchema>;

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

export function spectralAssignmentsChecksum(assignments: readonly z.infer<typeof spectralClusterAssignmentSchema>[]): string {
  const normalized = assignments
    .map((assignment) => spectralClusterAssignmentSchema.parse(assignment))
    .sort((a, b) => a.vertex_ordinal - b.vertex_ordinal || a.candidate_id.localeCompare(b.candidate_id));
  return createHash('sha256').update(stable(normalized), 'utf8').digest('hex');
}

export function defaultSpectralClusteringPlan(input: {
  planId: string;
  workflowId: string;
  workflowRevision: number;
  graphProjectionPlanId: string;
  graphRevision: string;
  numClusters: number;
  randomSeed: number;
  method?: SpectralClusteringPlanV1['method'];
}): SpectralClusteringPlanV1 {
  const numEigenvectors = Math.min(Math.max(2, Math.ceil(Math.log2(input.numClusters))), input.numClusters);
  return spectralClusteringPlanSchema.parse({
    plan_id: input.planId,
    workflow_id: input.workflowId,
    workflow_revision: input.workflowRevision,
    graph_projection_plan_id: input.graphProjectionPlanId,
    graph_revision: input.graphRevision,
    method: input.method ?? 'BALANCED_CUT',
    executor: 'CUGRAPH_SINGLE_GPU',
    num_clusters: input.numClusters,
    num_eigenvectors: numEigenvectors,
    eigen_tolerance: 1e-5,
    eigen_max_iterations: 100,
    kmeans_tolerance: 1e-5,
    kmeans_max_iterations: 100,
    random_seed: input.randomSeed,
    cluster_count_owner: 'FIXED_POLICY',
    exact_relationship_promotion_required: true,
    canonical_authority: false,
  });
}
