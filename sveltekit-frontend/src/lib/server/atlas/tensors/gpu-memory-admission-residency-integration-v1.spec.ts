import { describe, expect, it } from 'vitest';

import { admitWithGpuMemoryAdmissionCheck, decideGpuMemoryAdmissionV1 } from './gpu-memory-admission-v1';
import { UnifiedResidencyAdapter, type UnifiedResidencyDescriptor } from './unified-residency-adapter-v1';

/**
 * BITFROST-GPU-MEMORY-ADMISSION-01 (stage F: integration).
 *
 * Proves the composition prescribed in gpu-memory-admission-v1.ts's own
 * header comment: decideGpuMemoryAdmissionV1() runs first as pure evidence,
 * admitWithGpuMemoryAdmissionCheck() only calls UnifiedResidencyAdapter.admit()
 * when the decision permits it, and admit()'s own signature/internal budget
 * check are untouched (this is an ordering guard placed in front of admit(),
 * not a rewrite of it).
 */
function buildDescriptor(byteLength: number): UnifiedResidencyDescriptor {
  return {
    schema: 'atlas.unified-residency.v1',
    residencyKey: `test:${byteLength}`,
    kind: 'FEATURE_TILE',
    workspaceRevision: 'ws-1',
    sourceRevision: 'src-1',
    representationRevision: 'rep-1',
    featureRevision: 'feat-1',
    modelRevision: 'model-1',
    tokenizerRevision: 'tok-1',
    ropeRevision: 'rope-1',
    candidateOrdinal: 0,
    artifactChecksum: 'checksum-1',
    shape: [1, byteLength / 4],
    dtype: 'float32',
    byteLength,
    state: 'EMPTY',
  };
}

describe('admitWithGpuMemoryAdmissionCheck (stage F)', () => {
  it('admits into the adapter when the decision is ADMIT', () => {
    const adapter = new UnifiedResidencyAdapter();
    const descriptor = buildDescriptor(1_000_000);
    const decision = decideGpuMemoryAdmissionV1({
      deviceFreeObserved: 4_000_000_000,
      wddmBudget: null,
      wddmCurrentUsage: null,
      cudaContextFree: null,
      requestedBytes: 1_000_000,
      decoderActive: false,
    });
    expect(decision.decision).toBe('ADMIT');

    admitWithGpuMemoryAdmissionCheck(adapter, descriptor, decision);

    expect(adapter.usedBytes()).toBe(1_000_000);
  });

  it('refuses to mutate the adapter when the decision is REJECT -- throws before calling admit()', () => {
    const adapter = new UnifiedResidencyAdapter();
    const descriptor = buildDescriptor(2_000_000_000);
    const decision = decideGpuMemoryAdmissionV1({
      deviceFreeObserved: 100_000_000,
      wddmBudget: null,
      wddmCurrentUsage: null,
      cudaContextFree: null,
      requestedBytes: 2_000_000_000,
      decoderActive: false,
    });
    expect(decision.decision).toBe('REJECT');

    expect(() => admitWithGpuMemoryAdmissionCheck(adapter, descriptor, decision)).toThrow(/GPU_MEMORY_ADMISSION_REFUSED_REJECT/);
    expect(adapter.usedBytes()).toBe(0);
  });

  it('refuses to mutate the adapter when the decision is DEFER -- unknown evidence never silently proceeds', () => {
    const adapter = new UnifiedResidencyAdapter();
    const descriptor = buildDescriptor(1_000_000);
    const decision = decideGpuMemoryAdmissionV1({
      deviceFreeObserved: null,
      wddmBudget: null,
      wddmCurrentUsage: null,
      cudaContextFree: null,
      requestedBytes: 1_000_000,
      decoderActive: false,
    });
    expect(decision.decision).toBe('DEFER');

    expect(() => admitWithGpuMemoryAdmissionCheck(adapter, descriptor, decision)).toThrow(/GPU_MEMORY_ADMISSION_REFUSED_DEFER/);
    expect(adapter.usedBytes()).toBe(0);
  });

  it('admits on EVICT_THEN_ADMIT -- asserts eviction already happened, does not evict itself', () => {
    const adapter = new UnifiedResidencyAdapter();
    const descriptor = buildDescriptor(500_000_000);
    const decision = decideGpuMemoryAdmissionV1({
      deviceFreeObserved: 300_000_000,
      wddmBudget: null,
      wddmCurrentUsage: null,
      cudaContextFree: null,
      requestedBytes: 500_000_000,
      decoderActive: false,
      evictableBytes: 400_000_000,
    });
    expect(decision.decision).toBe('EVICT_THEN_ADMIT');

    // No eviction actually happens inside admitWithGpuMemoryAdmissionCheck --
    // this call succeeds purely because the caller asserted (via the
    // decision it supplied) that eviction already occurred. admit()'s own
    // internal budget check (against this fresh, empty adapter) independently
    // has room for 500MB regardless, so this also confirms the wrapper
    // performs no double-accounting against admit()'s own check.
    admitWithGpuMemoryAdmissionCheck(adapter, descriptor, decision);
    expect(adapter.usedBytes()).toBe(500_000_000);
  });
});
