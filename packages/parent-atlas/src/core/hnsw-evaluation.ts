import { z } from 'zod';

const revision = z.string().min(1);
const checksum = z.string().min(1);

export const hnswSweepPointSchema = z.object({
  hnsw_ef: z.number().int().positive(),
  recall_at_k: z.number().finite().min(0).max(1),
  mean_latency_ms: z.number().finite().nonnegative(),
  p95_latency_ms: z.number().finite().nonnegative(),
  result_checksum: checksum,
}).strict();

export const hnswEvaluationReceiptSchema = z.object({
  schema: z.literal('atlas.hnsw-evaluation-receipt.v1').default('atlas.hnsw-evaluation-receipt.v1'),
  executor_id: z.string().min(1),
  collection: z.string().min(1),
  vector_name: z.string().min(1),
  metric: z.enum(['cosine', 'inner_product', 'sqeuclidean']),
  source_snapshot_revision: revision,
  query_set_revision: revision,
  corpus_checksum: checksum,
  query_checksum: checksum,
  k: z.number().int().positive(),
  exact_result_checksum: checksum,
  m: z.number().int().positive().nullable().optional(),
  ef_construct: z.number().int().positive().nullable().optional(),
  sweep: z.array(hnswSweepPointSchema).min(1),
  recommended_hnsw_ef: z.number().int().positive(),
  minimum_recall_at_k: z.number().finite().min(0).max(1),
  logical_lane: z.literal('semantic').default('semantic'),
  exact_search_is_oracle: z.literal(true).default(true),
  canonical_authority: z.literal(false).default(false),
  producer_revision: revision,
}).strict();

export type HnswSweepPointV1 = z.infer<typeof hnswSweepPointSchema>;
export type HnswEvaluationReceiptV1 = z.infer<typeof hnswEvaluationReceiptSchema>;

/**
 * Choose the lowest-latency HNSW query breadth that satisfies the recall floor.
 * Qdrant exact=true remains the collection-local full-scan oracle; the HNSW
 * result never becomes a second semantic vote or canonical evidence owner.
 */
export function chooseHnswEf(input: {
  executor_id: string;
  collection: string;
  vector_name: string;
  metric: HnswEvaluationReceiptV1['metric'];
  source_snapshot_revision: string;
  query_set_revision: string;
  corpus_checksum: string;
  query_checksum: string;
  k: number;
  exact_result_checksum: string;
  m?: number | null;
  ef_construct?: number | null;
  sweep: HnswSweepPointV1[];
  minimum_recall_at_k?: number;
  producer_revision: string;
}): HnswEvaluationReceiptV1 {
  const minimumRecall = input.minimum_recall_at_k ?? 0.95;
  const sweep = input.sweep.map((row) => hnswSweepPointSchema.parse(row));
  const eligible = sweep
    .filter((row) => row.recall_at_k >= minimumRecall)
    .sort((a, b) => a.mean_latency_ms - b.mean_latency_ms || a.p95_latency_ms - b.p95_latency_ms || a.hnsw_ef - b.hnsw_ef);
  if (eligible.length === 0) throw new Error('HNSW_NO_SWEEP_POINT_MEETS_RECALL_FLOOR');

  return hnswEvaluationReceiptSchema.parse({
    executor_id: input.executor_id,
    collection: input.collection,
    vector_name: input.vector_name,
    metric: input.metric,
    source_snapshot_revision: input.source_snapshot_revision,
    query_set_revision: input.query_set_revision,
    corpus_checksum: input.corpus_checksum,
    query_checksum: input.query_checksum,
    k: input.k,
    exact_result_checksum: input.exact_result_checksum,
    m: input.m ?? null,
    ef_construct: input.ef_construct ?? null,
    sweep,
    recommended_hnsw_ef: eligible[0]!.hnsw_ef,
    minimum_recall_at_k: minimumRecall,
    logical_lane: 'semantic',
    exact_search_is_oracle: true,
    canonical_authority: false,
    producer_revision: input.producer_revision,
  });
}
