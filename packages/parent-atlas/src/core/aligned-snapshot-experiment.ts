import { z } from 'zod';

const checksum = z.string().regex(/^[a-f0-9]{64}$/);
const status = z.enum(['PASS', 'SKIPPED', 'ERROR', 'NOT_EVALUATED_NO_RELEVANCE_LABELS']);

export const alignedSnapshotStageSchema = z.object({
  status,
  reason: z.string().nullable().optional(),
  receipt: z.record(z.string(), z.unknown()).nullable().optional(),
}).strict();

export const retrievalEvaluationSchema = z.object({
  status,
  recall_at_k: z.number().finite().min(0).max(1).optional(),
  mrr_at_k: z.number().finite().min(0).max(1).optional(),
  query_count: z.number().int().nonnegative().optional(),
  reason: z.string().optional(),
}).passthrough();

export const qdrantScopedSweepPointSchema = z.object({
  hnsw_ef: z.number().int().positive(),
  recall_at_k: z.number().finite().min(0).max(1),
  mean_latency_ms: z.number().finite().nonnegative(),
  p95_latency_ms: z.number().finite().nonnegative(),
  result_checksum: checksum,
}).strict();

export const qdrantScopedAnnSchema = z.object({
  schema: z.literal('atlas.qdrant-scoped-ann-receipt.v1'),
  comparison_scope: z.enum(['snapshot_subset', 'full_collection']),
  scoped_corpus_count: z.number().int().positive(),
  scoped_corpus_checksum: checksum,
  collection: z.string().min(1),
  vector_name: z.string().min(1).nullable(),
  canonical_payload_key: z.string().min(1),
  metric: z.enum(['cosine', 'inner_product', 'sqeuclidean']),
  qdrant_distance: z.string().min(1).nullable(),
  qdrant_vector_size: z.number().int().positive().nullable(),
  metric_alignment_status: z.enum(['ALIGNED', 'MISMATCH']),
  distance_interpretation: z.enum([
    'native_cosine',
    'native_dot_product',
    'euclidean_rank_equivalent_to_sqeuclidean',
  ]),
  k: z.number().int().positive(),
  query_count: z.number().int().positive(),
  minimum_exact_overlap_at_k: z.number().finite().min(0).max(1),
  pytorch_qdrant_exact_mean_overlap_at_k: z.number().finite().min(0).max(1),
  pytorch_qdrant_exact_minimum_query_overlap_at_k: z.number().finite().min(0).max(1),
  exact_alignment_status: z.enum(['ALIGNED', 'EXACT_STORE_MISMATCH', 'METRIC_MISMATCH']),
  exact_mean_latency_ms: z.number().finite().nonnegative(),
  exact_p95_latency_ms: z.number().finite().nonnegative(),
  exact_result_checksum: checksum,
  sweep: z.array(qdrantScopedSweepPointSchema),
  minimum_hnsw_recall_at_k: z.number().finite().min(0).max(1),
  recommended_hnsw_ef: z.number().int().positive().nullable(),
  recommendation_status: z.enum([
    'ELIGIBLE',
    'BLOCKED_EXACT_STORE_MISMATCH',
    'BLOCKED_METRIC_MISMATCH',
    'NO_SWEEP_POINT_MEETS_RECALL_FLOOR',
  ]),
  best_hnsw_recall_at_k: z.number().finite().min(0).max(1),
  canonical_authority: z.literal(false),
}).strict().superRefine((value, ctx) => {
  if (value.exact_alignment_status !== 'ALIGNED' && value.sweep.length !== 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['sweep'], message: 'HNSW sweep must be empty when metric or exact same-corpus gates fail' });
  }
  if (value.metric_alignment_status === 'MISMATCH' && value.exact_alignment_status !== 'METRIC_MISMATCH') {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['exact_alignment_status'], message: 'metric mismatch must block exact-store comparison' });
  }
  if (value.metric_alignment_status === 'ALIGNED' && value.exact_alignment_status === 'METRIC_MISMATCH') {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['metric_alignment_status'], message: 'METRIC_MISMATCH requires a mismatched metric/dimension preflight' });
  }
  if (value.recommendation_status === 'ELIGIBLE' && value.recommended_hnsw_ef === null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['recommended_hnsw_ef'], message: 'eligible HNSW recommendation requires an ef value' });
  }
  if (value.recommendation_status !== 'ELIGIBLE' && value.recommended_hnsw_ef !== null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['recommended_hnsw_ef'], message: 'ineligible HNSW result cannot recommend an ef value' });
  }
});

export const alignedSnapshotExperimentV2Schema = z.object({
  schema: z.literal('atlas.aligned-snapshot-experiment.v2'),
  experiment_revision: z.string().min(1),
  semantic_snapshot_revision: z.string().min(1),
  representation_revision: z.string().min(1),
  semantic_versioned_row_identity_checksum: checksum,
  semantic_canonical_order_checksum: checksum,
  semantic_tensor_checksum: checksum,
  row_count: z.number().int().positive(),
  semantic_dimensions: z.literal(768),
  metric: z.enum(['cosine', 'inner_product', 'sqeuclidean']),
  k: z.number().int().positive(),
  query_ordinals: z.array(z.number().int().nonnegative()).min(1),
  query_canonical_ids: z.array(z.string().min(1)).min(1),
  exact_semantic_result_checksum: checksum,
  exact_self_exclusion: z.literal(true),
  pytorch_cuvs_exact_topk_overlap: z.number().finite().min(0).max(1).nullable(),
  cagra_recall_at_k: z.number().finite().min(0).max(1).nullable(),
  qdrant_hnsw_best_recall_at_k: z.number().finite().min(0).max(1).nullable(),
  cluster_entropy: z.number().finite().nonnegative().nullable(),
  cluster_replay_stability: z.number().finite().min(0).max(1).nullable(),
  som_quantization_error: z.number().finite().nonnegative().nullable(),
  som_neighborhood_overlap_at_k: z.number().finite().min(0).max(1).nullable(),
  sparse_dense: z.record(z.string(), z.unknown()).nullable(),
  context_retrieval: z.record(z.string(), z.unknown()),
  nary_retrieval: z.record(z.string(), z.unknown()),
  stages: z.record(z.string(), alignedSnapshotStageSchema),
  aligned_feature_matrix_checksum: checksum,
  aligned_feature_row_identity_checksum: checksum,
  aligned_feature_columns: z.number().int().positive(),
  output_checksum: checksum,
  canonical_authority: z.literal(false),
}).strict().superRefine((value, ctx) => {
  if (value.query_ordinals.length !== value.query_canonical_ids.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['query_ordinals'], message: 'query ordinals and canonical IDs must be one-to-one' });
  }
  if (new Set(value.query_ordinals).size !== value.query_ordinals.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['query_ordinals'], message: 'query ordinals must be unique' });
  }
  if (new Set(value.query_canonical_ids).size !== value.query_canonical_ids.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['query_canonical_ids'], message: 'query canonical IDs must be unique' });
  }
  if (value.k >= value.row_count) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['k'], message: 'self-excluding K must be smaller than row_count' });
  }
  if (value.semantic_canonical_order_checksum !== value.aligned_feature_row_identity_checksum) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['aligned_feature_row_identity_checksum'], message: 'aligned feature blocks must preserve the frozen canonical row order' });
  }
});

export const alignedSnapshotProofEnvelopeV2Schema = z.object({
  schema: z.literal('atlas.aligned-snapshot-proof-envelope.v2'),
  semantic_manifest_path: z.string().min(1),
  semantic_manifest_file_checksum: checksum,
  experiment_spec_path: z.string().min(1),
  experiment_spec_file_checksum: checksum,
  experiment_output_path: z.string().min(1),
  experiment_output_file_checksum: checksum,
  experiment_output_checksum: checksum,
  qdrant_scoped_ann: qdrantScopedAnnSchema.nullable(),
  qdrant_scoped_ann_file: z.string().min(1).nullable(),
  qdrant_scoped_ann_file_checksum: checksum.nullable(),
  gpu_memory: z.object({
    schema: z.literal('atlas.gpu-memory-receipt.v1'),
    available: z.boolean(),
    measurement_source: z.string().min(1),
    measurement_scope: z.string().min(1),
    baseline_bytes: z.number().int().nonnegative().nullable(),
    peak_bytes: z.number().int().nonnegative().nullable(),
    peak_delta_bytes: z.number().int().nullable(),
    sample_count: z.number().int().nonnegative(),
    note: z.string(),
  }).strict(),
  canonical_authority: z.literal(false),
  envelope_checksum: checksum,
}).strict().superRefine((value, ctx) => {
  const present = value.qdrant_scoped_ann !== null;
  if (present !== (value.qdrant_scoped_ann_file !== null) || present !== (value.qdrant_scoped_ann_file_checksum !== null)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['qdrant_scoped_ann'], message: 'Qdrant scoped receipt/file/checksum must be present or absent together' });
  }
  if (value.qdrant_scoped_ann && value.qdrant_scoped_ann.exact_alignment_status !== 'ALIGNED') {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['qdrant_scoped_ann'], message: 'proof envelope cannot certify HNSW when metric/dimension or same-corpus exact alignment fails' });
  }
});

export type AlignedSnapshotExperimentV2 = z.infer<typeof alignedSnapshotExperimentV2Schema>;
export type QdrantScopedAnnV1 = z.infer<typeof qdrantScopedAnnSchema>;
export type AlignedSnapshotProofEnvelopeV2 = z.infer<typeof alignedSnapshotProofEnvelopeV2Schema>;

export function describeAlignedSnapshotExperiment(): string {
  return [
    'One frozen semantic_768 snapshot owns canonical row ordinals for the experiment.',
    'Snapshot lineage identity and cross-block canonical row-order identity use separate checksums and must not be conflated.',
    'PyTorch FP32 exact and cuVS brute-force compare exact Top-K.',
    'Qdrant must match the requested vector dimension and distance before exact/HNSW comparison.',
    'Qdrant exact and HNSW must use one explicit corpus scope: the frozen snapshot subset or a proven full collection.',
    'CAGRA and Qdrant HNSW compare Recall@K only after their corresponding exact-oracle boundaries are valid.',
    'N-ary incidence remains canonical support while sparse softmax/SpMM are derived propagation.',
    'Context windows require an explicit source/AST/workflow/temporal ordering and scatter results back to canonical row ordinals.',
    'KMeans, SOM, binary quantization, context and aligned feature tensors remain derived signals with no canonical authority.',
  ].join(' ');
}
