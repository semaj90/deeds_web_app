import { z } from 'zod';

export const RETRIEVAL_METRIC_FAMILY_V1 = 'atlas.retrieval-metric-family.v1' as const;

export const retrievalMetricFamilySchema = z.enum([
  'DENSE_CONTINUOUS',
  'BINARY_FINGERPRINT',
  'SPARSE_SET',
  'SPARSE_WEIGHTED',
  'GRAPH_TOPOLOGY',
]);

export type RetrievalMetricFamily = z.infer<typeof retrievalMetricFamilySchema>;

export const retrievalMetricSchema = z.enum([
  'COSINE',
  'DOT',
  'EUCLIDEAN_L2',
  'HAMMING',
  'JACCARD',
  'WEIGHTED_JACCARD',
  'SPARSE_COSINE',
  'GRAPH_DISTANCE',
  'PPR',
  'SOM_GRID_DISTANCE',
]);

export type RetrievalMetric = z.infer<typeof retrievalMetricSchema>;

const ALLOWED_METRICS: Record<RetrievalMetricFamily, readonly RetrievalMetric[]> = {
  DENSE_CONTINUOUS: ['COSINE', 'DOT', 'EUCLIDEAN_L2'],
  BINARY_FINGERPRINT: ['HAMMING'],
  SPARSE_SET: ['JACCARD'],
  SPARSE_WEIGHTED: ['WEIGHTED_JACCARD', 'SPARSE_COSINE'],
  GRAPH_TOPOLOGY: ['GRAPH_DISTANCE', 'PPR', 'SOM_GRID_DISTANCE'],
};

export const retrievalMetricBindingV1Schema = z.object({
  schema: z.literal(RETRIEVAL_METRIC_FAMILY_V1),
  signalId: z.string().min(1),
  family: retrievalMetricFamilySchema,
  metric: retrievalMetricSchema,
  representationId: z.string().min(1),
  representationRevision: z.string().min(1),
  normalized: z.boolean().nullable(),
  producerRevision: z.string().min(1),
  evidenceRefs: z.array(z.string().min(1)).min(1),
}).strict().superRefine((binding, ctx) => {
  if (!ALLOWED_METRICS[binding.family].includes(binding.metric)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['metric'],
      message: `METRIC_FAMILY_MISMATCH:${binding.family}:${binding.metric}`,
    });
  }

  if (binding.family === 'DENSE_CONTINUOUS' && binding.normalized !== true) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['normalized'],
      message: 'DENSE_CONTINUOUS_NORMALIZATION_REQUIRED',
    });
  }

  if (binding.family !== 'DENSE_CONTINUOUS' && binding.normalized === true) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['normalized'],
      message: 'NON_DENSE_NORMALIZATION_FLAG_INVALID',
    });
  }
});

export type RetrievalMetricBindingV1 = z.infer<typeof retrievalMetricBindingV1Schema>;

export function assertMetricAllowedForFamily(
  family: RetrievalMetricFamily,
  metric: RetrievalMetric,
): void {
  if (!ALLOWED_METRICS[family].includes(metric)) {
    throw new Error(`METRIC_FAMILY_MISMATCH:${family}:${metric}`);
  }
}

export function metricHigherIsBetter(metric: RetrievalMetric): boolean {
  switch (metric) {
    case 'EUCLIDEAN_L2':
    case 'HAMMING':
    case 'GRAPH_DISTANCE':
    case 'SOM_GRID_DISTANCE':
      return false;
    default:
      return true;
  }
}

export function canonicalSimilarityFromMetric(metric: RetrievalMetric, value: number): number {
  if (!Number.isFinite(value)) throw new Error(`METRIC_VALUE_NON_FINITE:${metric}`);

  switch (metric) {
    case 'COSINE':
    case 'DOT':
    case 'JACCARD':
    case 'WEIGHTED_JACCARD':
    case 'SPARSE_COSINE':
    case 'PPR':
      return value;
    case 'EUCLIDEAN_L2':
    case 'HAMMING':
    case 'GRAPH_DISTANCE':
    case 'SOM_GRID_DISTANCE':
      throw new Error(`DISTANCE_METRIC_REQUIRES_EXPLICIT_CALIBRATION:${metric}`);
  }
}
