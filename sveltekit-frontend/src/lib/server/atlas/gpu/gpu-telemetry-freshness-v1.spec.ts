import { describe, expect, it } from 'vitest';
import {
  admitGpuExecutionLeaseV1,
  gpuTelemetryAgeStatusV1,
  mibToBytes,
  planGpuResidencyV1,
  type GpuMemoryTelemetryV1,
} from './gpu-residency-budget';
import { createNvidiaSmiMemoryClient } from './nvidia-smi-memory-client';

const capturedAt = '2026-10-03T12:00:00.000Z';
const t0 = Date.parse(capturedAt);

function telemetry(freeMiB: number, overrides: Partial<GpuMemoryTelemetryV1> = {}): GpuMemoryTelemetryV1 {
  return {
    schema: 'atlas.gpu-memory-telemetry.v1',
    source: 'rapids-sidecar-cupy',
    capturedAt,
    totalVramBytes: mibToBytes(8192),
    freeVramBytes: mibToBytes(freeMiB),
    usedVramBytes: mibToBytes(8192 - freeMiB),
    deviceName: 'NVIDIA GeForce RTX 3060 Ti',
    ...overrides,
  };
}

describe('HEADROOM-V2-02 gpuTelemetryAgeStatusV1', () => {
  const window = (offsetMs: number) => ({ nowMs: t0 + offsetMs, maxAgeMs: 5_000 });

  it('is FRESH inside the window, STALE past it or in the future', () => {
    expect(gpuTelemetryAgeStatusV1(telemetry(2048), window(0))).toBe('FRESH');
    expect(gpuTelemetryAgeStatusV1(telemetry(2048), window(5_000))).toBe('FRESH');
    expect(gpuTelemetryAgeStatusV1(telemetry(2048), window(5_001))).toBe('STALE');
    expect(gpuTelemetryAgeStatusV1(telemetry(2048), window(-1))).toBe('STALE');
  });

  it('flags an unparseable capturedAt', () => {
    expect(gpuTelemetryAgeStatusV1(telemetry(2048, { capturedAt: 'not-a-date' }), window(0))).toBe('INVALID_TIMESTAMP');
  });
});

describe('planGpuResidencyV1 freshness (opt-in)', () => {
  it('without a freshness window the old behaviour is unchanged (old timestamps still plan)', () => {
    const plan = planGpuResidencyV1(telemetry(2048, { capturedAt: '2020-01-01T00:00:00.000Z' }), 500);
    expect(plan.degraded).toBe(false);
    expect(plan.executionTarget).not.toBe('qdrant');
  });

  it('a fresh sample plans normally with a window', () => {
    const plan = planGpuResidencyV1(telemetry(2048), 500, {}, { nowMs: t0 + 1_000, maxAgeMs: 5_000 });
    expect(plan.degraded).toBe(false);
  });

  it('a stale sample fails over to Qdrant and records why', () => {
    const plan = planGpuResidencyV1(telemetry(2048), 500, {}, { nowMs: t0 + 60_000, maxAgeMs: 5_000 });
    expect(plan).toMatchObject({ degraded: true, executionTarget: 'qdrant', telemetry: null, leaseableBytes: 0 });
    expect(plan.reason).toContain('stale');
  });

  it('an invalid timestamp also fails over', () => {
    const plan = planGpuResidencyV1(telemetry(2048, { capturedAt: 'nope' }), 500, {}, { nowMs: t0, maxAgeMs: 5_000 });
    expect(plan).toMatchObject({ degraded: true, executionTarget: 'qdrant' });
    expect(plan.reason).toContain('invalid timestamp');
  });

  it('a stale budget admits no GPU lease while a fresh one does', () => {
    const lease = (nowMs: number) =>
      admitGpuExecutionLeaseV1({
        budget: planGpuResidencyV1(telemetry(2048), 128, {}, { nowMs, maxAgeMs: 5_000 }),
        budgetRevision: 'gpu-budget:r1',
        leaseId: 'lease:fresh-test:r1',
        leaseEpoch: 1,
        executor: 'pytorch_cuda',
        requestedBytes: mibToBytes(512),
        activeReservedBytes: mibToBytes(100),
      });
    expect(lease(t0 + 1_000).admission).toBe('ALLOW');
    expect(lease(t0 + 60_000).admission).not.toBe('ALLOW');
  });
});

describe('HEADROOM-V2-03 source grade + 10 s boundary (nvidia-smi path)', () => {
  const MAX_AGE = 10_000;
  const smi = (overrides: Partial<GpuMemoryTelemetryV1> = {}) => telemetry(2048, { source: 'nvidia-smi', ...overrides });
  const plan = (t: GpuMemoryTelemetryV1 | null, ageMs: number) =>
    planGpuResidencyV1(t, 500, {}, { nowMs: t0 + ageMs, maxAgeMs: MAX_AGE, requireAdmissionGradeSource: true });

  it('age 9,999 ms is usable; 10,001 ms is absent; a future timestamp is absent', () => {
    expect(plan(smi(), 9_999).degraded).toBe(false);
    const stale = plan(smi(), 10_001);
    expect(stale).toMatchObject({ degraded: true, executionTarget: 'qdrant', telemetry: null });
    expect(stale.reason).toContain('stale');
    expect(plan(smi(), -1)).toMatchObject({ degraded: true, executionTarget: 'qdrant' });
  });

  it('missing sample falls back to Qdrant', () => {
    expect(plan(null, 0)).toMatchObject({ degraded: true, executionTarget: 'qdrant', leaseableBytes: 0 });
  });

  it('nvidia-smi and nvml are admission-grade', () => {
    expect(plan(smi(), 0).degraded).toBe(false);
    expect(plan(smi({ source: 'nvml' }), 0).degraded).toBe(false);
  });

  it('cuda-runtime and rapids-sidecar-cupy are diagnostic only: rejected even when fresh, with a reason', () => {
    for (const source of ['cuda-runtime', 'rapids-sidecar-cupy'] as const) {
      const result = plan(smi({ source }), 0);
      expect(result).toMatchObject({ degraded: true, executionTarget: 'qdrant', telemetry: null, leaseableBytes: 0 });
      expect(result.reason).toContain('diagnostic only');
    }
  });

  it('the source-grade rule is opt-in: without the flag a fresh CuPy reading still plans (old behaviour)', () => {
    const result = planGpuResidencyV1(smi({ source: 'rapids-sidecar-cupy' }), 500, {}, { nowMs: t0, maxAgeMs: MAX_AGE });
    expect(result.degraded).toBe(false);
  });

  it('end to end: nvidia-smi sample -> plan -> lease ALLOW; failure or staleness -> no GPU lease', async () => {
    const lease = (budget: ReturnType<typeof planGpuResidencyV1>) =>
      admitGpuExecutionLeaseV1({
        budget,
        budgetRevision: 'gpu-budget:r2',
        leaseId: 'lease:smi:r1',
        leaseEpoch: 1,
        executor: 'pytorch_cuda',
        requestedBytes: mibToBytes(512),
        activeReservedBytes: mibToBytes(100),
      }).admission;
    const okClient = createNvidiaSmiMemoryClient({ exec: async () => '2048, 8192, 6000, Test GPU', now: () => new Date(t0) });
    const sample = await okClient.readTelemetry();
    const opts = (ageMs: number) => ({ nowMs: t0 + ageMs, maxAgeMs: MAX_AGE, requireAdmissionGradeSource: true });
    expect(lease(planGpuResidencyV1(sample, 128, {}, opts(500)))).toBe('ALLOW');
    expect(lease(planGpuResidencyV1(sample, 128, {}, opts(10_001)))).not.toBe('ALLOW');
    const failing = createNvidiaSmiMemoryClient({ exec: async () => { throw new Error('boom'); } });
    expect(lease(planGpuResidencyV1(await failing.readTelemetry(), 128, {}, opts(0)))).not.toBe('ALLOW');
  });
});
