import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildPrefillRuntimeIdentity,
  prefillRuntimeChecksum,
} from '../dist/core/prefill-cache-runtime.js';
import {
  runtimePrefillCapabilitiesSchema,
  runtimePrefillBindingSchema,
  runtimePrefillReuseReceiptSchema,
  trtllmRuntimePolicySchema,
} from '../dist/core/inference-prefill-runtime.js';

const H = (value) => prefillRuntimeChecksum(value);

function identity(runtimeId = 'runtime:trtllm', runtimeRevision = 'runtime-r1') {
  return buildPrefillRuntimeIdentity({
    prefill_identity_checksum: H('prefill'),
    instruction_set_checksum: H('instructions'),
    hydration_manifest_checksum: H('hydration'),
    feature_alignment_checksum: H('features'),
    context_manifest_checksum: H('context'),
    compiler_revision: 'compiler-r1',
    model_revision: 'model-r1',
    adapter_revision: 'adapter-r1',
    tokenizer_revision: 'tokenizer-r1',
    chat_template_revision: 'template-r1',
    inference_runtime_id: runtimeId,
    inference_runtime_revision: runtimeRevision,
  });
}

function trtllmCapabilities(overrides = {}) {
  return runtimePrefillCapabilitiesSchema.parse({
    runtime_id: 'runtime:trtllm',
    runtime_revision: 'runtime-r1',
    runtime: 'TRTLLM_PYTORCH',
    serving_layer: 'DIRECT',
    model_revision: 'model-r1',
    adapter_revision: 'adapter-r1',
    tokenizer_revision: 'tokenizer-r1',
    chat_template_revision: 'template-r1',
    cache_modes: ['PAGED_KV_BLOCK_REUSE'],
    paged_kv_cache: true,
    block_reuse: true,
    partial_block_reuse: true,
    cache_salt_supported: true,
    kv_host_offload_supported: true,
    kv_connector_supported: false,
    inflight_batching_supported: true,
    chunked_context_supported: true,
    lora_cache_supported: true,
    runtime_metrics_supported: true,
    ...overrides,
  });
}

test('TRT-LLM paged KV reuse remains bound below Atlas logical prefill identity', () => {
  const binding = runtimePrefillBindingSchema.parse({
    binding_id: 'binding:1',
    binding_revision: 'binding-r1',
    identity: identity(),
    capabilities: trtllmCapabilities(),
    cache_mode: 'PAGED_KV_BLOCK_REUSE',
    cache_namespace_checksum: H('tenant-a'),
    request_isolation_checksum: H('conversation-a'),
  });
  assert.equal(binding.identity.prefill_identity_checksum, H('prefill'));
  assert.equal(binding.capabilities.runtime, 'TRTLLM_PYTORCH');
  assert.equal(binding.canonical_authority, false);
});

test('runtime binding rejects mismatched model/tokenizer/template identity', () => {
  assert.throws(() => runtimePrefillBindingSchema.parse({
    binding_id: 'binding:bad',
    binding_revision: 'binding-r1',
    identity: identity(),
    capabilities: trtllmCapabilities({ tokenizer_revision: 'tokenizer-r2' }),
    cache_mode: 'PAGED_KV_BLOCK_REUSE',
  }), /model\/adapter\/tokenizer\/template revisions/);
});

test('block reuse requires paged KV cache and an admitted cache mode', () => {
  assert.throws(() => runtimePrefillCapabilitiesSchema.parse({
    ...trtllmCapabilities(),
    paged_kv_cache: false,
  }), /paged_kv_cache|paged KV cache/);
});

test('disaggregated TRT-LLM policy requires a KV connector', () => {
  assert.throws(() => trtllmRuntimePolicySchema.parse({
    policy_revision: 'policy-r1',
    runtime: 'TRTLLM_PYTORCH',
    disaggregated_prefill_decode: true,
    kv_connector_backend: 'NONE',
  }), /KV connector backend/);

  const policy = trtllmRuntimePolicySchema.parse({
    policy_revision: 'policy-r1',
    runtime: 'TRTLLM_PYTORCH',
    disaggregated_prefill_decode: true,
    kv_connector_backend: 'NIXL',
    kv_cache_free_gpu_mem_fraction: 0.5,
    kv_cache_host_memory_bytes: 2_000_000_000,
  });
  assert.equal(policy.kv_connector_backend, 'NIXL');
});

test('runtime reuse receipt cannot overclaim reused blocks', () => {
  assert.throws(() => runtimePrefillReuseReceiptSchema.parse({
    request_id: 'request:1',
    binding_id: 'binding:1',
    runtime: 'TRTLLM_PYTORCH',
    runtime_revision: 'runtime-r1',
    prefill_identity_checksum: H('prefill'),
    cache_mode: 'PAGED_KV_BLOCK_REUSE',
    reused: true,
    reused_kv_blocks: 11,
    total_kv_blocks: 10,
    producer_revision: 'producer-r1',
  }), /cannot exceed/);
});
