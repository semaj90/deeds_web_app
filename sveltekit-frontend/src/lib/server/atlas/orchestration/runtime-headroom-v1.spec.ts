import { describe, expect, it } from 'vitest';
import {
  RuntimeHeadroomV1Schema,
  admissionGradeFreeVramBytesV1,
  buildRuntimeHeadroomV1,
  buildRuntimeHeadroomV1FromGpuTelemetry,
  isRuntimeHeadroomFreshV1,
} from './runtime-headroom-v1.js';

const GIB = 1024 ** 3;
const observedAt = '2026-10-03T12:00:00.000Z';
const now = Date.parse(observedAt);
const sample = {
  gpuFreeBytes: 2 * GIB,
  gpuTotalBytes: 8 * GIB,
  gpuMemorySource: 'nvidia-smi' as const,
  ramFreeBytes: 8 * GIB,
  valkeyUsedBytes: 100,
  valkeyMaxBytes: null,
  activeModelRevision: 'ornith-1.5-9b',
  producerRevision: 'headroom-probe:v1',
  observedAt,
  maxAgeMs: 5_000,
};

describe('HEADROOM-V2-01 RuntimeHeadroomV1', () => {
  it('builds with canonicalAuthority false and the schema tag', () => {
    const built = buildRuntimeHeadroomV1(sample);
    expect(built).toMatchObject({ schema: 'atlas.runtime-headroom.v1', canonicalAuthority: false });
  });

  it('rejects impossible samples', () => {
    expect(() => buildRuntimeHeadroomV1({ ...sample, gpuFreeBytes: 9 * GIB })).toThrow();
    expect(() => buildRuntimeHeadroomV1({ ...sample, valkeyUsedBytes: 10, valkeyMaxBytes: 5 })).toThrow();
    expect(() => buildRuntimeHeadroomV1({ ...sample, observedAt: 'yesterday' })).toThrow();
    expect(() => buildRuntimeHeadroomV1({ ...sample, maxAgeMs: 0 })).toThrow();
  });

  it('is strict and cannot claim canonical authority', () => {
    const built = buildRuntimeHeadroomV1(sample);
    expect(() => RuntimeHeadroomV1Schema.parse({ ...built, canonicalAuthority: true })).toThrow();
    expect(() => RuntimeHeadroomV1Schema.parse({ ...built, packet_key: 'packet:abc' })).toThrow();
  });

  it('treats a stale or future-dated sample as absent', () => {
    const built = buildRuntimeHeadroomV1(sample);
    expect(isRuntimeHeadroomFreshV1(built, now + 5_000)).toBe(true);
    expect(isRuntimeHeadroomFreshV1(built, now + 5_001)).toBe(false);
    expect(isRuntimeHeadroomFreshV1(built, now - 1)).toBe(false);
  });

  it('gives admission-grade free VRAM only for a fresh nvidia-smi/NVML sample', () => {
    expect(admissionGradeFreeVramBytesV1(buildRuntimeHeadroomV1(sample), now + 1_000)).toBe(2 * GIB);
    expect(admissionGradeFreeVramBytesV1(buildRuntimeHeadroomV1({ ...sample, gpuMemorySource: 'nvml' }), now)).toBe(2 * GIB);
    expect(admissionGradeFreeVramBytesV1(buildRuntimeHeadroomV1(sample), now + 60_000)).toBeNull();
  });

  it('never trusts cudaMemGetInfo-class sources for admission (WDDM budget overstated free VRAM ~20x here)', () => {
    for (const gpuMemorySource of ['cuda-runtime', 'rapids-sidecar-cupy', 'unavailable'] as const) {
      expect(admissionGradeFreeVramBytesV1(buildRuntimeHeadroomV1({ ...sample, gpuMemorySource }), now)).toBeNull();
    }
  });
});

describe('buildRuntimeHeadroomV1FromGpuTelemetry (HEADROOM-V2-03 ownership direction)', () => {
  const gpu = {
    schema: 'atlas.gpu-memory-telemetry.v1' as const,
    source: 'nvidia-smi' as const,
    capturedAt: '2026-10-03T12:00:05.000Z',
    totalVramBytes: 8 * GIB,
    freeVramBytes: 2 * GIB,
    usedVramBytes: 6 * GIB,
    deviceName: 'GPU',
  };
  const host = {
    ramFreeBytes: 8 * GIB,
    valkeyUsedBytes: 10,
    valkeyMaxBytes: null,
    activeModelRevision: 'ornith-1.5-9b',
    producerRevision: 'headroom-probe:v1',
    maxAgeMs: 10_000,
  };

  it('takes the GPU fields and source from the telemetry, not from the caller', () => {
    const built = buildRuntimeHeadroomV1FromGpuTelemetry({ ...host, gpu, hostObservedAt: '2026-10-03T12:00:06.000Z' });
    expect(built).toMatchObject({ gpuFreeBytes: 2 * GIB, gpuTotalBytes: 8 * GIB, gpuMemorySource: 'nvidia-smi', canonicalAuthority: false });
  });

  it('observedAt is the oldest component, so freshness is bounded by the stalest part', () => {
    const older = buildRuntimeHeadroomV1FromGpuTelemetry({ ...host, gpu, hostObservedAt: '2026-10-03T12:00:00.000Z' });
    expect(older.observedAt).toBe('2026-10-03T12:00:00.000Z');
    const gpuOlder = buildRuntimeHeadroomV1FromGpuTelemetry({ ...host, gpu, hostObservedAt: '2026-10-03T12:00:09.000Z' });
    expect(gpuOlder.observedAt).toBe('2026-10-03T12:00:05.000Z');
  });

  it('a CuPy-sourced telemetry still builds but yields no admission-grade VRAM', () => {
    const built = buildRuntimeHeadroomV1FromGpuTelemetry({ ...host, gpu: { ...gpu, source: 'rapids-sidecar-cupy' }, hostObservedAt: gpu.capturedAt });
    expect(admissionGradeFreeVramBytesV1(built, Date.parse(gpu.capturedAt))).toBeNull();
  });
});
