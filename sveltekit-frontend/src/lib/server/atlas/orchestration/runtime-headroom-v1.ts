import { z } from 'zod';
import {
  isAdmissionGradeGpuTelemetrySourceV1,
  type GpuMemoryTelemetryV1,
  type GpuTelemetrySource,
} from '../gpu/gpu-residency-budget.js';

/**
 * HEADROOM-V2-01: an OBSERVED resource sample with provenance and an age limit.
 *
 * Distinct from the two existing `ExecutionHeadroomV1` contracts, which are BUDGETS:
 *  - `orchestration/execution-headroom-v1.ts` = per-request caps;
 *  - `packages/parent-atlas-retrieval/src/bifrost/residency-scheduler.ts` = VRAM admission derived from
 *    `freeVramBytes`.
 * This type is what such a budget should be derived from. It is a cost/residency FEATURE only
 * (`canonicalAuthority: false`): it never grants admission by itself and never establishes identity.
 *
 * Ownership (HEADROOM-V2-03): the GPU observation is owned by `GpuMemoryTelemetryV1` (`gpu/gpu-residency-budget.ts`;
 * admission-grade producer `gpu/nvidia-smi-memory-client.ts`, source-grade rule + freshness enforced by
 * `planGpuResidencyV1`). This type COMPOSES it with RAM / Valkey / model state through
 * `buildRuntimeHeadroomV1FromGpuTelemetry`; it must not invent or own GPU telemetry.
 *
 * Project rule (CLAUDE.md, GPU compute lanes): `cudaMemGetInfo` follows the Windows WDDM Budget and
 * overstated free VRAM ~20x on this host, so a sample from it is recorded but is NOT admission-grade;
 * size allocations from `nvidia-smi`/NVML measured outside the CUDA process.
 */
export const RUNTIME_HEADROOM_V1_SCHEMA = 'atlas.runtime-headroom.v1' as const;

const bytes = z.number().int().nonnegative();

export const RuntimeHeadroomV1Schema = z
  .object({
    schema: z.literal(RUNTIME_HEADROOM_V1_SCHEMA),
    gpuFreeBytes: bytes,
    gpuTotalBytes: bytes,
    /**
     * Where the GPU numbers came from. Names match `GpuTelemetrySource` in `gpu/gpu-residency-budget.ts`
     * (the existing `GpuMemoryTelemetryV1` shares this GPU slice) plus `nvidia-smi`. Only `nvml` and
    * `nvidia-smi` (both measured outside the CUDA process) are admission-grade.
     */
    gpuMemorySource: z.enum(['nvml', 'nvidia-smi', 'cuda-runtime', 'rapids-sidecar-cupy', 'unavailable'] as const satisfies readonly GpuTelemetrySource[]),
    ramFreeBytes: bytes,
    valkeyUsedBytes: bytes,
    valkeyMaxBytes: bytes.nullable(),
    activeModelRevision: z.string().min(1).nullable(),
    producerRevision: z.string().min(1),
    /** ISO-8601 instant of the measurement. */
    observedAt: z.string().refine((value) => !Number.isNaN(Date.parse(value)), 'observedAt must be an ISO-8601 instant'),
    maxAgeMs: z.number().int().positive(),
    canonicalAuthority: z.literal(false),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.gpuFreeBytes > value.gpuTotalBytes) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['gpuFreeBytes'], message: 'free GPU bytes cannot exceed total' });
    }
    if (value.valkeyMaxBytes !== null && value.valkeyUsedBytes > value.valkeyMaxBytes) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['valkeyUsedBytes'], message: 'Valkey used bytes cannot exceed its max' });
    }
  });

export type RuntimeHeadroomV1 = z.infer<typeof RuntimeHeadroomV1Schema>;

export function buildRuntimeHeadroomV1(input: Omit<RuntimeHeadroomV1, 'schema' | 'canonicalAuthority'>): RuntimeHeadroomV1 {
  return RuntimeHeadroomV1Schema.parse({ ...input, schema: RUNTIME_HEADROOM_V1_SCHEMA, canonicalAuthority: false });
}

/** A sample older than `maxAgeMs` (or dated in the future) is treated as ABSENT, never as "last known good". */
export function isRuntimeHeadroomFreshV1(headroom: RuntimeHeadroomV1, nowMs: number): boolean {
  const age = nowMs - Date.parse(headroom.observedAt);
  return age >= 0 && age <= headroom.maxAgeMs;
}

/**
 * Free VRAM a budget/admission step may rely on, or `null` when the sample is stale or its source is not
 * admission-grade. Callers must treat `null` as "unknown, do not admit", not as zero and not as a default.
 */
export function admissionGradeFreeVramBytesV1(headroom: RuntimeHeadroomV1, nowMs: number): number | null {
  if (!isRuntimeHeadroomFreshV1(headroom, nowMs)) return null;
  if (!isAdmissionGradeGpuTelemetrySourceV1(headroom.gpuMemorySource)) return null;
  return headroom.gpuFreeBytes;
}

/**
 * Compose a combined snapshot FROM a validated GPU observation. `observedAt` is the OLDEST of the GPU
 * capture time and the RAM/Valkey observation time, so freshness is bounded by the stalest component.
 */
export function buildRuntimeHeadroomV1FromGpuTelemetry(input: {
  gpu: GpuMemoryTelemetryV1;
  ramFreeBytes: number;
  valkeyUsedBytes: number;
  valkeyMaxBytes: number | null;
  activeModelRevision: string | null;
  producerRevision: string;
  maxAgeMs: number;
  /** ISO-8601 instant at which the RAM / Valkey figures were observed. */
  hostObservedAt: string;
}): RuntimeHeadroomV1 {
  const gpuAt = Date.parse(input.gpu.capturedAt);
  const hostAt = Date.parse(input.hostObservedAt);
  const observedAt = Number.isNaN(gpuAt) || Number.isNaN(hostAt) ? input.gpu.capturedAt : new Date(Math.min(gpuAt, hostAt)).toISOString();
  return buildRuntimeHeadroomV1({
    gpuFreeBytes: input.gpu.freeVramBytes,
    gpuTotalBytes: input.gpu.totalVramBytes,
    gpuMemorySource: input.gpu.source,
    ramFreeBytes: input.ramFreeBytes,
    valkeyUsedBytes: input.valkeyUsedBytes,
    valkeyMaxBytes: input.valkeyMaxBytes,
    activeModelRevision: input.activeModelRevision,
    producerRevision: input.producerRevision,
    observedAt,
    maxAgeMs: input.maxAgeMs,
  });
}
