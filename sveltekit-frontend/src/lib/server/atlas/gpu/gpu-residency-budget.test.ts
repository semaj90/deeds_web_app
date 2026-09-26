import { describe, expect, it } from 'vitest';
import { admitGpuExecutionLeaseV1, planGpuResidencyV1, mibToBytes } from './gpu-residency-budget';

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

  it('uses the shared budget owner for explicit cross-executor lease decisions', () => {
    const budget = planGpuResidencyV1(telemetry(2048), 128);
    const lease = admitGpuExecutionLeaseV1({
      budget,
      budgetRevision: 'gpu-budget:r1',
      leaseId: 'lease:shared:r1',
      leaseEpoch: 1,
      executor: 'pytorch_cuda',
      requestedBytes: mibToBytes(512),
      activeReservedBytes: mibToBytes(100),
    });
    expect(lease.admission).toBe('ALLOW');
    expect(lease.canonicalAuthority).toBe(false);
    expect(lease.writesPerformed).toBe(false);
  });

  it('fails closed before allocation when active reservations exceed the budget', () => {
    const budget = planGpuResidencyV1(telemetry(900), 512);
    const lease = admitGpuExecutionLeaseV1({
      budget,
      budgetRevision: 'gpu-budget:r1',
      leaseId: 'lease:shared:over-budget',
      leaseEpoch: 1,
      executor: 'tensorrt_rtx',
      requestedBytes: mibToBytes(256),
      activeReservedBytes: budget.leaseableBytes,
    });
    expect(lease.admission).toBe('GPU_RESIDENCY_BUDGET_EXCEEDED');
    expect(lease.availableBytes).toBe(0);
  });

  it('applies the same pre-allocation budget decision to every registered executor', () => {
    const budget = planGpuResidencyV1(telemetry(900), 512);
    const executors = ['pytorch_cuda', 'cuvs', 'tensorrt_rtx', 'directml', 'webgpu', 'llm_runtime'] as const;
    const admissions = executors.map((executor) => admitGpuExecutionLeaseV1({
      budget,
      budgetRevision: 'gpu-budget:matrix-r1',
      leaseId: `lease:matrix:${executor}`,
      leaseEpoch: 1,
      executor,
      requestedBytes: mibToBytes(256),
      activeReservedBytes: budget.leaseableBytes,
    }));

    expect(admissions.map((lease) => lease.admission)).toEqual(
      executors.map(() => 'GPU_RESIDENCY_BUDGET_EXCEEDED'),
    );
    expect(admissions.every((lease) => lease.canonicalAuthority === false && lease.writesPerformed === false)).toBe(true);
  });
});
