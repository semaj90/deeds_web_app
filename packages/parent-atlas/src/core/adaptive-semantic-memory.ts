import { createHash } from 'node:crypto';
import { z } from 'zod';

const id = z.string().min(1);
const revision = z.string().min(1);
const checksum = z.string().regex(/^[a-f0-9]{64}$/);
const bytes = z.number().int().nonnegative();

export const SEMANTIC_MEMORY_TIERS = [
  'HOT_GPU',
  'WARM_HOST',
  'COLD_SEAWEED_S3',
] as const;

export const SEMANTIC_REPRESENTATIONS = [
  'SEMANTIC_768',
  'LATENT_128',
  'LATENT_64',
] as const;

export const LATENT_PRODUCERS = [
  'CUML_INCREMENTAL_PCA',
  'PYTORCH_NESTED_AUTOENCODER',
] as const;

export const seaweedS3ArtifactRefSchema = z.object({
  schema: z.literal('atlas.seaweed-s3-artifact-ref.v1').default('atlas.seaweed-s3-artifact-ref.v1'),
  artifact_id: id,
  artifact_revision: revision,
  backend: z.literal('SEAWEEDFS_S3'),
  endpoint_id: id,
  bucket: z.string().min(1),
  object_key: z.string().min(1),
  content_checksum: checksum,
  content_length_bytes: bytes,
  media_type: z.string().min(1),
  etag: z.string().min(1).nullable().default(null),
  storage_class: z.enum(['HOT_REPLICA', 'WARM_ERASURE_CODED', 'COLD_ARCHIVE']).default('HOT_REPLICA'),
  immutable: z.literal(true).default(true),
  canonical_authority: z.literal(false).default(false),
}).strict().superRefine((value, ctx) => {
  if (value.object_key.startsWith('/') || value.object_key.includes('../')) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['object_key'], message: 'object_key must be bucket-relative and traversal-free' });
  }
});
export type SeaweedS3ArtifactRefV1 = z.infer<typeof seaweedS3ArtifactRefSchema>;

export const latentProjectionPlanSchema = z.object({
  schema: z.literal('atlas.latent-projection-plan.v1').default('atlas.latent-projection-plan.v1'),
  plan_id: id,
  plan_revision: revision,
  source_semantic_snapshot_revision: revision,
  row_identity_checksum: checksum,
  canonical_dimension: z.literal(768),
  producer: z.enum(LATENT_PRODUCERS),
  latent_dimensions: z.tuple([z.literal(128), z.literal(64)]),
  nested_latent_required: z.literal(true).default(true),
  deterministic_seed: z.number().int().nonnegative(),
  model_artifact_ref: seaweedS3ArtifactRefSchema.nullable().default(null),
  normalization: z.enum(['L2_ROW', 'NONE']).default('L2_ROW'),
  canonical_authority: z.literal(false).default(false),
  producer_revision: revision,
}).strict().superRefine((value, ctx) => {
  if (value.producer === 'PYTORCH_NESTED_AUTOENCODER' && value.model_artifact_ref === null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['model_artifact_ref'], message: 'trained autoencoder projection requires a revisioned model artifact' });
  }
});
export type LatentProjectionPlanV1 = z.infer<typeof latentProjectionPlanSchema>;

export const latentQualityReceiptSchema = z.object({
  schema: z.literal('atlas.latent-quality-receipt.v1').default('atlas.latent-quality-receipt.v1'),
  receipt_id: id,
  plan_id: id,
  source_semantic_snapshot_revision: revision,
  row_identity_checksum: checksum,
  producer: z.enum(LATENT_PRODUCERS),
  latent_dimension: z.union([z.literal(128), z.literal(64)]),
  sample_count: z.number().int().positive(),
  reconstruction_mse: z.number().finite().nonnegative(),
  reconstruction_cosine_mean: z.number().finite().min(-1).max(1),
  exact_knn_recall_at_k: z.number().finite().min(0).max(1),
  exact_knn_k: z.number().int().positive(),
  topk_overlap_mean: z.number().finite().min(0).max(1),
  downstream_route_accuracy: z.number().finite().min(0).max(1).nullable().default(null),
  latent_checksum: checksum,
  decoded_checksum: checksum,
  status: z.enum(['CHALLENGER', 'ADMITTED_ROUTING_TIER', 'REJECTED']),
  exact_semantic_promotion_required: z.literal(true).default(true),
  canonical_authority: z.literal(false).default(false),
  producer_revision: revision,
}).strict();
export type LatentQualityReceiptV1 = z.infer<typeof latentQualityReceiptSchema>;

export const semanticMemoryResidencySchema = z.object({
  schema: z.literal('atlas.semantic-memory-residency.v1').default('atlas.semantic-memory-residency.v1'),
  residency_id: id,
  canonical_id: id,
  source_snapshot_revision: revision,
  semantic_snapshot_revision: revision,
  representation: z.enum(SEMANTIC_REPRESENTATIONS),
  representation_revision: revision,
  tier: z.enum(SEMANTIC_MEMORY_TIERS),
  bytes_resident: bytes,
  artifact_ref: seaweedS3ArtifactRefSchema.nullable().default(null),
  row_ordinal: z.number().int().nonnegative(),
  row_identity_checksum: checksum,
  access_count: z.number().int().nonnegative().default(0),
  hit_count: z.number().int().nonnegative().default(0),
  last_access_epoch_ms: z.number().int().nonnegative().nullable().default(null),
  expires_at_epoch_ms: z.number().int().nonnegative().nullable().default(null),
  canonical_authority: z.literal(false).default(false),
}).strict().superRefine((value, ctx) => {
  if (value.tier === 'COLD_SEAWEED_S3' && value.artifact_ref === null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['artifact_ref'], message: 'cold SeaweedFS residency requires an object artifact reference' });
  }
  if (value.hit_count > value.access_count) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['hit_count'], message: 'hit_count cannot exceed access_count' });
  }
  if (value.representation === 'SEMANTIC_768' && value.tier === 'HOT_GPU') {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['tier'], message: 'reference policy does not pin full semantic_768 globally in HOT_GPU; promote exact rows on demand' });
  }
});
export type SemanticMemoryResidencyV1 = z.infer<typeof semanticMemoryResidencySchema>;

export const reuseProbabilityStateSchema = z.object({
  schema: z.literal('atlas.reuse-probability-state.v1').default('atlas.reuse-probability-state.v1'),
  memory_key: id,
  policy_revision: revision,
  prior_alpha: z.number().finite().positive(),
  prior_beta: z.number().finite().positive(),
  observed_reuses: z.number().int().nonnegative(),
  observed_misses: z.number().int().nonnegative(),
  posterior_reuse_probability: z.number().finite().min(0).max(1),
  frequency_estimate: z.number().finite().nonnegative(),
  recency_score: z.number().finite().min(0).max(1),
  query_likelihood: z.number().finite().min(0).max(1),
  evidence_utility: z.number().finite().min(0).max(1),
  byte_cost: bytes,
  reload_latency_ms: z.number().finite().nonnegative(),
  reconstruction_risk: z.number().finite().min(0).max(1),
  canonical_authority: z.literal(false).default(false),
}).strict().superRefine((value, ctx) => {
  const expected = (value.prior_alpha + value.observed_reuses) /
    (value.prior_alpha + value.prior_beta + value.observed_reuses + value.observed_misses);
  if (Math.abs(expected - value.posterior_reuse_probability) > 1e-9) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['posterior_reuse_probability'], message: 'posterior probability must match Beta-Bernoulli update' });
  }
});
export type ReuseProbabilityStateV1 = z.infer<typeof reuseProbabilityStateSchema>;

export const semanticMemorySwapDecisionSchema = z.object({
  schema: z.literal('atlas.semantic-memory-swap-decision.v1').default('atlas.semantic-memory-swap-decision.v1'),
  decision_id: id,
  memory_key: id,
  from_tier: z.enum(SEMANTIC_MEMORY_TIERS),
  to_tier: z.enum(SEMANTIC_MEMORY_TIERS),
  representation: z.enum(SEMANTIC_REPRESENTATIONS),
  score: z.number().finite(),
  expected_reuse_probability: z.number().finite().min(0).max(1),
  expected_byte_savings: bytes,
  expected_reload_cost_ms: z.number().finite().nonnegative(),
  reason: z.enum(['PROMOTE_REUSE', 'DEMOTE_PRESSURE', 'EVICT_STALE', 'PREFETCH_QUERY', 'EXACT_PROMOTION']),
  exact_semantic_required_before_evidence_use: z.literal(true).default(true),
  canonical_authority: z.literal(false).default(false),
  producer_revision: revision,
}).strict().superRefine((value, ctx) => {
  if (value.from_tier === value.to_tier) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['to_tier'], message: 'swap must change tier' });
  }
  if (value.reason === 'EXACT_PROMOTION' && value.representation !== 'SEMANTIC_768') {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['representation'], message: 'exact promotion must load semantic_768' });
  }
});
export type SemanticMemorySwapDecisionV1 = z.infer<typeof semanticMemorySwapDecisionSchema>;

export const tokenCompressionPlanSchema = z.object({
  schema: z.literal('atlas.token-compression-plan.v1').default('atlas.token-compression-plan.v1'),
  plan_id: id,
  plan_revision: revision,
  context_manifest_checksum: checksum,
  methods: z.array(z.enum([
    'EXACT_FRAGMENT_DEDUP',
    'SOURCE_COORDINATE_DEDUP',
    'TOOL_SCHEMA_REFERENCE',
    'STRUCTURED_SUMMARY',
    'SEMANTIC_CANDIDATE_REDUCTION',
  ])).min(1),
  tokens_before: z.number().int().nonnegative(),
  target_tokens: z.number().int().nonnegative(),
  minimum_evidence_coverage: z.number().finite().min(0).max(1),
  summary_receipt_ids: z.array(id).default([]),
  latent_vectors_may_be_decoded_into_evidence_text: z.literal(false).default(false),
  exact_source_promotion_required: z.literal(true).default(true),
  canonical_authority: z.literal(false).default(false),
}).strict().superRefine((value, ctx) => {
  if (value.target_tokens > value.tokens_before) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['target_tokens'], message: 'compression target cannot exceed original token count' });
  }
  if (value.methods.includes('STRUCTURED_SUMMARY') && value.summary_receipt_ids.length === 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['summary_receipt_ids'], message: 'structured summary compression requires validation/summary receipts' });
  }
});
export type TokenCompressionPlanV1 = z.infer<typeof tokenCompressionPlanSchema>;

export const adaptiveSemanticMemoryPolicySchema = z.object({
  schema: z.literal('atlas.adaptive-semantic-memory-policy.v1').default('atlas.adaptive-semantic-memory-policy.v1'),
  policy_revision: revision,
  hot_representation: z.literal('LATENT_64'),
  warm_representation: z.literal('LATENT_128'),
  exact_representation: z.literal('SEMANTIC_768'),
  cold_backend: z.literal('SEAWEEDFS_S3'),
  exact_semantic_storage: z.enum(['LOCAL_MMAP_AND_SEAWEEDFS_CHECKPOINT', 'SEAWEEDFS_ONLY_WITH_LOCAL_ROW_CACHE']),
  admission_policy: z.enum(['W_TINYLFU_STYLE', 'BETA_UTILITY', 'HYBRID']).default('HYBRID'),
  promotion_threshold: z.number().finite(),
  demotion_threshold: z.number().finite(),
  minimum_latent64_knn_recall: z.number().finite().min(0).max(1),
  minimum_latent128_knn_recall: z.number().finite().min(0).max(1),
  maximum_reconstruction_risk_for_hot: z.number().finite().min(0).max(1),
  exact_promotion_before_claim_verification: z.literal(true).default(true),
  canonical_authority: z.literal(false).default(false),
}).strict().superRefine((value, ctx) => {
  if (value.promotion_threshold <= value.demotion_threshold) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['promotion_threshold'], message: 'promotion threshold must exceed demotion threshold to provide hysteresis' });
  }
  if (value.minimum_latent128_knn_recall < value.minimum_latent64_knn_recall) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['minimum_latent128_knn_recall'], message: 'latent128 reference quality floor should be at least latent64 floor' });
  }
});
export type AdaptiveSemanticMemoryPolicyV1 = z.infer<typeof adaptiveSemanticMemoryPolicySchema>;

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

export function adaptiveSemanticMemoryChecksum(value: unknown): string {
  return createHash('sha256').update(stable(value), 'utf8').digest('hex');
}

export function updateReuseProbability(input: {
  memory_key: string;
  policy_revision: string;
  prior_alpha?: number;
  prior_beta?: number;
  observed_reuses: number;
  observed_misses: number;
  frequency_estimate: number;
  recency_score: number;
  query_likelihood: number;
  evidence_utility: number;
  byte_cost: number;
  reload_latency_ms: number;
  reconstruction_risk: number;
}): ReuseProbabilityStateV1 {
  const priorAlpha = input.prior_alpha ?? 1;
  const priorBeta = input.prior_beta ?? 1;
  const posterior = (priorAlpha + input.observed_reuses) /
    (priorAlpha + priorBeta + input.observed_reuses + input.observed_misses);
  return reuseProbabilityStateSchema.parse({
    schema: 'atlas.reuse-probability-state.v1',
    memory_key: input.memory_key,
    policy_revision: input.policy_revision,
    prior_alpha: priorAlpha,
    prior_beta: priorBeta,
    observed_reuses: input.observed_reuses,
    observed_misses: input.observed_misses,
    posterior_reuse_probability: posterior,
    frequency_estimate: input.frequency_estimate,
    recency_score: input.recency_score,
    query_likelihood: input.query_likelihood,
    evidence_utility: input.evidence_utility,
    byte_cost: input.byte_cost,
    reload_latency_ms: input.reload_latency_ms,
    reconstruction_risk: input.reconstruction_risk,
    canonical_authority: false,
  });
}

export function semanticResidencyUtility(state: ReuseProbabilityStateV1): number {
  const byteGiB = state.byte_cost / (1024 ** 3);
  const latencyBenefit = Math.log1p(state.reload_latency_ms) / 10;
  return (
    0.30 * state.posterior_reuse_probability +
    0.15 * Math.min(1, state.frequency_estimate / 32) +
    0.15 * state.recency_score +
    0.15 * state.query_likelihood +
    0.15 * state.evidence_utility +
    0.10 * Math.min(1, latencyBenefit) -
    0.20 * state.reconstruction_risk -
    0.10 * Math.min(1, byteGiB)
  );
}

export function chooseSemanticMemorySwap(input: {
  state: ReuseProbabilityStateV1;
  current_tier: SemanticMemoryResidencyV1['tier'];
  representation: SemanticMemoryResidencyV1['representation'];
  policy: AdaptiveSemanticMemoryPolicyV1;
  producer_revision: string;
}): SemanticMemorySwapDecisionV1 | null {
  const score = semanticResidencyUtility(input.state);
  const tierRank: Record<SemanticMemoryResidencyV1['tier'], number> = {
    COLD_SEAWEED_S3: 0,
    WARM_HOST: 1,
    HOT_GPU: 2,
  };
  let toTier = input.current_tier;
  let reason: SemanticMemorySwapDecisionV1['reason'] = 'DEMOTE_PRESSURE';
  if (score >= input.policy.promotion_threshold && tierRank[input.current_tier] < 2) {
    toTier = tierRank[input.current_tier] === 0 ? 'WARM_HOST' : 'HOT_GPU';
    reason = 'PROMOTE_REUSE';
  } else if (score <= input.policy.demotion_threshold && tierRank[input.current_tier] > 0) {
    toTier = tierRank[input.current_tier] === 2 ? 'WARM_HOST' : 'COLD_SEAWEED_S3';
    reason = 'DEMOTE_PRESSURE';
  }
  if (toTier === input.current_tier) return null;
  return semanticMemorySwapDecisionSchema.parse({
    decision_id: `semantic-swap:${input.state.memory_key}:${input.current_tier}:${toTier}`,
    memory_key: input.state.memory_key,
    from_tier: input.current_tier,
    to_tier: toTier,
    representation: input.representation,
    score,
    expected_reuse_probability: input.state.posterior_reuse_probability,
    expected_byte_savings: toTier === 'COLD_SEAWEED_S3' ? input.state.byte_cost : 0,
    expected_reload_cost_ms: input.state.reload_latency_ms,
    reason,
    exact_semantic_required_before_evidence_use: true,
    canonical_authority: false,
    producer_revision: input.producer_revision,
  });
}

export function describeAdaptiveSemanticMemory(): string {
  return [
    'semantic_768 remains the exact semantic representation used for exact promotion and evidence-sensitive retrieval; latent_128 and latent_64 are derived routing/cache representations only.',
    'The reference hierarchy uses latent_64 for the hottest GPU routing tier, latent_128 for warm host memory, and SeaweedFS S3 for immutable cold artifacts/checkpoints; exact semantic rows are promoted on demand.',
    'A linear IncrementalPCA baseline and a nested PyTorch autoencoder share the same row identity and are compared by reconstruction quality plus exact-KNN recall before either latent representation is admitted.',
    'Reuse probability is updated independently from semantic truth; the Beta posterior, recency, frequency, query likelihood, evidence utility, byte cost, reload latency and reconstruction risk determine promotion/demotion utility.',
    'Token compression uses exact/context dedup, references, validated summaries and semantic candidate reduction. Latent vectors are never decoded into evidence text without an independent validated generation contract.',
  ].join(' ');
}
