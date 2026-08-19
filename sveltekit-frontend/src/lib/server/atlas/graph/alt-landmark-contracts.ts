import { z } from 'zod';

/**
 * ALT = A* + Landmarks + Triangle inequality.
 *
 * Separation is deliberate:
 *   representation  = revisioned landmark-distance artifact
 *   algorithm       = ALT lower-bound evaluation
 *   executor        = CPU reference / CUDA reduction
 *   logical lane    = graph
 *
 * A landmark heuristic may accelerate exact A* without becoming a second
 * retrieval vote. PCA/latent/spectral/neural scores remain aggressive
 * challengers unless their admissibility is independently proven.
 */

export const AltDistanceValueTypeSchema = z.enum([
  'UINT32_HOPS',
  'UINT64_SCALED_COST',
  'FLOAT32_COST',
  'FLOAT64_COST',
]);
export type AltDistanceValueType = z.infer<typeof AltDistanceValueTypeSchema>;

export const AltDistanceExactnessSchema = z.enum([
  'EXACT_INTEGER',
  'AUTHORITATIVE_FLOAT',
]);
export type AltDistanceExactness = z.infer<typeof AltDistanceExactnessSchema>;

export const AltDistanceLayoutSchema = z.enum([
  'LANDMARK_MAJOR',
  'NODE_MAJOR',
]);
export type AltDistanceLayout = z.infer<typeof AltDistanceLayoutSchema>;

export const AltPrecomputeExecutorSchema = z.enum([
  'TYPESCRIPT_REFERENCE',
  'NETWORKX_REFERENCE',
  'BOOST_GRAPH_CPU',
  'CUGRAPH_BFS',
  'CUGRAPH_SSSP',
]);
export type AltPrecomputeExecutor = z.infer<typeof AltPrecomputeExecutorSchema>;

export const AltHeuristicExecutorSchema = z.enum([
  'TYPESCRIPT_REFERENCE',
  'LIBTORCH_CPU',
  'CUDA_WARP_REDUCTION',
  'CUDA_BLOCK_REDUCTION',
]);
export type AltHeuristicExecutor = z.infer<typeof AltHeuristicExecutorSchema>;

export const AltHeuristicAdmissibilitySchema = z.enum([
  'PROVEN_LOWER_BOUND',
  'UNPROVEN_NUMERIC',
]);
export type AltHeuristicAdmissibility = z.infer<typeof AltHeuristicAdmissibilitySchema>;

export const LandmarkDistanceArtifactRefV1Schema = z.object({
  artifactId: z.string().min(1),
  checksumSha256: z.string().regex(/^[a-f0-9]{64}$/),
  rows: z.number().int().positive(),
  cols: z.number().int().positive(),
  valueType: AltDistanceValueTypeSchema,
  layout: AltDistanceLayoutSchema,
  byteLength: z.number().int().positive(),
}).strict();
export type LandmarkDistanceArtifactRefV1 = z.infer<typeof LandmarkDistanceArtifactRefV1Schema>;

export const LandmarkDistanceSnapshotV1Schema = z.object({
  schema: z.literal('atlas.landmark-distance-snapshot.v1'),
  workspaceRevision: z.string().min(1),
  graphRevision: z.string().min(1),
  projectionRevision: z.string().min(1),
  nodeOrdinalRevision: z.string().min(1),
  landmarkRevision: z.string().min(1),
  /** Distances are meaningless without the exact edge-cost semantics used to compute them. */
  costModelRevision: z.string().min(1),
  edgeCostChecksumSha256: z.string().regex(/^[a-f0-9]{64}$/),
  directed: z.boolean(),
  weighted: z.boolean(),
  nonnegativeWeightsRequired: z.literal(true),
  landmarkCanonicalIds: z.array(z.string().min(1)).min(1).max(256),
  landmarkCount: z.number().int().min(1).max(256),
  nodeCount: z.number().int().positive(),
  forwardDistances: LandmarkDistanceArtifactRefV1Schema,
  reverseDistances: LandmarkDistanceArtifactRefV1Schema.nullable(),
  distanceValueType: AltDistanceValueTypeSchema,
  distanceExactness: AltDistanceExactnessSchema,
  /** Maximum absolute error for one stored distance, when independently proven. */
  distanceAbsoluteErrorBound: z.number().finite().nonnegative().nullable(),
  /** True only when the producer has evidence for distanceAbsoluteErrorBound. */
  floatingErrorBoundCertified: z.boolean(),
  quantizedForExactSearch: z.literal(false),
  precomputeExecutor: AltPrecomputeExecutorSchema,
  unreachableSentinel: z.enum(['UINT_MAX', 'POSITIVE_INFINITY']),
  producerRevision: z.string().min(1),
}).strict().superRefine((value, ctx) => {
  if (value.landmarkCanonicalIds.length !== value.landmarkCount) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['landmarkCount'],
      message: 'landmarkCount must equal landmarkCanonicalIds.length',
    });
  }
  if (value.forwardDistances.rows !== value.landmarkCount || value.forwardDistances.cols !== value.nodeCount) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['forwardDistances'],
      message: 'forward distance artifact shape must be [landmarkCount, nodeCount]',
    });
  }
  if (value.directed) {
    if (!value.reverseDistances) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['reverseDistances'],
        message: 'directed ALT requires reverse/transposed-graph landmark distances',
      });
    } else if (value.reverseDistances.rows !== value.landmarkCount || value.reverseDistances.cols !== value.nodeCount) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['reverseDistances'],
        message: 'reverse distance artifact shape must be [landmarkCount, nodeCount]',
      });
    }
  }
  if (!value.directed && value.reverseDistances !== null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['reverseDistances'],
      message: 'undirected ALT should not duplicate the forward distance artifact',
    });
  }

  if (value.distanceExactness === 'EXACT_INTEGER') {
    if (value.distanceValueType !== 'UINT32_HOPS' && value.distanceValueType !== 'UINT64_SCALED_COST') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['distanceValueType'],
        message: 'EXACT_INTEGER snapshots require an unsigned integer distance type',
      });
    }
    if (value.distanceAbsoluteErrorBound !== 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['distanceAbsoluteErrorBound'],
        message: 'EXACT_INTEGER snapshots must declare zero absolute error',
      });
    }
  }

  if (value.distanceExactness === 'AUTHORITATIVE_FLOAT') {
    if (value.distanceValueType !== 'FLOAT32_COST' && value.distanceValueType !== 'FLOAT64_COST') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['distanceValueType'],
        message: 'AUTHORITATIVE_FLOAT snapshots require FLOAT32_COST or FLOAT64_COST',
      });
    }
    if (value.floatingErrorBoundCertified && value.distanceAbsoluteErrorBound === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['distanceAbsoluteErrorBound'],
        message: 'certified floating snapshots require an absolute error bound',
      });
    }
  }
});
export type LandmarkDistanceSnapshotV1 = z.infer<typeof LandmarkDistanceSnapshotV1Schema>;

export const AStarHeuristicReceiptV1Schema = z.object({
  schema: z.literal('atlas.a-star-heuristic-receipt.v1'),
  requestId: z.string().min(1),
  workspaceRevision: z.string().min(1),
  graphRevision: z.string().min(1),
  algorithm: z.literal('ALT'),
  logicalLane: z.literal('graph'),
  landmarkRevision: z.string().min(1),
  heuristicExecutor: AltHeuristicExecutorSchema,
  admissibility: AltHeuristicAdmissibilitySchema,
  /** For a difference of two distances, a certified per-distance error epsilon needs a 2*epsilon guard. */
  numericGuardApplied: z.number().finite().nonnegative(),
  mayTerminateExactSearch: z.boolean(),
  mayClaimOptimality: z.boolean(),
  frontierCount: z.number().int().nonnegative(),
  landmarkCount: z.number().int().positive(),
  heuristicMinimum: z.number().finite().nonnegative().nullable(),
  heuristicMaximum: z.number().finite().nonnegative().nullable(),
  unreachablePairCount: z.number().int().nonnegative(),
  elapsedMicroseconds: z.number().finite().nonnegative().nullable(),
  kernelRevision: z.string().min(1).nullable(),
  exactPromotionRequired: z.literal(true),
  canonicalWrites: z.literal(false),
  producerRevision: z.string().min(1),
}).strict();
export type AStarHeuristicReceiptV1 = z.infer<typeof AStarHeuristicReceiptV1Schema>;

export const AggressiveHeuristicKindSchema = z.enum([
  'PCA_128',
  'LATENT_64',
  'SPECTRAL_4D',
  'FEATURE_GEMM',
  'GNN',
  'LEARNED_POLICY',
]);
export type AggressiveHeuristicKind = z.infer<typeof AggressiveHeuristicKindSchema>;

export const AggressiveHeuristicReceiptV1Schema = z.object({
  schema: z.literal('atlas.aggressive-search-heuristic.v1'),
  requestId: z.string().min(1),
  graphRevision: z.string().min(1),
  heuristicKind: AggressiveHeuristicKindSchema,
  admissibility: z.literal('UNPROVEN'),
  allowedRoles: z.tuple([
    z.literal('TIE_BREAKER'),
    z.literal('GREEDY_QUEUE'),
    z.literal('BEAM_QUEUE'),
    z.literal('SHADOW_CHALLENGER'),
  ]),
  mayTerminateExactSearch: z.literal(false),
  mayClaimOptimality: z.literal(false),
  canonicalWrites: z.literal(false),
  producerRevision: z.string().min(1),
}).strict();
export type AggressiveHeuristicReceiptV1 = z.infer<typeof AggressiveHeuristicReceiptV1Schema>;
