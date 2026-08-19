import { z } from 'zod';

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
  freeVramBytes: z.number().int().nonnegative(),
  reserveVramBytes: z.number().int().nonnegative(),
  recomputeCostRatio: z.number().finite().nonnegative(),
  latencyBudgetMs: z.number().finite().positive().nullable(),
  selectedMode: MemoryExecutionModeSchema,
  checkpointSegments: z.number().int().positive().nullable(),
  preserveRngState: z.boolean(),
  preferNonReentrantCheckpoint: z.boolean(),
  reasons: z.array(z.string().min(1)).min(1).max(12),
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
  producerRevision: string;
}): MemoryPressurePolicyV1 {
  const usable = Math.max(0, input.freeVramBytes - input.reserveVramBytes);
  const workingSet = input.payloadBytes + input.estimatedActivationBytes;
  const reasons: string[] = [];
  let selectedMode: MemoryExecutionMode = 'FULL_RESIDENT';
  let checkpointSegments: number | null = null;

  if (workingSet <= usable * 0.70) {
    selectedMode = 'FULL_RESIDENT';
    reasons.push('WORKING_SET_FITS_WITH_HEADROOM');
  } else if (input.payloadBytes <= usable * 0.85) {
    selectedMode = 'TILED';
    reasons.push('PAYLOAD_FITS_BUT_FULL_ACTIVATIONS_DO_NOT');
  } else if (input.estimatedActivationBytes > 0 && input.recomputeCostRatio <= 2.5 && usable > 0) {
    selectedMode = 'CHECKPOINTED';
    const pressure = workingSet / Math.max(1, usable);
    checkpointSegments = Math.max(2, Math.min(16, Math.ceil(pressure * 2)));
    reasons.push('RECOMPUTE_ACCEPTABLE_UNDER_VRAM_PRESSURE');
  } else if (input.payloadBytes <= Math.max(usable * 4, 1)) {
    selectedMode = 'CPU_OFFLOAD';
    reasons.push('GPU_RESIDENCY_EXCEEDED_USE_HOST_MEMORY');
  } else {
    selectedMode = 'ROUTING_ONLY_LOD';
    reasons.push('FULL_PAYLOAD_EXCEEDS_BOUNDED_EXECUTION_ENVELOPE');
  }

  return MemoryPressurePolicyV1Schema.parse({
    schema: 'atlas.memory-pressure-policy.v1',
    payloadBytes: input.payloadBytes,
    estimatedActivationBytes: input.estimatedActivationBytes,
    freeVramBytes: input.freeVramBytes,
    reserveVramBytes: input.reserveVramBytes,
    recomputeCostRatio: input.recomputeCostRatio,
    latencyBudgetMs: input.latencyBudgetMs ?? null,
    selectedMode,
    checkpointSegments,
    preserveRngState: true,
    preferNonReentrantCheckpoint: true,
    reasons,
    producerRevision: input.producerRevision,
  });
}
