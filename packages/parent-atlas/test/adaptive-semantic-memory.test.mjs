import assert from 'node:assert/strict';
import test from 'node:test';

import {
  adaptiveSemanticMemoryPolicySchema,
  chooseSemanticMemorySwap,
  latentProjectionPlanSchema,
  semanticMemoryResidencySchema,
  tokenCompressionPlanSchema,
  updateReuseProbability,
} from '../dist/core/adaptive-semantic-memory.js';

const h = (char) => char.repeat(64);

const policy = adaptiveSemanticMemoryPolicySchema.parse({
  policy_revision: 'memory-r1',
  hot_representation: 'LATENT_64',
  warm_representation: 'LATENT_128',
  exact_representation: 'SEMANTIC_768',
  cold_backend: 'SEAWEEDFS_S3',
  exact_semantic_storage: 'LOCAL_MMAP_AND_SEAWEEDFS_CHECKPOINT',
  promotion_threshold: 0.55,
  demotion_threshold: 0.20,
  minimum_latent64_knn_recall: 0.80,
  minimum_latent128_knn_recall: 0.90,
  maximum_reconstruction_risk_for_hot: 0.20,
});

test('nested autoencoder plan requires revisioned SeaweedFS model artifact', () => {
  assert.throws(() => latentProjectionPlanSchema.parse({
    plan_id: 'latent-plan-1',
    plan_revision: 'latent-r1',
    source_semantic_snapshot_revision: 'semantic-r1',
    row_identity_checksum: h('a'),
    canonical_dimension: 768,
    producer: 'PYTORCH_NESTED_AUTOENCODER',
    latent_dimensions: [128, 64],
    deterministic_seed: 7,
    producer_revision: 'test-r1',
  }));
});

test('cold residency must point to immutable SeaweedFS S3 artifact', () => {
  assert.throws(() => semanticMemoryResidencySchema.parse({
    residency_id: 'res-1',
    canonical_id: 'candidate-1',
    source_snapshot_revision: 'source-r1',
    semantic_snapshot_revision: 'semantic-r1',
    representation: 'LATENT_128',
    representation_revision: 'latent-r1',
    tier: 'COLD_SEAWEED_S3',
    bytes_resident: 256,
    row_ordinal: 1,
    row_identity_checksum: h('b'),
  }));
});

test('full semantic_768 is not globally pinned in hot GPU tier', () => {
  assert.throws(() => semanticMemoryResidencySchema.parse({
    residency_id: 'res-2',
    canonical_id: 'candidate-2',
    source_snapshot_revision: 'source-r1',
    semantic_snapshot_revision: 'semantic-r1',
    representation: 'SEMANTIC_768',
    representation_revision: 'semantic-r1',
    tier: 'HOT_GPU',
    bytes_resident: 1536,
    row_ordinal: 2,
    row_identity_checksum: h('c'),
  }));
});

test('Beta-Bernoulli reuse probability is deterministic', () => {
  const state = updateReuseProbability({
    memory_key: 'candidate-3',
    policy_revision: 'memory-r1',
    prior_alpha: 1,
    prior_beta: 1,
    observed_reuses: 8,
    observed_misses: 2,
    frequency_estimate: 10,
    recency_score: 0.9,
    query_likelihood: 0.8,
    evidence_utility: 0.9,
    byte_cost: 128,
    reload_latency_ms: 12,
    reconstruction_risk: 0.05,
  });
  assert.equal(state.posterior_reuse_probability, 9 / 12);
});

test('high utility promotes cold memory only one tier at a time', () => {
  const state = updateReuseProbability({
    memory_key: 'candidate-4',
    policy_revision: 'memory-r1',
    observed_reuses: 30,
    observed_misses: 1,
    frequency_estimate: 30,
    recency_score: 1,
    query_likelihood: 1,
    evidence_utility: 1,
    byte_cost: 128,
    reload_latency_ms: 40,
    reconstruction_risk: 0.01,
  });
  const decision = chooseSemanticMemorySwap({
    state,
    current_tier: 'COLD_SEAWEED_S3',
    representation: 'LATENT_128',
    policy,
    producer_revision: 'test-r1',
  });
  assert.equal(decision?.to_tier, 'WARM_HOST');
  assert.equal(decision?.reason, 'PROMOTE_REUSE');
});

test('low utility demotes hot memory rather than deleting canonical evidence', () => {
  const state = updateReuseProbability({
    memory_key: 'candidate-5',
    policy_revision: 'memory-r1',
    observed_reuses: 0,
    observed_misses: 30,
    frequency_estimate: 0,
    recency_score: 0,
    query_likelihood: 0,
    evidence_utility: 0,
    byte_cost: 1024 * 1024 * 512,
    reload_latency_ms: 1,
    reconstruction_risk: 0.9,
  });
  const decision = chooseSemanticMemorySwap({
    state,
    current_tier: 'HOT_GPU',
    representation: 'LATENT_64',
    policy,
    producer_revision: 'test-r1',
  });
  assert.equal(decision?.to_tier, 'WARM_HOST');
  assert.equal(decision?.exact_semantic_required_before_evidence_use, true);
});

test('token compression cannot decode latent vectors into evidence text', () => {
  const plan = tokenCompressionPlanSchema.parse({
    plan_id: 'token-plan-1',
    plan_revision: 'token-r1',
    context_manifest_checksum: h('d'),
    methods: ['EXACT_FRAGMENT_DEDUP', 'SOURCE_COORDINATE_DEDUP', 'SEMANTIC_CANDIDATE_REDUCTION'],
    tokens_before: 8000,
    target_tokens: 4000,
    minimum_evidence_coverage: 0.95,
  });
  assert.equal(plan.latent_vectors_may_be_decoded_into_evidence_text, false);
  assert.equal(plan.exact_source_promotion_required, true);
});

test('structured summary token compression requires receipts', () => {
  assert.throws(() => tokenCompressionPlanSchema.parse({
    plan_id: 'token-plan-2',
    plan_revision: 'token-r2',
    context_manifest_checksum: h('e'),
    methods: ['STRUCTURED_SUMMARY'],
    tokens_before: 5000,
    target_tokens: 1500,
    minimum_evidence_coverage: 0.9,
  }));
});
