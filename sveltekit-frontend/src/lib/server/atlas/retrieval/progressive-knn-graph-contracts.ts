import { z } from 'zod';
import { AlgorithmExecutionManifestV1Schema } from '../runtime/algorithm-execution-manifest.js';

/**
 * Progressive retrieval contracts for:
 * Qdrant prefetch -> canonical semantic_768 top-K -> exact/challenger KNN ->
 * induced graph -> bounded graph search/multihop synthesis.
 *
 * LANE != EXECUTOR remains invariant. Qdrant, cuVS brute force and CAGRA are
 * executors/challengers inside the same semantic evidence family.
 */

export const ProgressiveRepresentationSchema = z.enum([
  'semantic_768',
  'pca_128',
  'latent_128',
  'pca_64',
  'latent_64',
]);
export type ProgressiveRepresentation = z.infer<typeof ProgressiveRepresentationSchema>;

export const ProgressiveRepresentationRoleSchema = z.enum([
  'CANONICAL_SEMANTIC',
  'DERIVED_RERANK',
  'ROUTING_ONLY',
]);

export const ProgressiveExecutorSchema = z.enum([
  'QDRANT',
  'CUVS_BRUTE_FORCE',
  'CUVS_CAGRA',
  'PYTORCH_TOPK',
  'NETWORKX_REFERENCE',
  'CUGRAPH_GPU',
  'TYPESCRIPT_REFERENCE',
]);

export const ProgressiveStageKindSchema = z.enum([
  'QDRANT_PREFETCH',
  'REPRESENTATION_PROMOTION',
  'KNN_EXACT',
  'KNN_CHALLENGER',
  'KNN_GRAPH_BUILD',
  'GRAPH_SEARCH',
  'MULTIHOP_SYNTHESIS',
  'CACHE_MATERIALIZE',
]);

export const ProgressiveRepresentationRefV1Schema = z.object({
  representationId: ProgressiveRepresentationSchema,
  representationRevision: z.string().min(1),
  dimension: z.union([z.literal(768), z.literal(128), z.literal(64)]),
  role: ProgressiveRepresentationRoleSchema,
  derivedFrom: ProgressiveRepresentationSchema.nullable(),
  producerRevision: z.string().min(1),
}).strict().superRefine((value, ctx) => {
  const expected = value.representationId.endsWith('768') ? 768 : value.representationId.endsWith('128') ? 128 : 64;
  if (value.dimension !== expected) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['dimension'], message: `dimension must match ${value.representationId}` });
  }
  if (value.representationId === 'semantic_768') {
    if (value.role !== 'CANONICAL_SEMANTIC' || value.derivedFrom !== null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['role'], message: 'semantic_768 must be canonical and not derived' });
    }
  } else if (value.role === 'CANONICAL_SEMANTIC') {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['role'], message: 'derived 128/64 representations cannot claim canonical semantic authority' });
  }
  if (value.representationId === 'latent_64' && value.role !== 'ROUTING_ONLY') {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['role'], message: 'latent_64 remains routing-only until separately promoted' });
  }
});
export type ProgressiveRepresentationRefV1 = z.infer<typeof ProgressiveRepresentationRefV1Schema>;

export const ProgressiveCandidateV1Schema = z.object({
  canonicalId: z.string().min(1),
  packetKey: z.string().min(1),
  sourceRef: z.string().min(1),
  workspaceRevision: z.string().min(1),
  sourceRevision: z.string().min(1),
  qdrantPointId: z.string().min(1).nullable(),
  semantic768Score: z.number().finite().nullable(),
  latent128Score: z.number().finite().nullable(),
  latent64Score: z.number().finite().nullable(),
  exactDistance: z.number().finite().nonnegative().nullable(),
  challengerDistance: z.number().finite().nonnegative().nullable(),
  evidenceRefs: z.array(z.string().min(1)).max(256),
}).strict();
export type ProgressiveCandidateV1 = z.infer<typeof ProgressiveCandidateV1Schema>;

export const KnnGraphEdgeV1Schema = z.object({
  sourceCanonicalId: z.string().min(1),
  targetCanonicalId: z.string().min(1),
  rank: z.number().int().positive(),
  distance: z.number().finite().nonnegative(),
  metric: z.enum(['COSINE', 'L2', 'INNER_PRODUCT']),
  executor: ProgressiveExecutorSchema,
  exact: z.boolean(),
}).strict();
export type KnnGraphEdgeV1 = z.infer<typeof KnnGraphEdgeV1Schema>;

export const ProgressiveStageReceiptV1Schema = z.object({
  schema: z.literal('atlas.progressive-knn-stage.v1'),
  requestId: z.string().min(1),
  stageId: z.string().min(1),
  stageKind: ProgressiveStageKindSchema,
  inputCount: z.number().int().nonnegative(),
  outputCount: z.number().int().nonnegative(),
  topK: z.number().int().positive().nullable(),
  maxHops: z.number().int().nonnegative().nullable(),
  representation: ProgressiveRepresentationRefV1Schema.nullable(),
  executor: ProgressiveExecutorSchema,
  algorithmManifest: AlgorithmExecutionManifestV1Schema,
  exactPromotionRequired: z.literal(true),
  canonicalWrites: z.literal(false),
  producerRevision: z.string().min(1),
}).strict();
export type ProgressiveStageReceiptV1 = z.infer<typeof ProgressiveStageReceiptV1Schema>;

export const ProgressiveKnnGraphPlanV1Schema = z.object({
  schema: z.literal('atlas.progressive-knn-graph-plan.v1'),
  requestId: z.string().min(1),
  workspaceRevision: z.string().min(1),
  graphRevision: z.string().min(1),
  semanticRepresentation: ProgressiveRepresentationRefV1Schema,
  latent128Representation: ProgressiveRepresentationRefV1Schema.nullable(),
  latent64Representation: ProgressiveRepresentationRefV1Schema.nullable(),
  qdrantPrefetchK: z.number().int().min(1).max(100_000),
  exactK: z.number().int().min(1).max(4096),
  challengerK: z.number().int().min(1).max(4096),
  graphNeighborK: z.number().int().min(1).max(256),
  maxGraphHops: z.number().int().min(0).max(32),
  exactExecutor: z.literal('CUVS_BRUTE_FORCE'),
  challengerExecutor: z.enum(['CUVS_CAGRA', 'PYTORCH_TOPK']).nullable(),
  graphSearchExecutor: z.enum(['NETWORKX_REFERENCE', 'CUGRAPH_GPU', 'TYPESCRIPT_REFERENCE']),
  cacheJson: z.boolean(),
  exactPromotionRequired: z.literal(true),
  producerRevision: z.string().min(1),
}).strict().superRefine((value, ctx) => {
  if (value.semanticRepresentation.representationId !== 'semantic_768') {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['semanticRepresentation'], message: 'canonical semantic entry must be semantic_768' });
  }
  if (value.latent128Representation && !value.latent128Representation.representationId.endsWith('128')) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['latent128Representation'], message: 'latent128Representation must be 128-dimensional' });
  }
  if (value.latent64Representation && !value.latent64Representation.representationId.endsWith('64')) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['latent64Representation'], message: 'latent64Representation must be 64-dimensional' });
  }
  if (value.exactK > value.qdrantPrefetchK) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['exactK'], message: 'exactK cannot exceed Qdrant prefetch K' });
  }
  if (value.challengerK > value.qdrantPrefetchK) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['challengerK'], message: 'challengerK cannot exceed Qdrant prefetch K' });
  }
});
export type ProgressiveKnnGraphPlanV1 = z.infer<typeof ProgressiveKnnGraphPlanV1Schema>;

export const ProgressiveKnnGraphReceiptV1Schema = z.object({
  schema: z.literal('atlas.progressive-knn-graph-receipt.v1'),
  requestId: z.string().min(1),
  workspaceRevision: z.string().min(1),
  graphRevision: z.string().min(1),
  candidates: z.array(ProgressiveCandidateV1Schema).max(100_000),
  knnEdges: z.array(KnnGraphEdgeV1Schema).max(1_000_000),
  stages: z.array(ProgressiveStageReceiptV1Schema).min(1).max(64),
  exactRecallAtK: z.number().finite().min(0).max(1).nullable(),
  cacheArtifactRef: z.string().min(1).nullable(),
  cacheChecksumSha256: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
  exactPromotionRequired: z.literal(true),
  canonicalWrites: z.literal(false),
  producerRevision: z.string().min(1),
}).strict();
export type ProgressiveKnnGraphReceiptV1 = z.infer<typeof ProgressiveKnnGraphReceiptV1Schema>;

export function validateProgressiveKnnGraphPlan(value: unknown): ProgressiveKnnGraphPlanV1 {
  return ProgressiveKnnGraphPlanV1Schema.parse(value);
}
