import { z } from 'zod';
import type { HybridSequenceStateV1 } from './hybrid-sequence-state.js';

export const MemoryExecutionModeSchema = z.enum([
  'FULL_RESIDENT',
  'TILED',
  'CHECKPOINTED',
  'CPU_OFFLOAD',
  'ROUTING_ONLY_LOD',
]);
export type MemoryExecutionMode = z.infer<typeof MemoryExecutionModeSchema>;

export const MemoryPressurePolicyV1Schema = z.object({
  schema: z.literal('atlas.memory-pressure-policy.v1'),
  payloadBytes: z.number().int().nonnegative(),
  estimatedActivationBytes: z.number().int().nonnegative(),
  sequenceStateBytes: z.number().int().nonnegative(),
  deltaNetRecurrentStateBytes: z.number().int().nonnegative(),
  deltaNetConvolutionStateBytes: z.number().int().nonnegative(),
  fullAttentionKvCacheBytes: z.number().int().nonnegative(),
  freeVramBytes: z.number().int().nonnegative(),
  reserveVramBytes: z.number().int().nonnegative(),
  recomputeCostRatio: z.number().finite().nonnegative(),
  latencyBudgetMs: z.number().finite().positive().nullable(),
  selectedMode: MemoryExecutionModeSchema,
  checkpointSegments: z.number().int().positive().nullable(),
  preserveRngState: z.boolean(),
  preferNonReentrantCheckpoint: z.boolean(),
  preserveDeltaNetState: z.boolean(),
  compactOrPageFullAttentionKv: z.boolean(),
  reasons: z.array(z.string().min(1)).min(1).max(16),
  producerRevision: z.string().min(1),
}).strict();
export type MemoryPressurePolicyV1 = z.infer<typeof MemoryPressurePolicyV1Schema>;

export function chooseMemoryPressurePolicy(input: {
  payloadBytes: number;
  estimatedActivationBytes: number;
  freeVramBytes: number;
  reserveVramBytes: number;
  recomputeCostRatio: number;
  latencyBudgetMs?: number | null;
  hybridSequenceState?: Pick<
    HybridSequenceStateV1,
    | 'totalSequenceStateBytes'
    | 'deltaNetRecurrentStateBytes'
    | 'deltaNetConvolutionStateBytes'
    | 'fullAttentionKvCacheBytes'
  > | null;
  producerRevision: string;
}): MemoryPressurePolicyV1 {
  const usable = Math.max(0, input.freeVramBytes - input.reserveVramBytes);
  const sequenceStateBytes = input.hybridSequenceState?.totalSequenceStateBytes ?? 0;
  const deltaNetRecurrentStateBytes = input.hybridSequenceState?.deltaNetRecurrentStateBytes ?? 0;
  const deltaNetConvolutionStateBytes = input.hybridSequenceState?.deltaNetConvolutionStateBytes ?? 0;
  const fullAttentionKvCacheBytes = input.hybridSequenceState?.fullAttentionKvCacheBytes ?? 0;
  const workingSet = input.payloadBytes + input.estimatedActivationBytes + sequenceStateBytes;
  const reasons: string[] = [];
  let selectedMode: MemoryExecutionMode = 'FULL_RESIDENT';
  let checkpointSegments: number | null = null;

  if (workingSet <= usable * 0.70) {
    selectedMode = 'FULL_RESIDENT';
    reasons.push('WORKING_SET_FITS_WITH_HEADROOM');
  } else if (input.payloadBytes + sequenceStateBytes <= usable * 0.85) {
    selectedMode = 'TILED';
    reasons.push('PERSISTENT_PAYLOAD_AND_SEQUENCE_STATE_FIT_BUT_FULL_ACTIVATIONS_DO_NOT');
  } else if (input.estimatedActivationBytes > 0 && input.recomputeCostRatio <= 2.5 && usable > 0) {
    selectedMode = 'CHECKPOINTED';
    const pressure = workingSet / Math.max(1, usable);
    checkpointSegments = Math.max(2, Math.min(16, Math.ceil(pressure * 2)));
    reasons.push('RECOMPUTE_ACCEPTABLE_UNDER_VRAM_PRESSURE');
  } else if (input.payloadBytes + sequenceStateBytes <= Math.max(usable * 4, 1)) {
    selectedMode = 'CPU_OFFLOAD';
    reasons.push('GPU_RESIDENCY_EXCEEDED_USE_HOST_MEMORY');
  } else {
    selectedMode = 'ROUTING_ONLY_LOD';
    reasons.push('FULL_PAYLOAD_EXCEEDS_BOUNDED_EXECUTION_ENVELOPE');
  }

  const hasHybridState = sequenceStateBytes > 0;
  const preserveDeltaNetState = hasHybridState && (deltaNetRecurrentStateBytes + deltaNetConvolutionStateBytes > 0);
  const compactOrPageFullAttentionKv = hasHybridState
    && fullAttentionKvCacheBytes > 0
    && selectedMode !== 'FULL_RESIDENT';

  if (preserveDeltaNetState) reasons.push('PRESERVE_BOUNDED_DELTANET_RECURRENT_STATE');
  if (compactOrPageFullAttentionKv) reasons.push('TARGET_GROWING_FULL_ATTENTION_KV_BEFORE_UNIFORM_STATE_EVICTION');

  return MemoryPressurePolicyV1Schema.parse({
    schema: 'atlas.memory-pressure-policy.v1',
    payloadBytes: input.payloadBytes,
    estimatedActivationBytes: input.estimatedActivationBytes,
    sequenceStateBytes,
    deltaNetRecurrentStateBytes,
    deltaNetConvolutionStateBytes,
    fullAttentionKvCacheBytes,
    freeVramBytes: input.freeVramBytes,
    reserveVramBytes: input.reserveVramBytes,
    recomputeCostRatio: input.recomputeCostRatio,
    latencyBudgetMs: input.latencyBudgetMs ?? null,
    selectedMode,
    checkpointSegments,
    preserveRngState: true,
    preferNonReentrantCheckpoint: true,
    preserveDeltaNetState,
    compactOrPageFullAttentionKv,
    reasons,
    producerRevision: input.producerRevision,
  });
}
