import test from 'node:test';
import assert from 'node:assert/strict';

import {
  TRI_ENGRAM_V1,
  triEngramV1Schema,
  buildOrnithPrefixIdentityV1,
  ornithPrefixIdentityV1Schema,
  testTimeMemoryObservationSchema,
  chooseAdaptiveMemoryDecision,
  lowBitRuntimePlanSchema,
} from '../dist/core/adaptive-memory-runtime.js';
import { adaptiveSemanticMemoryChecksum } from '../dist/core/adaptive-semantic-memory.js';

const sha = 'b'.repeat(64);

test('TriEngramV1 keeps canonical knowledge, derived projections, and ephemeral model state distinct', () => {
  assert.equal(TRI_ENGRAM_V1.E1.owner, 'POSTGRES');
  assert.equal(TRI_ENGRAM_V1.E1.canonicalAuthority, true);
  assert.equal(TRI_ENGRAM_V1.E2.derived, true);
  assert.equal(TRI_ENGRAM_V1.E2.canonicalAuthority, false);
  assert.equal(TRI_ENGRAM_V1.E3.owner, 'LLAMA_SERVER');
  assert.equal(TRI_ENGRAM_V1.E3.lifecycle, 'EPHEMERAL');
  assert.equal(TRI_ENGRAM_V1.E3.canonicalAuthority, false);
  assert.throws(() =>
    triEngramV1Schema.parse({
      ...TRI_ENGRAM_V1,
      E3: { ...TRI_ENGRAM_V1.E3, canonicalAuthority: true },
    })
  );
  assert.throws(() =>
    triEngramV1Schema.parse({
      ...TRI_ENGRAM_V1,
      E3: { ...TRI_ENGRAM_V1.E3, lifecycle: 'PERSISTENT' },
    })
  );
});

test('Ornith prefix identity binds every prefix-defining revision without becoming authority', () => {
  const material = {
    modelRevision: 'ornith-r1',
    chatTemplateRevision: 'template-r1',
    toolSchemaRevision: 'tools-r1',
    systemPromptRevision: 'prompt-r1',
    contextManifestPrefixChecksum: sha,
  };
  const identity = buildOrnithPrefixIdentityV1(material);

  assert.equal(identity.schema, 'atlas.ornith-prefix-identity.v1');
  assert.equal(identity.prefixIdentityChecksum, adaptiveSemanticMemoryChecksum(material));
  assert.equal(identity.canonicalAuthority, false);
  assert.equal(
    buildOrnithPrefixIdentityV1(material).prefixIdentityChecksum,
    identity.prefixIdentityChecksum
  );

  for (const key of Object.keys(material)) {
    const value =
      key === 'contextManifestPrefixChecksum' ? 'c'.repeat(64) : `${material[key]}-changed`;
    const changed = buildOrnithPrefixIdentityV1({ ...material, [key]: value });
    assert.notEqual(
      changed.prefixIdentityChecksum,
      identity.prefixIdentityChecksum,
      `${key} must change identity`
    );
  }
});

test('Ornith prefix identity rejects session telemetry and model recurrent state', () => {
  const identity = buildOrnithPrefixIdentityV1({
    modelRevision: 'ornith-r1',
    chatTemplateRevision: 'template-r1',
    toolSchemaRevision: 'tools-r1',
    systemPromptRevision: 'prompt-r1',
    contextManifestPrefixChecksum: sha,
  });

  assert.throws(() => ornithPrefixIdentityV1Schema.parse({ ...identity, sessionId: 'session:1' }));
  assert.throws(() => ornithPrefixIdentityV1Schema.parse({ ...identity, cacheHit: true }));
  assert.throws(() =>
    ornithPrefixIdentityV1Schema.parse({ ...identity, recurrentState: 'opaque' })
  );
  assert.throws(() =>
    ornithPrefixIdentityV1Schema.parse({ ...identity, canonicalAuthority: true })
  );
});

test('high-surprise verified observation is only nominated for persistence', () => {
  const observation = testTimeMemoryObservationSchema.parse({
    observation_id: 'memory-observation:1',
    workflow_id: 'workflow:1',
    workflow_revision: 2,
    source_snapshot_revision: 'source-r1',
    memory_key: 'repair:stale-revision',
    surprise_metric: 'VALIDATION_ERROR',
    surprise_score: 2.0,
    momentum_score: 0.5,
    recency_score: 1.0,
    evidence_refs: ['evidence:validator:1'],
    failure_receipt_ids: ['failure:1'],
    source_checksum: sha,
    producer_revision: 'producer-r1',
  });

  const decision = chooseAdaptiveMemoryDecision({
    observation,
    memory_policy_revision: 'memory-policy-r1',
    store_threshold: 0.8,
    persistent_nomination_threshold: 1.5,
    producer_revision: 'producer-r1',
  });

  assert.equal(decision.action, 'NOMINATE_PERSISTENT');
  assert.equal(decision.target_tier, 'PERSISTENT_MEMORY_NOMINATION');
  assert.equal(decision.persistent_write_allowed, false);
  assert.equal(decision.requires_claim_verification_for_persistence, true);
});

test('low-surprise observation is ignored', () => {
  const observation = testTimeMemoryObservationSchema.parse({
    observation_id: 'memory-observation:2',
    workflow_id: 'workflow:1',
    workflow_revision: 2,
    source_snapshot_revision: 'source-r1',
    memory_key: 'routine:success',
    surprise_metric: 'POLICY_DELTA',
    surprise_score: 0.05,
    momentum_score: 0,
    recency_score: 0.1,
    evidence_refs: [],
    failure_receipt_ids: [],
    source_checksum: sha,
    producer_revision: 'producer-r1',
  });
  const decision = chooseAdaptiveMemoryDecision({
    observation,
    memory_policy_revision: 'memory-policy-r1',
    store_threshold: 0.8,
    persistent_nomination_threshold: 1.5,
    producer_revision: 'producer-r1',
  });
  assert.equal(decision.action, 'IGNORE');
  assert.equal(decision.target_tier, 'NONE');
});

test('BitNet executor cannot be attached to arbitrary non-ternary weights', () => {
  assert.throws(() => lowBitRuntimePlanSchema.parse({
    plan_revision: 'lowbit-r1',
    model_id: 'ornith',
    model_revision: 'model-r1',
    weight_format: 'INT4_GGUF',
    executor: 'BITNET_CPP',
    target_device: 'CPU_X86',
    multiplication_strategy: 'LOOKUP_TABLE',
    kernel_family: 'tl2',
    kernel_revision: 'kernel-r1',
    tuning_profile_checksum: null,
    model_is_natively_compatible: false,
    conversion_is_lossless: false,
    challenger_only: true,
    producer_revision: 'producer-r1',
  }), /native BitNet-style ternary weights/);
});

test('T-MAC can be represented as low-bit challenger without canonical authority', () => {
  const plan = lowBitRuntimePlanSchema.parse({
    plan_revision: 'lowbit-r1',
    model_id: 'challenger-model',
    model_revision: 'model-r1',
    weight_format: 'INT4_GPTQ',
    executor: 'T_MAC',
    target_device: 'CPU_X86',
    multiplication_strategy: 'LOOKUP_TABLE',
    kernel_family: 'tmatrix-lut',
    kernel_revision: 'kernel-r1',
    tuning_profile_checksum: sha,
    model_is_natively_compatible: true,
    conversion_is_lossless: true,
    challenger_only: true,
    producer_revision: 'producer-r1',
  });
  assert.equal(plan.canonical_authority, false);
  assert.equal(plan.challenger_only, true);
});

test('QSA_LUT can be represented as low-bit challenger with QSA_SUBSPACE_LUT strategy', () => {
  const plan = lowBitRuntimePlanSchema.parse({
    plan_revision: 'qsa-r1',
    model_id: 'deepreinforce-ai/Ornith-1.0-9B',
    model_revision: 'ornith-r1',
    weight_format: 'INT4_GGUF',
    executor: 'QSA_LUT',
    target_device: 'GPU',
    multiplication_strategy: 'QSA_SUBSPACE_LUT',
    kernel_family: 'qsa-table-lookup',
    kernel_revision: 'kernel-qsa-v1',
    tuning_profile_checksum: sha,
    model_is_natively_compatible: true,
    conversion_is_lossless: true,
    challenger_only: true,
    producer_revision: 'producer-r1',
  });
  assert.equal(plan.executor, 'QSA_LUT');
  assert.equal(plan.multiplication_strategy, 'QSA_SUBSPACE_LUT');
  assert.equal(plan.canonical_authority, false);
});

