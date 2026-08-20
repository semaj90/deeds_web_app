import { z } from 'zod';

const id = z.string().min(1);
const revision = z.string().min(1);
const checksum = z.string().regex(/^[a-f0-9]{64}$/);

export const testTimeMemoryObservationSchema = z.object({
  schema: z.literal('atlas.test-time-memory-observation.v1').default('atlas.test-time-memory-observation.v1'),
  observation_id: id,
  workflow_id: id,
  workflow_revision: z.number().int().nonnegative(),
  source_snapshot_revision: revision,
  memory_key: id,
  surprise_metric: z.enum(['PREDICTION_RESIDUAL', 'VALIDATION_ERROR', 'RETRIEVAL_NOVELTY', 'POLICY_DELTA']),
  surprise_score: z.number().finite().nonnegative(),
  momentum_score: z.number().finite(),
  recency_score: z.number().finite().min(0).max(1),
  evidence_refs: z.array(id).default([]),
  failure_receipt_ids: z.array(id).default([]),
  source_checksum: checksum,
  producer_revision: revision,
  canonical_authority: z.literal(false).default(false),
}).strict();
export type TestTimeMemoryObservationV1 = z.infer<typeof testTimeMemoryObservationSchema>;

export const adaptiveMemoryDecisionSchema = z.object({
  schema: z.literal('atlas.adaptive-memory-decision.v1').default('atlas.adaptive-memory-decision.v1'),
  decision_id: id,
  observation_id: id,
  memory_policy_revision: revision,
  action: z.enum(['IGNORE', 'STORE_EPHEMERAL', 'STORE_SESSION', 'NOMINATE_PERSISTENT', 'DEMOTE', 'FORGET']),
  target_tier: z.enum(['NONE', 'IPYTHON_NAMESPACE', 'ACE_HOT', 'BITFROST', 'PERSISTENT_MEMORY_NOMINATION']),
  score: z.number().finite(),
  maximum_ttl_seconds: z.number().int().positive().nullable().default(null),
  requires_claim_verification_for_persistence: z.literal(true).default(true),
  persistent_write_allowed: z.literal(false).default(false),
  producer_revision: revision,
  canonical_authority: z.literal(false).default(false),
}).strict().superRefine((value, ctx) => {
  if (value.action === 'NOMINATE_PERSISTENT' && value.target_tier !== 'PERSISTENT_MEMORY_NOMINATION') {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['target_tier'], message: 'persistent memory can only be nominated; the kernel cannot persist it directly' });
  }
  if (value.action === 'IGNORE' && value.target_tier !== 'NONE') {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['target_tier'], message: 'IGNORE must target NONE' });
  }
});
export type AdaptiveMemoryDecisionV1 = z.infer<typeof adaptiveMemoryDecisionSchema>;

export const lowBitRuntimePlanSchema = z.object({
  schema: z.literal('atlas.low-bit-runtime-plan.v1').default('atlas.low-bit-runtime-plan.v1'),
  plan_revision: revision,
  model_id: id,
  model_revision: revision,
  weight_format: z.enum(['TERNARY_1_58', 'INT1', 'INT2', 'INT3', 'INT4_GPTQ', 'INT4_GGUF']),
  executor: z.enum(['BITNET_CPP', 'T_MAC', 'LLAMA_CPP', 'CUSTOM_ATLAS_LUT']),
  target_device: z.enum(['CPU_X86', 'CPU_ARM', 'NPU', 'GPU']),
  multiplication_strategy: z.enum(['LOOKUP_TABLE', 'DEQUANTIZE_GEMM', 'NATIVE_LOWBIT_KERNEL']),
  kernel_family: z.string().min(1),
  kernel_revision: revision,
  tuning_profile_checksum: checksum.nullable().default(null),
  model_is_natively_compatible: z.boolean(),
  conversion_is_lossless: z.boolean(),
  challenger_only: z.boolean().default(true),
  canonical_authority: z.literal(false).default(false),
  producer_revision: revision,
}).strict().superRefine((value, ctx) => {
  if (value.executor === 'BITNET_CPP' && value.weight_format !== 'TERNARY_1_58') {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['weight_format'], message: 'BITNET_CPP plan is reserved for native BitNet-style ternary weights' });
  }
  if (value.executor === 'T_MAC' && !['TERNARY_1_58', 'INT1', 'INT2', 'INT3', 'INT4_GPTQ', 'INT4_GGUF'].includes(value.weight_format)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['weight_format'], message: 'T-MAC plan requires a supported low-bit representation' });
  }
  if (!value.model_is_natively_compatible && value.conversion_is_lossless) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['conversion_is_lossless'], message: 'a model outside the native format cannot claim lossless conversion without a separately proven conversion contract' });
  }
});
export type LowBitRuntimePlanV1 = z.infer<typeof lowBitRuntimePlanSchema>;

export const headCalibrationObservationSchema = z.object({
  schema: z.literal('atlas.head-calibration-observation.v1').default('atlas.head-calibration-observation.v1'),
  observation_id: id,
  model_revision: revision,
  calibration_snapshot_revision: revision,
  layer_index: z.number().int().nonnegative(),
  head_index: z.number().int().nonnegative(),
  head_kind: z.enum(['FULL_ATTENTION_QUERY', 'FULL_ATTENTION_KV', 'DELTANET_LINEAR_HEAD']),
  activation_l2_mean: z.number().finite().nonnegative(),
  gradient_l2_mean: z.number().finite().nonnegative().nullable().default(null),
  routing_relevance_mean: z.number().finite().min(0).max(1),
  evidence_lift_mean: z.number().finite(),
  sample_count: z.number().int().positive(),
  input_checksum: checksum,
  producer_revision: revision,
  canonical_authority: z.literal(false).default(false),
}).strict();
export type HeadCalibrationObservationV1 = z.infer<typeof headCalibrationObservationSchema>;

export function chooseAdaptiveMemoryDecision(input: {
  observation: TestTimeMemoryObservationV1;
  memory_policy_revision: string;
  store_threshold: number;
  persistent_nomination_threshold: number;
  producer_revision: string;
}): AdaptiveMemoryDecisionV1 {
  const observation = testTimeMemoryObservationSchema.parse(input.observation);
  const score = observation.surprise_score + 0.25 * observation.momentum_score + 0.1 * observation.recency_score;
  if (score >= input.persistent_nomination_threshold && observation.evidence_refs.length > 0) {
    return adaptiveMemoryDecisionSchema.parse({
      decision_id: `memory:${observation.observation_id}`,
      observation_id: observation.observation_id,
      memory_policy_revision: input.memory_policy_revision,
      action: 'NOMINATE_PERSISTENT',
      target_tier: 'PERSISTENT_MEMORY_NOMINATION',
      score,
      maximum_ttl_seconds: null,
      producer_revision: input.producer_revision,
    });
  }
  if (score >= input.store_threshold) {
    return adaptiveMemoryDecisionSchema.parse({
      decision_id: `memory:${observation.observation_id}`,
      observation_id: observation.observation_id,
      memory_policy_revision: input.memory_policy_revision,
      action: 'STORE_SESSION',
      target_tier: 'ACE_HOT',
      score,
      maximum_ttl_seconds: 3600,
      producer_revision: input.producer_revision,
    });
  }
  return adaptiveMemoryDecisionSchema.parse({
    decision_id: `memory:${observation.observation_id}`,
    observation_id: observation.observation_id,
    memory_policy_revision: input.memory_policy_revision,
    action: 'IGNORE',
    target_tier: 'NONE',
    score,
    maximum_ttl_seconds: null,
    producer_revision: input.producer_revision,
  });
}

export function describeAdaptiveMemoryRuntime(): string {
  return [
    'Atlas may borrow Titans/MIRAS ideas such as surprise, momentum and forgetting for memory admission without claiming that the base model implements the Titans architecture.',
    'Kernel/session memories remain derived state; persistent memory is only nominated and must pass claim verification plus TypeScript-host materialization.',
    'BitNet and T-MAC lookup-table techniques are runtime challengers tied to compatible low-bit weight formats; they do not justify lossless conversion of an arbitrary QLoRA model.',
    'Attention/DeltaNet head calibration may guide adapter targeting and runtime routing, but head saliency remains a derived training signal rather than evidence.',
  ].join(' ');
}
