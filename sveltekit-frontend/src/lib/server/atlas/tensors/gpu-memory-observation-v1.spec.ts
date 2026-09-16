import { describe, expect, it } from 'vitest';

import { decideGpuMemoryAdmissionV1 } from './gpu-memory-admission-v1';
import { buildGpuMemoryObservationV1, gpuMemoryObservationV1Schema, toAdmissionInputFields } from './gpu-memory-observation-v1';

describe('gpu memory observation v1', () => {
  it('builds a valid observation with at least one reading', () => {
    const observation = buildGpuMemoryObservationV1({
      schema: 'atlas.gpu-memory-observation.v1',
      observedAt: '2026-09-14T13:00:00.000Z',
      deviceFreeObserved: { value: 200_000_000, source: 'nvidia-smi' },
      wddmBudget: null,
      wddmCurrentUsage: null,
      cudaContextFree: { value: 6_000_000_000, source: 'cuda-context' },
      writesPerformed: false,
    });
    expect(observation.deviceFreeObserved?.value).toBe(200_000_000);
  });

  it('rejects an observation with zero readings -- not useful evidence', () => {
    expect(() =>
      buildGpuMemoryObservationV1({
        schema: 'atlas.gpu-memory-observation.v1',
        observedAt: '2026-09-14T13:00:00.000Z',
        deviceFreeObserved: null,
        wddmBudget: null,
        wddmCurrentUsage: null,
        cudaContextFree: null,
        writesPerformed: false,
      }),
    ).toThrow();
  });

  it('flags a WDDM budget/usage source mismatch', () => {
    const result = gpuMemoryObservationV1Schema.safeParse({
      schema: 'atlas.gpu-memory-observation.v1',
      observedAt: '2026-09-14T13:00:00.000Z',
      deviceFreeObserved: null,
      wddmBudget: { value: 6_000_000_000, source: 'wddm' },
      wddmCurrentUsage: { value: 5_000_000_000, source: 'nvidia-smi' },
      cudaContextFree: null,
      writesPerformed: false,
    });
    expect(result.success).toBe(false);
  });

  it('rejects a negative or non-safe-integer reading value', () => {
    expect(() =>
      buildGpuMemoryObservationV1({
        schema: 'atlas.gpu-memory-observation.v1',
        observedAt: '2026-09-14T13:00:00.000Z',
        deviceFreeObserved: { value: -1, source: 'nvidia-smi' },
        wddmBudget: null,
        wddmCurrentUsage: null,
        cudaContextFree: null,
        writesPerformed: false,
      }),
    ).toThrow();
  });

  it('feeds directly into decideGpuMemoryAdmissionV1() with no lossy transform', () => {
    const observation = buildGpuMemoryObservationV1({
      schema: 'atlas.gpu-memory-observation.v1',
      observedAt: '2026-09-14T13:00:00.000Z',
      deviceFreeObserved: { value: 4_000_000_000, source: 'nvidia-smi' },
      wddmBudget: null,
      wddmCurrentUsage: null,
      cudaContextFree: null,
      writesPerformed: false,
    });
    const fields = toAdmissionInputFields(observation);
    const decision = decideGpuMemoryAdmissionV1({
      ...fields,
      requestedBytes: 100_000_000,
      decoderActive: false,
    });
    expect(decision.decision).toBe('ADMIT');
    expect(decision.deviceFreeObserved).toBe(4_000_000_000);
  });

  it('maps an all-null observation input to all-null admission fields', () => {
    const fields = toAdmissionInputFields({
      schema: 'atlas.gpu-memory-observation.v1',
      observedAt: '2026-09-14T13:00:00.000Z',
      deviceFreeObserved: null,
      wddmBudget: null,
      wddmCurrentUsage: null,
      cudaContextFree: null,
      deviceLabel: null,
      writesPerformed: false,
    });
    expect(fields).toEqual({
      deviceFreeObserved: null,
      wddmBudget: null,
      wddmCurrentUsage: null,
      cudaContextFree: null,
    });
  });
});
