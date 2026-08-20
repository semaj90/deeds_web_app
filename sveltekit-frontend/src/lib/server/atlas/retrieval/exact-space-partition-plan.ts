import { z } from 'zod';

/**
 * Exact low-dimensional space-partition challengers.
 *
 * These are executor choices inside an already-chosen evidence representation.
 * They do not create a new logical lane and they do not replace semantic_768
 * exact promotion. Tree suitability is strongly dimension/data dependent, so
 * this module returns a recommendation + reasons rather than a universal rule.
 */

export const ExactSpacePartitionAlgorithmSchema = z.enum([
  'BRUTE_FORCE',
  'SCIPY_CKDTREE',
  'SKLEARN_KD_TREE',
  'SKLEARN_BALL_TREE',
]);
export type ExactSpacePartitionAlgorithm = z.infer<typeof ExactSpacePartitionAlgorithmSchema>;

export const ExactSpaceMetricSchema = z.enum([
  'EUCLIDEAN',
  'MANHATTAN',
  'CHEBYSHEV',
  'MINKOWSKI',
  'HAVERSINE',
  'QUATERNION_ANGULAR',
]);
export type ExactSpaceMetric = z.infer<typeof ExactSpaceMetricSchema>;

export const ExactSpaceRepresentationSchema = z.enum([
  'TETRIS_POSE6_EULER',
  'SE3_PHYSICAL_QUATERNION7',
  'PHYSICAL_QUATERNION4',
  'PCA_LOW_RANK',
  'LATENT64',
  'SEMANTIC768',
  'CANDIDATE_FEATURE_MATRIX',
]);
export type ExactSpaceRepresentation = z.infer<typeof ExactSpaceRepresentationSchema>;

export const ExactSpacePartitionInputV1Schema = z.object({
  schema: z.literal('atlas.exact-space-partition-input.v1'),
  representation: ExactSpaceRepresentationSchema,
  dimensions: z.number().int().positive(),
  intrinsicDimensionsEstimate: z.number().finite().positive().nullable(),
  sampleCount: z.number().int().positive(),
  queryBatchSize: z.number().int().positive(),
  metric: ExactSpaceMetricSchema,
  leafSize: z.number().int().positive().default(30),
  vectorsNormalized: z.boolean(),
  gpuAvailable: z.boolean(),
  mutationSensitive: z.boolean(),
  representationRevision: z.string().min(1),
  producerRevision: z.string().min(1),
}).strict().superRefine((value, ctx) => {
  if (value.intrinsicDimensionsEstimate !== null && value.intrinsicDimensionsEstimate > value.dimensions) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['intrinsicDimensionsEstimate'], message: 'intrinsic dimension cannot exceed ambient dimension' });
  }
  if (value.representation === 'SEMANTIC768' && value.dimensions !== 768) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['dimensions'], message: 'SEMANTIC768 requires 768 dimensions' });
  }
  if (value.representation === 'PHYSICAL_QUATERNION4' && value.dimensions !== 4) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['dimensions'], message: 'PHYSICAL_QUATERNION4 requires 4 dimensions' });
  }
});
export type ExactSpacePartitionInputV1 = z.infer<typeof ExactSpacePartitionInputV1Schema>;

export const ExactSpacePartitionCandidateV1Schema = z.object({
  algorithm: ExactSpacePartitionAlgorithmSchema,
  eligible: z.boolean(),
  recommended: z.boolean(),
  exactForDeclaredMetric: z.boolean(),
  requiresPostVerify: z.boolean(),
  pruningGeometry: z.enum(['NONE', 'AXIS_ALIGNED_HYPERRECTANGLES', 'NESTED_METRIC_BALLS']),
  reasons: z.array(z.string().min(1)).min(1),
}).strict();
export type ExactSpacePartitionCandidateV1 = z.infer<typeof ExactSpacePartitionCandidateV1Schema>;

export const ExactSpacePartitionPlanV1Schema = z.object({
  schema: z.literal('atlas.exact-space-partition-plan.v1'),
  representation: ExactSpaceRepresentationSchema,
  representationRevision: z.string().min(1),
  dimensions: z.number().int().positive(),
  metric: ExactSpaceMetricSchema,
  leafSize: z.number().int().positive(),
  preferredAlgorithm: ExactSpacePartitionAlgorithmSchema,
  candidates: z.array(ExactSpacePartitionCandidateV1Schema).length(4),
  logicalLaneVoteAdded: z.literal(false),
  exactPromotionPreserved: z.literal(true),
  highDimensionalTreeWarning: z.boolean(),
  producerRevision: z.string().min(1),
}).strict();
export type ExactSpacePartitionPlanV1 = z.infer<typeof ExactSpacePartitionPlanV1Schema>;

const KD_METRICS = new Set<ExactSpaceMetric>(['EUCLIDEAN', 'MANHATTAN', 'CHEBYSHEV', 'MINKOWSKI']);
const BALL_METRICS = new Set<ExactSpaceMetric>(['EUCLIDEAN', 'MANHATTAN', 'CHEBYSHEV', 'MINKOWSKI', 'HAVERSINE']);

/**
 * Unit-quaternion physical angle:
 *   d(q,r) = 2 acos(|q·r|)
 *
 * For unit quaternions, min(||q-r||, ||q+r||)^2 = 2 - 2|q·r|.
 * Therefore Euclidean nearest-neighbor order on the two antipodal query signs
 * is monotonic with physical angular distance. A KD/cKD tree may be used as an
 * exact candidate structure if BOTH q and -q are queried and identities are
 * deduplicated before final angular verification.
 */
export function quaternionAntipodalEuclideanDistanceSquared(
  q: readonly [number, number, number, number],
  r: readonly [number, number, number, number],
): number {
  const minus = q.reduce((sum, value, index) => sum + (value - r[index]) ** 2, 0);
  const plus = q.reduce((sum, value, index) => sum + (value + r[index]) ** 2, 0);
  return Math.min(minus, plus);
}

export function physicalQuaternionAngularDistance(
  q: readonly [number, number, number, number],
  r: readonly [number, number, number, number],
): number {
  const qNorm = Math.hypot(...q);
  const rNorm = Math.hypot(...r);
  if (!(qNorm > 0) || !(rNorm > 0)) throw new Error('quaternions must have non-zero norm');
  const dot = Math.abs(q.reduce((sum, value, index) => sum + (value / qNorm) * (r[index] / rNorm), 0));
  return 2 * Math.acos(Math.max(0, Math.min(1, dot)));
}

function makeCandidate(
  algorithm: ExactSpacePartitionAlgorithm,
  input: ExactSpacePartitionInputV1,
  effectiveDimensionality: number,
): ExactSpacePartitionCandidateV1 {
  const highDim = effectiveDimensionality > 15 || input.dimensions > 64;
  const tiny = input.sampleCount < 30;
  const quaternion = input.metric === 'QUATERNION_ANGULAR';

  if (algorithm === 'BRUTE_FORCE') {
    return {
      algorithm,
      eligible: true,
      recommended: tiny || highDim || input.representation === 'SEMANTIC768',
      exactForDeclaredMetric: true,
      requiresPostVerify: false,
      pruningGeometry: 'NONE',
      reasons: [
        tiny ? 'SMALL_SAMPLE_COUNT_FAVORS_LOW_OVERHEAD' : 'EXACT_REFERENCE_ALWAYS_AVAILABLE',
        highDim ? 'TREE_PRUNING_EXPECTED_TO_DEGRADE_WITH_DIMENSION' : 'REFERENCE_FOR_TREE_PARITY',
        input.gpuAvailable && input.representation === 'SEMANTIC768' ? 'GPU_BRUTE_FORCE_IS_PREFERRED_SEMANTIC768_ORACLE' : 'CPU_REFERENCE_ELIGIBLE',
      ],
    };
  }

  if (algorithm === 'SKLEARN_BALL_TREE') {
    const metricEligible = BALL_METRICS.has(input.metric);
    return {
      algorithm,
      eligible: metricEligible && !quaternion,
      recommended: metricEligible && !tiny && !highDim && effectiveDimensionality >= 8,
      exactForDeclaredMetric: metricEligible && !quaternion,
      requiresPostVerify: false,
      pruningGeometry: 'NESTED_METRIC_BALLS',
      reasons: [
        metricEligible ? 'METRIC_SUPPORTED_BY_BALL_TREE' : 'DIRECT_METRIC_NOT_SUPPORTED_BY_STANDARD_BALL_TREE_PLAN',
        effectiveDimensionality >= 8 ? 'BALL_PARTITION_IS_WORTH_TOURNAMENTING_AGAINST_AXIS_SPLITS' : 'KD_TREE_OFTEN_LOWER_OVERHEAD_AT_VERY_LOW_DIMENSION',
        highDim ? 'HIGH_DIMENSION_TREE_DEGRADATION_WARNING' : 'LOW_TO_MODERATE_DIMENSION',
      ],
    };
  }

  const kdMetric = quaternion ? 'EUCLIDEAN' : input.metric;
  const metricEligible = KD_METRICS.has(kdMetric as ExactSpaceMetric);
  const quaternionEligible = quaternion && input.representation === 'PHYSICAL_QUATERNION4';
  return {
    algorithm,
    eligible: metricEligible && (!quaternion || quaternionEligible),
    recommended: metricEligible && !tiny && !highDim && (effectiveDimensionality < 8 || quaternionEligible),
    exactForDeclaredMetric: metricEligible && (!quaternion || quaternionEligible),
    requiresPostVerify: quaternionEligible,
    pruningGeometry: 'AXIS_ALIGNED_HYPERRECTANGLES',
    reasons: [
      quaternionEligible ? 'QUERY_BOTH_ANTIPODES_THEN_DEDUP_AND_VERIFY_ANGULAR_DISTANCE' : 'AXIS_ALIGNED_EXACT_METRIC_PARTITION',
      tiny ? 'TREE_OVERHEAD_MAY_EXCEED_BRUTE_FORCE' : 'SAMPLE_COUNT_LARGE_ENOUGH_TO_TEST_PRUNING',
      highDim ? 'HIGH_DIMENSION_TREE_DEGRADATION_WARNING' : 'LOW_TO_MODERATE_DIMENSION',
    ],
  };
}

export function planExactSpacePartition(rawInput: ExactSpacePartitionInputV1): ExactSpacePartitionPlanV1 {
  const input = ExactSpacePartitionInputV1Schema.parse(rawInput);
  const effectiveDimensionality = input.intrinsicDimensionsEstimate ?? input.dimensions;
  const candidates = ([
    'BRUTE_FORCE',
    'SCIPY_CKDTREE',
    'SKLEARN_KD_TREE',
    'SKLEARN_BALL_TREE',
  ] as const).map((algorithm) => makeCandidate(algorithm, input, effectiveDimensionality));

  const treeRecommendations = candidates.filter((candidate) => candidate.recommended && candidate.eligible);
  const preferredAlgorithm = treeRecommendations[0]?.algorithm ?? 'BRUTE_FORCE';

  return ExactSpacePartitionPlanV1Schema.parse({
    schema: 'atlas.exact-space-partition-plan.v1',
    representation: input.representation,
    representationRevision: input.representationRevision,
    dimensions: input.dimensions,
    metric: input.metric,
    leafSize: input.leafSize,
    preferredAlgorithm,
    candidates,
    logicalLaneVoteAdded: false,
    exactPromotionPreserved: true,
    highDimensionalTreeWarning: effectiveDimensionality > 15 || input.dimensions > 64,
    producerRevision: input.producerRevision,
  });
}

export function exactTreeTournamentScope(plan: ExactSpacePartitionPlanV1): Array<{
  algorithm: ExactSpacePartitionAlgorithm;
  role: 'REFERENCE' | 'CHALLENGER';
  exact: boolean;
}> {
  const parsed = ExactSpacePartitionPlanV1Schema.parse(plan);
  return parsed.candidates
    .filter((candidate) => candidate.eligible)
    .map((candidate) => ({
      algorithm: candidate.algorithm,
      role: candidate.algorithm === 'BRUTE_FORCE' ? 'REFERENCE' : 'CHALLENGER',
      exact: candidate.exactForDeclaredMetric,
    }));
}
