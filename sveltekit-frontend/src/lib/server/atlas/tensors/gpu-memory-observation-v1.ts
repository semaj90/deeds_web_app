import { z } from 'zod';

/**
 * BITFROST-GPU-MEMORY-ADMISSION-01 (stage B: observation contract)
 *
 * A typed, revision-agnostic envelope for exactly the four raw readings
 * `decideGpuMemoryAdmissionV1()` (./gpu-memory-admission-v1.ts) already
 * accepts -- this is a pure data contract, no I/O, no hardware access. It
 * exists so a receipt can show WHICH probe produced WHICH number and WHEN,
 * without guessing from field names alone once real observation adapters
 * (stages C/D) start emitting these.
 *
 * Deliberately does NOT decide anything -- `GpuMemoryObservationV1` is
 * evidence; `decideGpuMemoryAdmissionV1()` is the decision. Keep them
 * separate: an observation adapter emits this shape, a caller extracts the
 * four numeric fields via `toAdmissionInputFields()` below to feed the
 * admission policy, and BOTH the observation and the resulting admission
 * decision belong together in an audit receipt.
 */

export const GPU_MEMORY_OBSERVATION_SCHEMA = 'atlas.gpu-memory-observation.v1' as const;

export const GPU_MEMORY_OBSERVATION_SOURCES = ['nvidia-smi', 'wddm', 'cuda-context'] as const;
export type GpuMemoryObservationSource = (typeof GPU_MEMORY_OBSERVATION_SOURCES)[number];

const nonNegativeSafeInteger = z.number().int().nonnegative().refine(Number.isSafeInteger, 'NOT_SAFE_INTEGER');

const observedReadingSchema = z.object({
  value: nonNegativeSafeInteger,
  source: z.enum(GPU_MEMORY_OBSERVATION_SOURCES),
}).strict();
export type GpuMemoryObservedReadingV1 = z.infer<typeof observedReadingSchema>;

/**
 * Every field is independently optional (`null` when that signal wasn't
 * captured this round) -- mirrors `decideGpuMemoryAdmissionV1()`'s own
 * independently-nullable input fields exactly, so this envelope can be
 * mapped straight into that function's input with no lossy transform.
 */
export const gpuMemoryObservationV1Schema = z.object({
  schema: z.literal(GPU_MEMORY_OBSERVATION_SCHEMA),
  observedAt: z.string().datetime(),
  deviceFreeObserved: observedReadingSchema.nullable(),
  wddmBudget: observedReadingSchema.nullable(),
  wddmCurrentUsage: observedReadingSchema.nullable(),
  cudaContextFree: observedReadingSchema.nullable(),
  /** Free-text identifier for the host/device this observation was taken
   * on (e.g. "RTX-3060Ti-8GB-host1") -- purely descriptive, never used as a
   * join key or identity. */
  deviceLabel: z.string().min(1).nullable().default(null),
  writesPerformed: z.literal(false),
}).strict().superRefine((value, ctx) => {
  const hasAny = value.deviceFreeObserved || value.wddmBudget || value.wddmCurrentUsage || value.cudaContextFree;
  if (!hasAny) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'GPU_MEMORY_OBSERVATION_EMPTY -- at least one reading must be present; an observation with zero readings is not useful evidence and should not be constructed',
    });
  }
  if (value.wddmBudget && value.wddmCurrentUsage && value.wddmCurrentUsage.source !== value.wddmBudget.source) {
    // Not strictly required by the admission policy, but a real inconsistency
    // worth flagging early: budget and usage should come from the same probe.
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['wddmCurrentUsage', 'source'],
      message: 'GPU_MEMORY_OBSERVATION_WDDM_SOURCE_MISMATCH -- wddmBudget and wddmCurrentUsage should be read from the same source probe',
    });
  }
});
export type GpuMemoryObservationV1 = z.infer<typeof gpuMemoryObservationV1Schema>;

export function buildGpuMemoryObservationV1(input: z.input<typeof gpuMemoryObservationV1Schema>): GpuMemoryObservationV1 {
  return gpuMemoryObservationV1Schema.parse(input);
}

/**
 * Extract the four nullable numeric fields `decideGpuMemoryAdmissionV1()`
 * expects, discarding the `source`/`observedAt` provenance -- the admission
 * policy itself never needs to know WHICH probe produced a number, only the
 * number and whether it was trusted (which it re-validates independently).
 */
export function toAdmissionInputFields(observation: GpuMemoryObservationV1): {
  deviceFreeObserved: number | null;
  wddmBudget: number | null;
  wddmCurrentUsage: number | null;
  cudaContextFree: number | null;
} {
  return {
    deviceFreeObserved: observation.deviceFreeObserved?.value ?? null,
    wddmBudget: observation.wddmBudget?.value ?? null,
    wddmCurrentUsage: observation.wddmCurrentUsage?.value ?? null,
    cudaContextFree: observation.cudaContextFree?.value ?? null,
  };
}
