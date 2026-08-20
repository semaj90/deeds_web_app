import { z } from 'zod';
import { semanticExecutorManifestSchema } from './semantic-executor-manifest.js';

const revision = z.string().min(1);
const checksum = z.string().min(1);

export const computeMeasurementSchema = z.object({
  schema: z.literal('atlas.compute-measurement.v1').default('atlas.compute-measurement.v1'),
  executor: semanticExecutorManifestSchema,
  query_set_revision: revision,
  corpus_checksum: checksum,
  query_checksum: checksum,
  k: z.number().int().positive(),
  result_checksum: checksum,
  recall_at_k: z.number().finite().min(0).max(1).nullable().optional(),
  mean_latency_ms: z.number().finite().nonnegative(),
  p95_latency_ms: z.number().finite().nonnegative(),
  peak_vram_bytes: z.number().int().nonnegative().nullable().optional(),
  warmup_iterations: z.number().int().nonnegative().default(0),
  measured_iterations: z.number().int().positive(),
  deterministic_replay_checksum: checksum.nullable().optional(),
  producer_revision: revision,
}).strict();

export const computeRecommendationPolicySchema = z.object({
  schema: z.literal('atlas.compute-recommendation-policy.v1').default('atlas.compute-recommendation-policy.v1'),
  minimum_recall_at_k: z.number().finite().min(0).max(1).default(0.95),
  maximum_peak_vram_bytes: z.number().int().positive().nullable().optional(),
  minimum_latency_improvement_fraction: z.number().finite().min(0).max(1).default(0),
  require_same_metric: z.literal(true).default(true),
  require_same_snapshot: z.literal(true).default(true),
  require_same_query_set: z.literal(true).default(true),
  require_one_semantic_lane: z.literal(true).default(true),
}).strict();

export const computeRecommendationReceiptSchema = z.object({
  schema: z.literal('atlas.compute-recommendation-receipt.v1').default('atlas.compute-recommendation-receipt.v1'),
  exact_executor_id: z.string().min(1),
  recommended_executor_id: z.string().min(1),
  eligible_executor_ids: z.array(z.string().min(1)),
  rejected: z.array(z.object({ executor_id: z.string().min(1), reasons: z.array(z.string().min(1)).min(1) }).strict()),
  metric: z.enum(['cosine', 'inner_product', 'sqeuclidean']),
  source_snapshot_revision: revision,
  query_set_revision: revision,
  k: z.number().int().positive(),
  exact_mean_latency_ms: z.number().finite().nonnegative(),
  recommended_mean_latency_ms: z.number().finite().nonnegative(),
  recommended_recall_at_k: z.number().finite().min(0).max(1),
  canonical_authority: z.literal(false).default(false),
  producer_revision: revision,
}).strict();

export type ComputeMeasurementV1 = z.infer<typeof computeMeasurementSchema>;
export type ComputeRecommendationPolicyV1 = z.infer<typeof computeRecommendationPolicySchema>;
export type ComputeRecommendationReceiptV1 = z.infer<typeof computeRecommendationReceiptSchema>;

function exactReference(measurements: ComputeMeasurementV1[]): ComputeMeasurementV1 {
  const exact = measurements.filter((value) => value.executor.exactness === 'exact_reference');
  if (exact.length !== 1) {
    throw new Error(`COMPUTE_COMPARISON_REQUIRES_ONE_EXACT_REFERENCE:${exact.length}`);
  }
  return exact[0]!;
}

/**
 * Choose a runtime semantic executor from already-recorded measurements.
 * This is a derived execution recommendation only; it cannot alter semantic
 * evidence, canonical identities, relationships, completion, or lane votes.
 */
export function recommendSemanticExecutor(input: {
  measurements: ComputeMeasurementV1[];
  policy?: z.input<typeof computeRecommendationPolicySchema>;
  producer_revision: string;
}): ComputeRecommendationReceiptV1 {
  const measurements = input.measurements.map((value) => computeMeasurementSchema.parse(value));
  if (measurements.length === 0) throw new Error('COMPUTE_MEASUREMENTS_REQUIRED');
  const policy = computeRecommendationPolicySchema.parse(input.policy ?? {});
  const exact = exactReference(measurements);

  const rejected: Array<{ executor_id: string; reasons: string[] }> = [];
  const eligible: ComputeMeasurementV1[] = [];

  for (const measurement of measurements) {
    const reasons: string[] = [];
    if (measurement.executor.logical_lane !== 'semantic') reasons.push('logical_lane_mismatch');
    if (policy.require_same_metric && measurement.executor.metric !== exact.executor.metric) reasons.push('metric_mismatch');
    if (policy.require_same_snapshot && measurement.executor.source_snapshot_revision !== exact.executor.source_snapshot_revision) reasons.push('snapshot_mismatch');
    if (policy.require_same_query_set && measurement.query_set_revision !== exact.query_set_revision) reasons.push('query_set_mismatch');
    if (measurement.k !== exact.k) reasons.push('k_mismatch');
    if (measurement.corpus_checksum !== exact.corpus_checksum) reasons.push('corpus_checksum_mismatch');
    if (measurement.query_checksum !== exact.query_checksum) reasons.push('query_checksum_mismatch');

    const recall = measurement.executor.exactness === 'exact_reference'
      ? 1
      : measurement.recall_at_k;
    if (recall == null) reasons.push('recall_missing');
    else if (recall < policy.minimum_recall_at_k) reasons.push('recall_below_threshold');

    if (policy.maximum_peak_vram_bytes != null
      && measurement.peak_vram_bytes != null
      && measurement.peak_vram_bytes > policy.maximum_peak_vram_bytes) {
      reasons.push('vram_budget_exceeded');
    }

    const requiredLatency = exact.mean_latency_ms * (1 - policy.minimum_latency_improvement_fraction);
    if (measurement.executor.exactness !== 'exact_reference'
      && measurement.mean_latency_ms > requiredLatency) {
      reasons.push('latency_not_improved_enough');
    }

    if (reasons.length > 0) rejected.push({ executor_id: measurement.executor.executor_id, reasons });
    else eligible.push(measurement);
  }

  // Exact reference always remains legal fallback if it passed the common gates.
  if (!eligible.some((value) => value.executor.executor_id === exact.executor.executor_id)) {
    throw new Error('EXACT_REFERENCE_NOT_ELIGIBLE');
  }

  eligible.sort((a, b) =>
    a.mean_latency_ms - b.mean_latency_ms
    || a.p95_latency_ms - b.p95_latency_ms
    || a.executor.executor_id.localeCompare(b.executor.executor_id));
  const selected = eligible[0]!;
  const selectedRecall = selected.executor.exactness === 'exact_reference' ? 1 : selected.recall_at_k!;

  return computeRecommendationReceiptSchema.parse({
    exact_executor_id: exact.executor.executor_id,
    recommended_executor_id: selected.executor.executor_id,
    eligible_executor_ids: eligible.map((value) => value.executor.executor_id),
    rejected,
    metric: exact.executor.metric,
    source_snapshot_revision: exact.executor.source_snapshot_revision,
    query_set_revision: exact.query_set_revision,
    k: exact.k,
    exact_mean_latency_ms: exact.mean_latency_ms,
    recommended_mean_latency_ms: selected.mean_latency_ms,
    recommended_recall_at_k: selectedRecall,
    canonical_authority: false,
    producer_revision: input.producer_revision,
  });
}
