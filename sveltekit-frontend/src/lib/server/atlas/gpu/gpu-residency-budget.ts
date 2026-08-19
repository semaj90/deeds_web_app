import {
  atlasCandidateBuckets,
  chooseCandidateBucket,
  type AtlasCandidateBucket,
} from '$lib/server/atlas/graph/graph-runtime-contracts.js';

const MIB = 1024 * 1024;
const SEMANTIC_DIMENSION = 768;

export type GpuTelemetrySource = 'rapids-sidecar-cupy' | 'cuda-runtime' | 'nvml' | 'unavailable';

export interface GpuMemoryTelemetryV1 {
  schema: 'atlas.gpu-memory-telemetry.v1';
  source: GpuTelemetrySource;
  capturedAt: string;
  totalVramBytes: number;
  freeVramBytes: number;
  usedVramBytes: number;
  reservedVramBytes?: number;
  deviceName?: string | null;
}

export interface GpuResidencyPolicyV1 {
  schema: 'atlas.gpu-residency-policy.v1';
  safetyBytes: number;
  modelReservedBytes: number;
  kvReservedBytes: number;
  graphReservedBytes: number;
  semanticReservedBytes: number;
  workspaceReservedBytes: number;
  semanticCacheFraction: number;
  semanticVectorBytes: number;
  minimumLeaseBytesByBucket: Record<AtlasCandidateBucket, number>;
}

export interface GpuResidencyBudgetV1 {
  schema: 'atlas.gpu-residency-budget.v1';
  telemetry: GpuMemoryTelemetryV1 | null;
  policy: GpuResidencyPolicyV1;
  requestedCandidateCount: number;
  requestedCandidateBucket: AtlasCandidateBucket;
  totalReservedBytes: number;
  leaseableBytes: number;
  semanticCacheBudgetBytes: number;
  maxResidentVectors: number;
  maxCandidateBucket: AtlasCandidateBucket | null;
  executionTarget: 'gpu' | 'qdrant';
  degraded: boolean;
  reason: string;
}

/**
 * Conservative RTX 3060 Ti defaults. The bucket thresholds intentionally include
 * cuVS/cuGraph/RMM/CUDA allocator headroom, not just the tiny candidate matrix.
 * They are policy values and should be tuned from runtime receipts, never treated
 * as hardware constants.
 */
export const DEFAULT_GPU_RESIDENCY_POLICY_V1: GpuResidencyPolicyV1 = {
  schema: 'atlas.gpu-residency-policy.v1',
  safetyBytes: 256 * MIB,
  modelReservedBytes: 0,
  kvReservedBytes: 0,
  graphReservedBytes: 0,
  semanticReservedBytes: 0,
  workspaceReservedBytes: 0,
  semanticCacheFraction: 0.5,
  semanticVectorBytes: SEMANTIC_DIMENSION * 2, // FP16 resident search cache
  minimumLeaseBytesByBucket: {
    32: 384 * MIB,
    64: 512 * MIB,
    128: 640 * MIB,
    256: 768 * MIB,
    512: 1024 * MIB,
  },
};

function finiteNonNegative(value: number | undefined, fallback = 0): number {
  return Number.isFinite(value) ? Math.max(0, Math.trunc(value as number)) : fallback;
}

export function mergeGpuResidencyPolicyV1(
  overrides: Partial<Omit<GpuResidencyPolicyV1, 'schema' | 'minimumLeaseBytesByBucket'>> & {
    minimumLeaseBytesByBucket?: Partial<Record<AtlasCandidateBucket, number>>;
  } = {},
): GpuResidencyPolicyV1 {
  const base = DEFAULT_GPU_RESIDENCY_POLICY_V1;
  const fraction = Number.isFinite(overrides.semanticCacheFraction)
    ? Math.max(0, Math.min(1, overrides.semanticCacheFraction as number))
    : base.semanticCacheFraction;

  return {
    schema: 'atlas.gpu-residency-policy.v1',
    safetyBytes: finiteNonNegative(overrides.safetyBytes, base.safetyBytes),
    modelReservedBytes: finiteNonNegative(overrides.modelReservedBytes, base.modelReservedBytes),
    kvReservedBytes: finiteNonNegative(overrides.kvReservedBytes, base.kvReservedBytes),
    graphReservedBytes: finiteNonNegative(overrides.graphReservedBytes, base.graphReservedBytes),
    semanticReservedBytes: finiteNonNegative(overrides.semanticReservedBytes, base.semanticReservedBytes),
    workspaceReservedBytes: finiteNonNegative(overrides.workspaceReservedBytes, base.workspaceReservedBytes),
    semanticCacheFraction: fraction,
    semanticVectorBytes: Math.max(1, finiteNonNegative(overrides.semanticVectorBytes, base.semanticVectorBytes)),
    minimumLeaseBytesByBucket: Object.fromEntries(
      atlasCandidateBuckets.map((bucket) => [
        bucket,
        finiteNonNegative(overrides.minimumLeaseBytesByBucket?.[bucket], base.minimumLeaseBytesByBucket[bucket]),
      ]),
    ) as Record<AtlasCandidateBucket, number>,
  };
}

export function planGpuResidencyV1(
  telemetry: GpuMemoryTelemetryV1 | null,
  requestedCandidateCount: number,
  overrides: Parameters<typeof mergeGpuResidencyPolicyV1>[0] = {},
): GpuResidencyBudgetV1 {
  const policy = mergeGpuResidencyPolicyV1(overrides);
  const requestedCandidateBucket = chooseCandidateBucket(requestedCandidateCount);
  const totalReservedBytes =
    policy.modelReservedBytes +
    policy.kvReservedBytes +
    policy.graphReservedBytes +
    policy.semanticReservedBytes +
    policy.workspaceReservedBytes;

  if (!telemetry || telemetry.source === 'unavailable') {
    return {
      schema: 'atlas.gpu-residency-budget.v1',
      telemetry,
      policy,
      requestedCandidateCount,
      requestedCandidateBucket,
      totalReservedBytes,
      leaseableBytes: 0,
      semanticCacheBudgetBytes: 0,
      maxResidentVectors: 0,
      maxCandidateBucket: null,
      executionTarget: 'qdrant',
      degraded: true,
      reason: 'GPU telemetry unavailable; fail over before allocating CUDA work.',
    };
  }

  // observed free is authoritative for current pressure; the total-based bound
  // also preserves explicit future reservations (model/KV/graph/etc.).
  const freeAfterSafety = Math.max(0, telemetry.freeVramBytes - policy.safetyBytes);
  const uncommittedFromTotal = Math.max(
    0,
    telemetry.totalVramBytes - totalReservedBytes - policy.safetyBytes,
  );
  const leaseableBytes = Math.min(freeAfterSafety, uncommittedFromTotal);

  const eligibleBuckets = atlasCandidateBuckets.filter(
    (bucket) =>
      bucket <= requestedCandidateBucket &&
      leaseableBytes >= policy.minimumLeaseBytesByBucket[bucket],
  );
  const maxCandidateBucket = eligibleBuckets.at(-1) ?? null;

  const semanticCacheBudgetBytes = Math.floor(
    Math.max(policy.semanticReservedBytes, leaseableBytes * policy.semanticCacheFraction),
  );
  const maxResidentVectors = Math.floor(semanticCacheBudgetBytes / policy.semanticVectorBytes);

  if (maxCandidateBucket === null) {
    return {
      schema: 'atlas.gpu-residency-budget.v1',
      telemetry,
      policy,
      requestedCandidateCount,
      requestedCandidateBucket,
      totalReservedBytes,
      leaseableBytes,
      semanticCacheBudgetBytes,
      maxResidentVectors,
      maxCandidateBucket: null,
      executionTarget: 'qdrant',
      degraded: true,
      reason: `GPU headroom ${Math.floor(leaseableBytes / MIB)} MiB is below the minimum 32-candidate lease.`,
    };
  }

  return {
    schema: 'atlas.gpu-residency-budget.v1',
    telemetry,
    policy,
    requestedCandidateCount,
    requestedCandidateBucket,
    totalReservedBytes,
    leaseableBytes,
    semanticCacheBudgetBytes,
    maxResidentVectors,
    maxCandidateBucket,
    executionTarget: 'gpu',
    degraded: maxCandidateBucket < requestedCandidateBucket,
    reason:
      maxCandidateBucket < requestedCandidateBucket
        ? `GPU pressure reduced bucket ${requestedCandidateBucket} -> ${maxCandidateBucket}; prefilter before CUDA scoring.`
        : `GPU lease admits requested bucket ${requestedCandidateBucket}.`,
  };
}

export function mibToBytes(mib: number): number {
  return Math.max(0, mib) * MIB;
}
