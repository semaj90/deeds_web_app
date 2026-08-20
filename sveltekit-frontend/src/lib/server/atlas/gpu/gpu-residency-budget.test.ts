import { describe, expect, it } from 'vitest';
import { planGpuResidencyV1, mibToBytes } from './gpu-residency-budget';

function telemetry(freeMiB: number, totalMiB = 8192) {
  return {
    schema: 'atlas.gpu-memory-telemetry.v1' as const,
    source: 'rapids-sidecar-cupy' as const,
    capturedAt: '2026-08-19T00:00:00.000Z',
    totalVramBytes: mibToBytes(totalMiB),
    freeVramBytes: mibToBytes(freeMiB),
    usedVramBytes: mibToBytes(totalMiB - freeMiB),
    deviceName: 'NVIDIA GeForce RTX 3060 Ti',
  };
}

describe('GpuResidencyBudgetV1', () => {
  it('admits bucket 512 with enough measured headroom', () => {
    const plan = planGpuResidencyV1(telemetry(2048), 500);
    expect(plan.executionTarget).toBe('gpu');
    expect(plan.requestedCandidateBucket).toBe(512);
    expect(plan.maxCandidateBucket).toBe(512);
    expect(plan.degraded).toBe(false);
  });

  it('down-buckets 512 to 128 under pressure', () => {
    // 900 MiB free - 256 MiB safety = 644 MiB leaseable.
    const plan = planGpuResidencyV1(telemetry(900), 500);
    expect(plan.executionTarget).toBe('gpu');
    expect(plan.maxCandidateBucket).toBe(128);
    expect(plan.degraded).toBe(true);
  });

  it('falls back to Qdrant before attempting CUDA below the 32-row lease floor', () => {
    const plan = planGpuResidencyV1(telemetry(500), 128);
    expect(plan.executionTarget).toBe('qdrant');
    expect(plan.maxCandidateBucket).toBeNull();
    expect(plan.degraded).toBe(true);
  });

  it('fails over when telemetry is unavailable', () => {
    const plan = planGpuResidencyV1(null, 128);
    expect(plan.executionTarget).toBe('qdrant');
    expect(plan.leaseableBytes).toBe(0);
  });
});
