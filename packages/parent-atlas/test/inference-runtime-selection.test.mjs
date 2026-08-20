import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildPrefillRuntimeIdentity,
  inferenceRuntimeSelectionChecksum,
  selectInferenceRuntime,
} from '../dist/index.js';

const H = (text) => inferenceRuntimeSelectionChecksum(text);

function identity(overrides = {}) {
  return buildPrefillRuntimeIdentity({
    prefill_identity_checksum: H('prefill'),
    instruction_set_checksum: H('instructions'),
    hydration_manifest_checksum: H('hydration'),
    feature_alignment_checksum: H('features'),
    context_manifest_checksum: H('context'),
    compiler_revision: 'compiler:r1',
    model_revision: 'model:r1',
    adapter_revision: null,
    tokenizer_revision: 'tokenizer:r1',
    chat_template_revision: 'template:r1',
    inference_runtime_id: 'runtime:placeholder',
    inference_runtime_revision: 'runtime:r1',
    ...overrides,
  });
}

function capabilities(runtime, runtimeId, overrides = {}) {
  return {
    runtime_id: runtimeId,
    runtime_revision: 'runtime:r1',
    runtime,
    serving_layer: runtime.startsWith('TRITON_') ? 'TRITON' : 'DIRECT',
    model_revision: 'model:r1',
    adapter_revision: null,
    tokenizer_revision: 'tokenizer:r1',
    chat_template_revision: 'template:r1',
    cache_modes: runtime.includes('TRTLLM')
      ? ['PAGED_KV_BLOCK_REUSE']
      : ['PREFIX_TOKEN_REUSE'],
    paged_kv_cache: runtime.includes('TRTLLM'),
    block_reuse: runtime.includes('TRTLLM'),
    partial_block_reuse: false,
    cache_salt_supported: runtime.includes('TRTLLM'),
    kv_host_offload_supported: runtime.includes('TRTLLM'),
    kv_connector_supported: false,
    inflight_batching_supported: runtime === 'TRITON_TRTLLM',
    chunked_context_supported: runtime.includes('TRTLLM'),
    lora_cache_supported: runtime.includes('TRTLLM'),
    runtime_metrics_supported: true,
    canonical_authority: false,
    ...overrides,
  };
}

const gpu = {
  device_id: 'gpu:0', snapshot_revision: 'gpu:r1', total_bytes: 8_000_000_000,
  free_bytes: 4_000_000_000, safety_reserve_bytes: 500_000_000,
  resident_workloads: [], producer_revision: 'probe:r1',
};

const workload = {
  request_id: 'request:1', workload_revision: 'workload:r1', prompt_tokens: 4096,
  maximum_output_tokens: 512, expected_concurrent_lanes: 4, streaming_required: true,
  logical_prefill_cache_hit: true, expected_runtime_prefix_reuse: true,
  lora_required: false, disaggregated_prefill_decode_required: false,
  deterministic_runtime_required: false, latency_weight: 0.4, throughput_weight: 0.4,
  memory_weight: 0.2, producer_revision: 'workload-producer:r1',
};

const policy = {
  policy_revision: 'policy:r1',
  allowed_runtimes: ['LLAMA_CPP', 'TRITON_TRTLLM', 'PYTORCH_COMPILE'],
  allow_evictable_capacity: false,
  minimum_free_after_admission_bytes: 250_000_000,
  queue_pressure_penalty: 0.25,
  inflight_pressure_penalty: 0.25,
  cache_reuse_bonus: 0.15,
  inflight_batching_bonus: 0.1,
};

function candidate(candidate_id, runtime, runtimeId, overrides = {}) {
  return {
    candidate_id, candidate_revision: 'candidate:r1',
    capabilities: capabilities(runtime, runtimeId),
    required_persistent_gpu_bytes: 1_000_000_000,
    required_workspace_gpu_bytes: 250_000_000,
    current_queue_depth: 0,
    maximum_queue_depth: 16,
    current_inflight_requests: 0,
    maximum_inflight_requests: 8,
    streaming_supported: true,
    deterministic_runtime_supported: false,
    benchmark_observation_ids: [],
    policy_priority: 1000,
    producer_revision: 'candidate-producer:r1',
    ...overrides,
  };
}

test('selector rejects model revision mismatch rather than falling back silently', () => {
  const id = identity({ inference_runtime_id: 'runtime:placeholder' });
  const bad = candidate('bad', 'LLAMA_CPP', 'llama:1', {
    capabilities: capabilities('LLAMA_CPP', 'llama:1', { model_revision: 'model:r2' }),
  });
  const receipt = selectInferenceRuntime({ identity: id, workload, gpu, candidates: [bad], policy, producer_revision: 'selector:r1' });
  assert.equal(receipt.decision, 'NO_ADMISSIBLE_RUNTIME');
  assert.ok(receipt.evaluations[0].rejection_reasons.includes('MODEL_REVISION_MISMATCH'));
});

test('selector rejects a runtime that violates VRAM reserve', () => {
  const id = identity({ inference_runtime_id: 'runtime:placeholder' });
  const huge = candidate('huge', 'LLAMA_CPP', 'llama:1', {
    required_persistent_gpu_bytes: 3_400_000_000,
    required_workspace_gpu_bytes: 400_000_000,
  });
  const receipt = selectInferenceRuntime({ identity: id, workload, gpu, candidates: [huge], policy, producer_revision: 'selector:r1' });
  assert.equal(receipt.decision, 'NO_ADMISSIBLE_RUNTIME');
  assert.ok(receipt.evaluations[0].rejection_reasons.includes('INSUFFICIENT_VRAM') || receipt.evaluations[0].rejection_reasons.includes('POST_ADMISSION_RESERVE_VIOLATION'));
});

test('inflight batching earns a bonus only under concurrent load', () => {
  const id = identity({ inference_runtime_id: 'runtime:placeholder' });
  const llama = candidate('llama', 'LLAMA_CPP', 'llama:1');
  const triton = candidate('triton', 'TRITON_TRTLLM', 'triton:1');
  const concurrent = selectInferenceRuntime({ identity: id, workload, gpu, candidates: [llama, triton], policy, producer_revision: 'selector:r1' });
  const tritonEval = concurrent.evaluations.find((item) => item.candidate_id === 'triton');
  assert.equal(tritonEval.score_components.inflight_batching_bonus, 0.1);

  const single = selectInferenceRuntime({
    identity: id,
    workload: { ...workload, expected_concurrent_lanes: 1 },
    gpu,
    candidates: [llama, triton],
    policy,
    producer_revision: 'selector:r1',
  });
  const singleTriton = single.evaluations.find((item) => item.candidate_id === 'triton');
  assert.equal(singleTriton.score_components.inflight_batching_bonus, 0);
});

test('runtime name itself has no intrinsic performance score', () => {
  const id = identity({ inference_runtime_id: 'runtime:placeholder' });
  const llama = candidate('a-llama', 'LLAMA_CPP', 'llama:1', { policy_priority: 1000 });
  const triton = candidate('z-triton', 'TRITON_TRTLLM', 'triton:1', {
    policy_priority: 1000,
    capabilities: capabilities('TRITON_TRTLLM', 'triton:1', { inflight_batching_supported: false, block_reuse: false, paged_kv_cache: false, cache_modes: ['PREFIX_TOKEN_REUSE'] }),
  });
  const neutralWorkload = { ...workload, expected_concurrent_lanes: 1, expected_runtime_prefix_reuse: false };
  const receipt = selectInferenceRuntime({ identity: id, workload: neutralWorkload, gpu, candidates: [triton, llama], policy, producer_revision: 'selector:r1' });
  assert.equal(receipt.selected_candidate_id, 'a-llama');
});

test('only a revision-compatible benchmark contributes empirical score', () => {
  const id = identity({ inference_runtime_id: 'runtime:placeholder' });
  const triton = candidate('triton', 'TRITON_TRTLLM', 'triton:1', { benchmark_observation_ids: ['bench:good', 'bench:bad'] });
  const base = {
    runtime: 'TRITON_TRTLLM', runtime_revision: 'runtime:r1', model_revision: 'model:r1', adapter_revision: null,
    tokenizer_revision: 'tokenizer:r1', chat_template_revision: 'template:r1', device_fingerprint_checksum: H('device'),
    workload_fingerprint_checksum: H('workload'), concurrency: 4, input_tokens_mean: 4096, output_tokens_mean: 512,
    ttft_p50_ms: 100, ttft_p95_ms: 150, inter_token_latency_p50_ms: 10,
    output_token_throughput_per_s: 100, request_throughput_per_s: 4, peak_gpu_memory_bytes: 2_000_000_000,
    source: 'ATLAS_BENCHMARK', producer_revision: 'bench-producer:r1',
  };
  const receipt = selectInferenceRuntime({
    identity: id,
    workload,
    gpu,
    candidates: [triton],
    policy,
    benchmarks: [
      { ...base, observation_id: 'bench:bad', model_revision: 'model:other' },
      { ...base, observation_id: 'bench:good' },
    ],
    producer_revision: 'selector:r1',
  });
  assert.ok(receipt.evaluations[0].empirical_score > 0);
});
