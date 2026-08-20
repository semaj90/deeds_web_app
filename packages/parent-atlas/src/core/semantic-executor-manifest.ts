import { z } from 'zod';

const revision = z.string().min(1);

export const semanticExecutorManifestSchema = z.object({
  schema: z.literal('atlas.semantic-executor-manifest.v1').default('atlas.semantic-executor-manifest.v1'),
  executor_id: z.string().min(1),
  executor_kind: z.enum([
    'pgvector_exact', 'pgvector_hnsw', 'qdrant_hnsw',
    'pytorch_gemm_exact', 'libtorch_gemm_exact',
    'cuvs_bruteforce', 'cuvs_cagra', 'turbovec',
  ]),
  logical_lane: z.literal('semantic').default('semantic'),
  dimensions: z.literal(768).default(768),
  metric: z.enum(['cosine', 'inner_product', 'sqeuclidean']),
  source_snapshot_revision: revision,
  projection_revision: revision,
  embedding_model_revision: revision,
  exactness: z.enum(['exact_reference', 'exhaustive_challenger', 'approximate_ann', 'prefilter']),
  numerical_mode: z.enum(['ieee_fp32', 'tf32', 'fp16', 'service_defined']).default('service_defined'),
  canonical_identity_field: z.literal('canonical_id').default('canonical_id'),
  point_or_ordinal_is_canonical: z.literal(false).default(false),
  stable_tie_break_required: z.boolean().default(true),
  supports_filters: z.boolean(),
  supports_multivector: z.boolean().default(false),
  device: z.enum(['cpu', 'gpu', 'service']),
  parameters: z.record(z.string(), z.unknown()).default({}),
  producer_revision: revision,
}).strict();

export type SemanticExecutorManifestV1 = z.infer<typeof semanticExecutorManifestSchema>;

export function buildSemanticExecutorManifest(input: z.input<typeof semanticExecutorManifestSchema>): SemanticExecutorManifestV1 {
  return semanticExecutorManifestSchema.parse(input);
}

export function assertSingleLogicalSemanticVote(manifests: readonly SemanticExecutorManifestV1[]): 1 {
  for (const manifest of manifests) semanticExecutorManifestSchema.parse(manifest);
  return 1;
}

/**
 * Executor guidance:
 * - pytorch_gemm_exact/libtorch_gemm_exact with ieee_fp32 are deterministic
 *   tensor references when explicit ordinal tie breaking is applied.
 * - cuVS brute-force is exhaustive and is the GPU library exact oracle, but
 *   equal-distance ordering must not be treated as stable identity ordering.
 * - CAGRA/HNSW are ANN challengers evaluated against a frozen exact result set.
 * - TurboVec is a prefilter/derived accelerator only.
 * Multiple executor results are reconciled before the one semantic-lane vote.
 */
