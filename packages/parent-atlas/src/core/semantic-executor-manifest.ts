import { z } from 'zod';

const revision = z.string().min(1);

export const semanticExecutorManifestSchema = z.object({
  schema: z.literal('atlas.semantic-executor-manifest.v1').default('atlas.semantic-executor-manifest.v1'),
  executor_id: z.string().min(1),
  executor_kind: z.enum(['pgvector_exact', 'pgvector_hnsw', 'qdrant_hnsw', 'cuvs_bruteforce', 'cuvs_cagra', 'turbovec']),
  logical_lane: z.literal('semantic').default('semantic'),
  dimensions: z.literal(768).default(768),
  metric: z.enum(['cosine', 'inner_product', 'sqeuclidean']),
  source_snapshot_revision: revision,
  projection_revision: revision,
  embedding_model_revision: revision,
  canonical_identity_field: z.literal('canonical_id').default('canonical_id'),
  point_or_ordinal_is_canonical: z.literal(false).default(false),
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
 * TODO: Qdrant adapter should use indexed canonical/revision payload fields for
 * filtering; CAGRA adapter should expose graph_degree/intermediate_graph_degree,
 * build algorithm, dataset memory placement and VRAM receipt. Multiple executor
 * results must be deduplicated before the single semantic-lane vote.
 */
