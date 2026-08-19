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

export const alignedSnapshotExperimentV2Schema = z.object({
  schema: z.literal('atlas.aligned-snapshot-experiment.v2'),
  experiment_revision: z.string().min(1),
  semantic_snapshot_revision: z.string().min(1),
  representation_revision: z.string().min(1),
  semantic_row_identity_checksum: checksum,
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
}).strict();

export type AlignedSnapshotExperimentV2 = z.infer<typeof alignedSnapshotExperimentV2Schema>;
export type AlignedSnapshotProofEnvelopeV2 = z.infer<typeof alignedSnapshotProofEnvelopeV2Schema>;

export function describeAlignedSnapshotExperiment(): string {
  return [
    'One frozen semantic_768 snapshot owns canonical row ordinals for the experiment.',
    'PyTorch FP32 exact and cuVS brute-force compare exact Top-K; CAGRA and Qdrant HNSW compare recall against exact oracles.',
    'N-ary incidence remains canonical support while sparse softmax/SpMM are derived propagation.',
    'Context windows require an explicit source/AST/workflow/temporal ordering and scatter results back to canonical row ordinals.',
    'KMeans, SOM, binary quantization, context and aligned feature tensors remain derived signals with no canonical authority.',
  ].join(' ');
}
