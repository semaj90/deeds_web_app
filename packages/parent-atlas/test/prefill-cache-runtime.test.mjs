import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildPrefillCacheEntry,
  contextualFabricChecksum,
} from '../dist/core/contextual-prefill-fabric.js';
import {
  buildLlamaPrefillReuseReceipt,
  buildPrefillRuntimeIdentity,
  buildValkeyPrefillCacheRecord,
  prefillValkeyStorageKey,
  verifyPrefillRecord,
  llamaPromptCacheBindingSchema,
  prefillReuseMetricsReceiptSchema,
} from '../dist/core/prefill-cache-runtime.js';

const H = (value) => contextualFabricChecksum(value);

function identity(overrides = {}) {
  return buildPrefillRuntimeIdentity({
    prefill_identity_checksum: H('prefill'),
    instruction_set_checksum: H('instructions'),
    hydration_manifest_checksum: H('hydration'),
    feature_alignment_checksum: H('features'),
    context_manifest_checksum: H('context'),
    compiler_revision: 'compiler:r1',
    model_revision: 'model:r1',
    adapter_revision: 'adapter:r1',
    tokenizer_revision: 'tokenizer:r1',
    chat_template_revision: 'chat-template:r1',
    inference_runtime_id: 'llama-server:local',
    inference_runtime_revision: 'v1',
    ...overrides,
  });
}

function entry(runtimeIdentity, overrides = {}) {
  return buildPrefillCacheEntry({
    prefill_identity_checksum: runtimeIdentity.prefill_identity_checksum,
    instruction_set_checksum: runtimeIdentity.instruction_set_checksum,
    hydration_manifest_checksum: runtimeIdentity.hydration_manifest_checksum,
    feature_alignment_checksum: runtimeIdentity.feature_alignment_checksum,
    context_manifest_checksum: runtimeIdentity.context_manifest_checksum,
    compiler_revision: runtimeIdentity.compiler_revision,
    compiled_prefill_artifact_id: 'prefill:artifact:1',
    compiled_prefill_checksum: H('compiled-prefill'),
    status: 'VALID',
    ...overrides,
  });
}

test('Valkey cache key is deterministic and namespaced', () => {
  const runtimeIdentity = identity();
  assert.match(prefillValkeyStorageKey(runtimeIdentity.cache_key), /^atlas:prefill:v1:[a-f0-9]{64}$/);
  assert.equal(identity().cache_key, runtimeIdentity.cache_key);
});

test('valid immutable prefill record is reusable only for identical runtime identity', () => {
  const expected = identity();
  const record = buildValkeyPrefillCacheRecord({ identity: expected, entry: entry(expected), ttl_seconds: 3600 });
  assert.equal(verifyPrefillRecord(record, expected).status, 'HIT');
  assert.equal(verifyPrefillRecord(record, expected).reusable, true);

  const changedSource = identity({ hydration_manifest_checksum: H('hydration-v2') });
  const result = verifyPrefillRecord(record, changedSource);
  assert.equal(result.reusable, false);
  assert.equal(result.status, 'STALE');
  assert.ok(result.mismatches.includes('hydration_manifest_checksum'));
});

test('model/tokenizer/template/runtime changes invalidate logical runtime reuse', () => {
  const expected = identity();
  const record = buildValkeyPrefillCacheRecord({ identity: expected, entry: entry(expected), ttl_seconds: 3600 });
  for (const changed of [
    identity({ model_revision: 'model:r2' }),
    identity({ tokenizer_revision: 'tokenizer:r2' }),
    identity({ chat_template_revision: 'chat-template:r2' }),
    identity({ inference_runtime_revision: 'v2' }),
  ]) {
    assert.equal(verifyPrefillRecord(record, changed).reusable, false);
  }
});

test('corrupted stored-value checksum is rejected', () => {
  const expected = identity();
  const record = buildValkeyPrefillCacheRecord({ identity: expected, entry: entry(expected), ttl_seconds: 3600 });
  const corrupted = { ...record, stored_value_checksum: H('wrong') };
  const result = verifyPrefillRecord(corrupted, expected);
  assert.equal(result.status, 'CORRUPT');
  assert.equal(result.reusable, false);
});

test('llama prompt cache binding is model/runtime revision qualified', () => {
  const binding = llamaPromptCacheBindingSchema.parse({
    binding_id: 'binding:1',
    binding_revision: 'r1',
    prefill_identity_checksum: H('prefill'),
    inference_runtime_id: 'llama-server:local',
    inference_runtime_revision: 'v8757',
    model_revision: 'ornith:r1',
    adapter_revision: null,
    tokenizer_revision: 'tok:r1',
    chat_template_revision: 'chat:r1',
    reuse_mode: 'RUNTIME_PREFIX_MATCH',
  });
  assert.equal(binding.cache_prompt, true);
  assert.equal(binding.canonical_authority, false);

  assert.throws(() => llamaPromptCacheBindingSchema.parse({
    ...binding,
    reuse_mode: 'EXPLICIT_SLOT_FILE',
  }));
});

test('llama runtime receipt computes prompt reuse ratio from cache_n and prompt_n', () => {
  const receipt = buildLlamaPrefillReuseReceipt({
    request_id: 'request:1',
    binding_id: 'binding:1',
    prefill_identity_checksum: H('prefill'),
    cache_prompt_enabled: true,
    cache_n: 236,
    prompt_n: 4,
    predicted_n: 32,
    prompt_ms: 12,
    tokens_cached: 236,
    tokens_evaluated: 4,
    producer_revision: 'producer:r1',
  });
  assert.equal(receipt.prompt_reuse_ratio, 236 / 240);
});

test('DRY metrics cannot claim more fragments, instructions, or tokens after dedup', () => {
  const receipt = prefillReuseMetricsReceiptSchema.parse({
    request_id: 'request:1',
    logical_prefill_cache_hit: true,
    llama_prompt_cache_reused: true,
    source_fragments_before: 12,
    source_fragments_after: 7,
    instruction_atoms_before: 10,
    instruction_atoms_after: 6,
    estimated_tokens_before: 2400,
    estimated_tokens_after: 1450,
    llama_cache_n: 1200,
    llama_prompt_n: 250,
    recomputation_avoided: ['INSTRUCTION_COMPILE', 'PREFILL_TEXT_COMPILE'],
    producer_revision: 'producer:r1',
  });
  assert.equal(receipt.estimated_tokens_before - receipt.estimated_tokens_after, 950);

  assert.throws(() => prefillReuseMetricsReceiptSchema.parse({
    ...receipt,
    estimated_tokens_after: 3000,
  }));
});
