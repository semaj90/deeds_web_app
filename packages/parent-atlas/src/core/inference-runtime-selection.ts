import { createHash } from 'node:crypto';
import { z } from 'zod';
import { gpuResourceEnvelopeSchema, evaluateGpuAdmission } from './gpu-resource-envelope.js';
import {
  ATLAS_INFERENCE_RUNTIMES,
  runtimePrefillCapabilitiesSchema,
  type RuntimePrefillCapabilitiesV1,
} from './inference-prefill-runtime.js';
import { prefillRuntimeIdentitySchema } from './prefill-cache-runtime.js';

const id = z.string().min(1);
const revision = z.string().min(1);
const checksum = z.string().regex(/^[a-f0-9]{64}$/);
const bytes = z.number().int().nonnegative();

export const inferenceWorkloadProfileSchema = z.object({
  schema: z.literal('atlas.inference-workload-profile.v1').default('atlas.inference-workload-profile.v1'),
  request_id: id,
  workload_revision: revision,
  prompt_tokens: z.number().int().nonnegative(),
  maximum_output_tokens: z.number().int().positive(),
  expected_concurrent_lanes: z.number().int().positive().max(1024),
  streaming_required: z.boolean().default(true),
  logical_prefill_cache_hit: z.boolean().default(false),
  expected_runtime_prefix_reuse: z.boolean().default(false),
  lora_required: z.boolean().default(false),
  disaggregated_prefill_decode_required: z.boolean().default(false),
  deterministic_runtime_required: z.boolean().default(false),
  latency_weight: z.number().finite().min(0).max(1),
  throughput_weight: z.number().finite().min(0).max(1),
  memory_weight: z.number().finite().min(0).max(1),
  producer_revision: revision,
  canonical_authority: z.literal(false).default(false),
}).strict().superRefine((value, ctx) => {
  const total = value.latency_weight + value.throughput_weight + value.memory_weight;
  if (Math.abs(total - 1) > 1e-9) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['latency_weight'], message: 'latency/throughput/memory weights must sum to 1' });
  }
});
export type InferenceWorkloadProfileV1 = z.infer<typeof inferenceWorkloadProfileSchema>;

export const inferenceBenchmarkObservationSchema = z.object({
  schema: z.literal('atlas.inference-benchmark-observation.v1').default('atlas.inference-benchmark-observation.v1'),
  observation_id: id,
  runtime: z.enum(ATLAS_INFERENCE_RUNTIMES),
  runtime_revision: revision,
  model_revision: revision,
  adapter_revision: revision.nullable().default(null),
  tokenizer_revision: revision,
  chat_template_revision: revision,
  device_fingerprint_checksum: checksum,
  workload_fingerprint_checksum: checksum,
  concurrency: z.number().int().positive(),
  input_tokens_mean: z.number().finite().nonnegative(),
  output_tokens_mean: z.number().finite().nonnegative(),
  ttft_p50_ms: z.number().finite().nonnegative().nullable().default(null),
  ttft_p95_ms: z.number().finite().nonnegative().nullable().default(null),
  inter_token_latency_p50_ms: z.number().finite().nonnegative().nullable().default(null),
  output_token_throughput_per_s: z.number().finite().nonnegative().nullable().default(null),
  request_throughput_per_s: z.number().finite().nonnegative().nullable().default(null),
  peak_gpu_memory_bytes: bytes.nullable().default(null),
  source: z.enum(['GENAI_PERF', 'AIPERF', 'TRITON_MODEL_ANALYZER', 'ATLAS_BENCHMARK']),
  producer_revision: revision,
  canonical_authority: z.literal(false).default(false),
}).strict();
export type InferenceBenchmarkObservationV1 = z.infer<typeof inferenceBenchmarkObservationSchema>;

export const inferenceRuntimeCandidateSchema = z.object({
  schema: z.literal('atlas.inference-runtime-candidate.v1').default('atlas.inference-runtime-candidate.v1'),
  candidate_id: id,
  candidate_revision: revision,
  capabilities: runtimePrefillCapabilitiesSchema,
  required_persistent_gpu_bytes: bytes,
  required_workspace_gpu_bytes: bytes,
  evictable_resident_bytes: bytes.default(0),
  current_queue_depth: z.number().int().nonnegative().default(0),
  maximum_queue_depth: z.number().int().positive().nullable().default(null),
  current_inflight_requests: z.number().int().nonnegative().default(0),
  maximum_inflight_requests: z.number().int().positive().nullable().default(null),
  streaming_supported: z.boolean().default(true),
  deterministic_runtime_supported: z.boolean().default(false),
  benchmark_observation_ids: z.array(id).max(64).default([]),
  policy_priority: z.number().int().min(0).max(10_000).default(1000),
  producer_revision: revision,
  canonical_authority: z.literal(false).default(false),
}).strict().superRefine((value, ctx) => {
  if (value.maximum_queue_depth !== null && value.current_queue_depth > value.maximum_queue_depth) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['current_queue_depth'], message: 'current queue depth cannot exceed declared maximum' });
  }
  if (value.maximum_inflight_requests !== null && value.current_inflight_requests > value.maximum_inflight_requests) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['current_inflight_requests'], message: 'current inflight requests cannot exceed declared maximum' });
  }
});
export type InferenceRuntimeCandidateV1 = z.infer<typeof inferenceRuntimeCandidateSchema>;

export const inferenceRuntimeSelectionPolicySchema = z.object({
  schema: z.literal('atlas.inference-runtime-selection-policy.v1').default('atlas.inference-runtime-selection-policy.v1'),
  policy_revision: revision,
  allowed_runtimes: z.array(z.enum(ATLAS_INFERENCE_RUNTIMES)).min(1),
  require_exact_runtime_revision_match: z.literal(true).default(true),
  require_benchmark_for_empirical_score: z.literal(true).default(true),
  allow_evictable_capacity: z.boolean().default(false),
  minimum_free_after_admission_bytes: bytes.default(0),
  queue_pressure_penalty: z.number().finite().min(0).max(1).default(0.25),
  inflight_pressure_penalty: z.number().finite().min(0).max(1).default(0.25),
  cache_reuse_bonus: z.number().finite().min(0).max(1).default(0.15),
  inflight_batching_bonus: z.number().finite().min(0).max(1).default(0.1),
  canonical_authority: z.literal(false).default(false),
}).strict();
export type InferenceRuntimeSelectionPolicyV1 = z.infer<typeof inferenceRuntimeSelectionPolicySchema>;

export const candidateSelectionEvaluationSchema = z.object({
  candidate_id: id,
  runtime: z.enum(ATLAS_INFERENCE_RUNTIMES),
  admitted: z.boolean(),
  rejection_reasons: z.array(z.string().min(1)).default([]),
  available_after_reserve_bytes: bytes,
  required_gpu_bytes: bytes,
  remaining_after_admission_bytes: bytes,
  queue_pressure: z.number().finite().min(0).max(1),
  inflight_pressure: z.number().finite().min(0).max(1),
  empirical_score: z.number().finite().min(0).max(1).nullable().default(null),
  policy_score: z.number().finite(),
  score_components: z.record(z.string(), z.number().finite()),
}).strict();
export type CandidateSelectionEvaluationV1 = z.infer<typeof candidateSelectionEvaluationSchema>;

export const inferenceRuntimeSelectionReceiptSchema = z.object({
  schema: z.literal('atlas.inference-runtime-selection-receipt.v1').default('atlas.inference-runtime-selection-receipt.v1'),
  request_id: id,
  workload_revision: revision,
  policy_revision: revision,
  prefill_identity_checksum: checksum,
  selected_candidate_id: id.nullable(),
  selected_runtime: z.enum(ATLAS_INFERENCE_RUNTIMES).nullable(),
  evaluations: z.array(candidateSelectionEvaluationSchema).min(1),
  decision: z.enum(['SELECTED', 'NO_ADMISSIBLE_RUNTIME']),
  selection_checksum: checksum,
  producer_revision: revision,
  canonical_authority: z.literal(false).default(false),
}).strict().superRefine((value, ctx) => {
  if (value.decision === 'SELECTED' && (value.selected_candidate_id === null || value.selected_runtime === null)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['selected_candidate_id'], message: 'SELECTED requires candidate/runtime' });
  }
  if (value.decision === 'NO_ADMISSIBLE_RUNTIME' && (value.selected_candidate_id !== null || value.selected_runtime !== null)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['selected_candidate_id'], message: 'NO_ADMISSIBLE_RUNTIME cannot select a runtime' });
  }
});
export type InferenceRuntimeSelectionReceiptV1 = z.infer<typeof inferenceRuntimeSelectionReceiptSchema>;

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

export function inferenceRuntimeSelectionChecksum(value: unknown): string {
  return createHash('sha256').update(stable(value), 'utf8').digest('hex');
}

function pressure(current: number, maximum: number | null): number {
  if (maximum === null) return 0;
  return Math.min(1, current / maximum);
}

function benchmarkScore(
  benchmark: InferenceBenchmarkObservationV1 | undefined,
  workload: InferenceWorkloadProfileV1,
): number | null {
  if (!benchmark) return null;
  const latency = benchmark.ttft_p50_ms === null ? null : 1 / (1 + benchmark.ttft_p50_ms);
  const throughput = benchmark.output_token_throughput_per_s === null ? null : benchmark.output_token_throughput_per_s / (1 + benchmark.output_token_throughput_per_s);
  const memory = benchmark.peak_gpu_memory_bytes === null ? null : 1 / (1 + benchmark.peak_gpu_memory_bytes / (1024 ** 3));
  const values = [latency, throughput, memory];
  if (values.every((item) => item === null)) return null;
  return (
    workload.latency_weight * (latency ?? 0) +
    workload.throughput_weight * (throughput ?? 0) +
    workload.memory_weight * (memory ?? 0)
  );
}

function matchingBenchmark(
  candidate: InferenceRuntimeCandidateV1,
  benchmarks: readonly InferenceBenchmarkObservationV1[],
  identity: z.infer<typeof prefillRuntimeIdentitySchema>,
): InferenceBenchmarkObservationV1 | undefined {
  const allowed = new Set(candidate.benchmark_observation_ids);
  return benchmarks.find((benchmark) =>
    allowed.has(benchmark.observation_id) &&
    benchmark.runtime === candidate.capabilities.runtime &&
    benchmark.runtime_revision === candidate.capabilities.runtime_revision &&
    benchmark.model_revision === identity.model_revision &&
    benchmark.adapter_revision === identity.adapter_revision &&
    benchmark.tokenizer_revision === identity.tokenizer_revision &&
    benchmark.chat_template_revision === identity.chat_template_revision
  );
}

export function selectInferenceRuntime(input: {
  identity: z.input<typeof prefillRuntimeIdentitySchema>;
  workload: z.input<typeof inferenceWorkloadProfileSchema>;
  gpu: z.input<typeof gpuResourceEnvelopeSchema>;
  candidates: readonly z.input<typeof inferenceRuntimeCandidateSchema>[];
  policy: z.input<typeof inferenceRuntimeSelectionPolicySchema>;
  benchmarks?: readonly z.input<typeof inferenceBenchmarkObservationSchema>[];
  producer_revision: string;
}): InferenceRuntimeSelectionReceiptV1 {
  const identity = prefillRuntimeIdentitySchema.parse(input.identity);
  const workload = inferenceWorkloadProfileSchema.parse(input.workload);
  const gpu = gpuResourceEnvelopeSchema.parse(input.gpu);
  const policy = inferenceRuntimeSelectionPolicySchema.parse(input.policy);
  const candidates = input.candidates.map((candidate) => inferenceRuntimeCandidateSchema.parse(candidate));
  const benchmarks = (input.benchmarks ?? []).map((item) => inferenceBenchmarkObservationSchema.parse(item));
  const allowed = new Set(policy.allowed_runtimes);

  const evaluations = candidates.map((candidate): CandidateSelectionEvaluationV1 => {
    const reasons: string[] = [];
    const cap: RuntimePrefillCapabilitiesV1 = candidate.capabilities;
    if (!allowed.has(cap.runtime)) reasons.push('RUNTIME_NOT_ALLOWED');
    if (cap.model_revision !== identity.model_revision) reasons.push('MODEL_REVISION_MISMATCH');
    if (cap.adapter_revision !== identity.adapter_revision) reasons.push('ADAPTER_REVISION_MISMATCH');
    if (cap.tokenizer_revision !== identity.tokenizer_revision) reasons.push('TOKENIZER_REVISION_MISMATCH');
    if (cap.chat_template_revision !== identity.chat_template_revision) reasons.push('CHAT_TEMPLATE_REVISION_MISMATCH');
    if (workload.streaming_required && !candidate.streaming_supported) reasons.push('STREAMING_UNSUPPORTED');
    if (workload.lora_required && !cap.lora_cache_supported) reasons.push('LORA_CACHE_UNSUPPORTED');
    if (workload.disaggregated_prefill_decode_required && !cap.cache_modes.includes('DISAGGREGATED_PREFILL_DECODE')) reasons.push('DISAGGREGATED_PREFILL_DECODE_UNSUPPORTED');
    if (workload.deterministic_runtime_required && !candidate.deterministic_runtime_supported) reasons.push('DETERMINISTIC_RUNTIME_UNSUPPORTED');
    if (candidate.maximum_queue_depth !== null && candidate.current_queue_depth >= candidate.maximum_queue_depth) reasons.push('QUEUE_FULL');
    if (candidate.maximum_inflight_requests !== null && candidate.current_inflight_requests >= candidate.maximum_inflight_requests) reasons.push('INFLIGHT_CAPACITY_EXHAUSTED');

    const admission = evaluateGpuAdmission({
      envelope: gpu,
      request: {
        operation_id: `runtime:${candidate.candidate_id}`,
        operation_kind: 'other',
        required_workspace_bytes: candidate.required_workspace_gpu_bytes,
        required_persistent_bytes: candidate.required_persistent_gpu_bytes,
        may_evict: policy.allow_evictable_capacity,
      },
    });
    if (!admission.admitted) reasons.push('INSUFFICIENT_VRAM');
    const remaining = Math.max(0, admission.available_after_reserve_bytes + (policy.allow_evictable_capacity ? admission.evictable_bytes : 0) - admission.required_total_bytes);
    if (remaining < policy.minimum_free_after_admission_bytes) reasons.push('POST_ADMISSION_RESERVE_VIOLATION');

    const queuePressure = pressure(candidate.current_queue_depth, candidate.maximum_queue_depth);
    const inflightPressure = pressure(candidate.current_inflight_requests, candidate.maximum_inflight_requests);
    const benchmark = matchingBenchmark(candidate, benchmarks, identity);
    const empirical = benchmarkScore(benchmark, workload);
    const cacheBonus = workload.expected_runtime_prefix_reuse && cap.block_reuse ? policy.cache_reuse_bonus : 0;
    const batchingBonus = workload.expected_concurrent_lanes > 1 && cap.inflight_batching_supported ? policy.inflight_batching_bonus : 0;
    const priorityScore = 1 / (1 + candidate.policy_priority);
    const memoryHeadroom = admission.available_after_reserve_bytes === 0 ? 0 : remaining / admission.available_after_reserve_bytes;
    const score =
      (empirical ?? 0) +
      cacheBonus +
      batchingBonus +
      priorityScore +
      workload.memory_weight * memoryHeadroom -
      policy.queue_pressure_penalty * queuePressure -
      policy.inflight_pressure_penalty * inflightPressure;

    return candidateSelectionEvaluationSchema.parse({
      candidate_id: candidate.candidate_id,
      runtime: cap.runtime,
      admitted: reasons.length === 0,
      rejection_reasons: reasons,
      available_after_reserve_bytes: admission.available_after_reserve_bytes,
      required_gpu_bytes: admission.required_total_bytes,
      remaining_after_admission_bytes: remaining,
      queue_pressure: queuePressure,
      inflight_pressure: inflightPressure,
      empirical_score: empirical,
      policy_score: score,
      score_components: {
        empirical: empirical ?? 0,
        cache_bonus: cacheBonus,
        inflight_batching_bonus: batchingBonus,
        priority: priorityScore,
        memory_headroom: workload.memory_weight * memoryHeadroom,
        queue_penalty: -policy.queue_pressure_penalty * queuePressure,
        inflight_penalty: -policy.inflight_pressure_penalty * inflightPressure,
      },
    });
  });

  const selected = evaluations
    .filter((item) => item.admitted)
    .sort((left, right) => right.policy_score - left.policy_score || left.candidate_id.localeCompare(right.candidate_id))[0];

  const raw = {
    schema: 'atlas.inference-runtime-selection-receipt.v1' as const,
    request_id: workload.request_id,
    workload_revision: workload.workload_revision,
    policy_revision: policy.policy_revision,
    prefill_identity_checksum: identity.prefill_identity_checksum,
    selected_candidate_id: selected?.candidate_id ?? null,
    selected_runtime: selected?.runtime ?? null,
    evaluations,
    decision: selected ? 'SELECTED' as const : 'NO_ADMISSIBLE_RUNTIME' as const,
    producer_revision: input.producer_revision,
    canonical_authority: false as const,
  };
  return inferenceRuntimeSelectionReceiptSchema.parse({
    ...raw,
    selection_checksum: inferenceRuntimeSelectionChecksum(raw),
  });
}

export function describeInferenceRuntimeSelection(): string {
  return [
    'Runtime selection is deterministic policy over revision compatibility, GPU admission, required features, queue/inflight pressure and optional revision-matched benchmark observations.',
    'No runtime receives an intrinsic speed score: TensorRT-LLM, Triton and PyTorch performance enters the decision only through measured receipts tied to the same model/runtime/device/workload identity.',
    'Logical Atlas prefill cache hits and runtime KV-prefix reuse are separate signals; runtime block reuse can earn a policy bonus only when the workload predicts a reusable prefix.',
    'The selector returns NO_ADMISSIBLE_RUNTIME rather than silently evicting safety reserves or changing model/tokenizer/template identity.',
  ].join(' ');
}
