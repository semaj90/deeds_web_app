import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  DEFAULT_DECODER_RESERVE_BYTES,
  MIN_SAFE_ALLOWANCE_BYTES,
  decideGpuMemoryAdmissionV1,
  type GpuAdmissionDecision,
  type GpuMemoryAdmissionInputV1,
} from './gpu-memory-admission-v1';

const base: GpuMemoryAdmissionInputV1 = {
  deviceFreeObserved: null,
  wddmBudget: null,
  wddmCurrentUsage: null,
  cudaContextFree: null,
  requestedBytes: 100_000_000,
  decoderActive: false,
};

describe('gpu memory admission v1', () => {
  // 01: both observations absent
  it('01 defers with UNKNOWN pressure when no signal is observed at all', () => {
    const result = decideGpuMemoryAdmissionV1(base);
    expect(result.pressureState).toBe('UNKNOWN');
    expect(result.decision).toBe('DEFER');
    expect(result.effectiveAdmittableBytes).toBeNull();
  });

  // 02: CUDA-only healthy
  it('02 admits deterministically from a healthy CUDA-only observation', () => {
    const result = decideGpuMemoryAdmissionV1({ ...base, cudaContextFree: 4_000_000_000 });
    expect(result.effectiveAdmittableBytes).toBe(4_000_000_000);
    expect(result.decision).toBe('ADMIT');
  });

  // 03: WDDM-only healthy
  it('03 admits deterministically from a healthy WDDM-only observation', () => {
    const result = decideGpuMemoryAdmissionV1({ ...base, wddmBudget: 6_000_000_000, wddmCurrentUsage: 2_000_000_000 });
    expect(result.effectiveAdmittableBytes).toBe(4_000_000_000);
    expect(result.decision).toBe('ADMIT');
  });

  // 04: CUDA optimistic, WDDM constrained -> WDDM constraint wins
  it('04 takes the WDDM constraint when CUDA is optimistic', () => {
    const result = decideGpuMemoryAdmissionV1({
      ...base,
      cudaContextFree: 6_000_000_000,
      wddmBudget: 500_000_000,
      wddmCurrentUsage: 400_000_000,
    });
    expect(result.effectiveAdmittableBytes).toBe(100_000_000); // wddm-derived 100M, not cuda's 6B
  });

  // 05: WDDM optimistic, CUDA constrained -> CUDA constraint wins
  it('05 takes the CUDA constraint when WDDM is optimistic', () => {
    const result = decideGpuMemoryAdmissionV1({
      ...base,
      cudaContextFree: 150_000_000,
      wddmBudget: 6_000_000_000,
      wddmCurrentUsage: 0,
    });
    expect(result.effectiveAdmittableBytes).toBe(150_000_000); // cuda's constrained reading, not wddm's 6B
  });

  // 06 / 07: requested exactly at the safe boundary, then +1 byte
  it('06 admits when requestedBytes leaves EXACTLY MIN_SAFE_ALLOWANCE_BYTES of headroom', () => {
    const effective = 200_000_000;
    const requested = effective - MIN_SAFE_ALLOWANCE_BYTES;
    const result = decideGpuMemoryAdmissionV1({ ...base, deviceFreeObserved: effective, requestedBytes: requested });
    expect(result.postAdmissionHeadroomBytes).toBe(MIN_SAFE_ALLOWANCE_BYTES);
    expect(result.decision).toBe('ADMIT');
  });

  it('07 does NOT admit when requestedBytes leaves headroom one byte below the safe boundary', () => {
    const effective = 200_000_000;
    const requested = effective - MIN_SAFE_ALLOWANCE_BYTES + 1;
    const result = decideGpuMemoryAdmissionV1({ ...base, deviceFreeObserved: effective, requestedBytes: requested });
    expect(result.postAdmissionHeadroomBytes).toBe(MIN_SAFE_ALLOWANCE_BYTES - 1);
    expect(result.decision).not.toBe('ADMIT');
  });

  // 08 / 09: decoder inactive baseline vs active reserve
  it('08 admits at baseline when the decoder is inactive', () => {
    const observed = DEFAULT_DECODER_RESERVE_BYTES + 50_000_000;
    const result = decideGpuMemoryAdmissionV1({ ...base, deviceFreeObserved: observed, decoderActive: false });
    expect(result.decision).toBe('ADMIT');
  });

  it('09 the decoder reserve strictly decreases admittable capacity and can flip ADMIT to not-ADMIT', () => {
    const observed = DEFAULT_DECODER_RESERVE_BYTES + 50_000_000;
    const withoutDecoder = decideGpuMemoryAdmissionV1({ ...base, deviceFreeObserved: observed, decoderActive: false });
    const withDecoder = decideGpuMemoryAdmissionV1({ ...base, deviceFreeObserved: observed, decoderActive: true });
    expect(withoutDecoder.decision).toBe('ADMIT');
    expect(withDecoder.decision).not.toBe('ADMIT');
    expect(withDecoder.reservedHeadroom).toBe(DEFAULT_DECODER_RESERVE_BYTES);
    expect(withDecoder.effectiveAdmittableBytes!).toBeLessThan(withoutDecoder.effectiveAdmittableBytes!);
  });

  // 10 / 11: eviction sufficiency boundary
  it('10 recommends EVICT_THEN_ADMIT when reclaimable bytes are sufficient, and never evicts itself', () => {
    const result = decideGpuMemoryAdmissionV1({
      ...base,
      deviceFreeObserved: MIN_SAFE_ALLOWANCE_BYTES + 10_000_000, // 74M: short of the 100M request
      requestedBytes: 100_000_000,
      evictableBytes: 100_000_000,
    });
    expect(result.decision).toBe('EVICT_THEN_ADMIT');
    expect(result.writesPerformed).toBe(false);
  });

  it('11 rejects when reclaimable bytes fall one byte short of sufficiency', () => {
    const effective = MIN_SAFE_ALLOWANCE_BYTES + 10_000_000; // 74M
    const requested = 100_000_000;
    // Need effective + evictable - requested == MIN_SAFE_ALLOWANCE_BYTES - 1 (one byte short)
    const evictable = MIN_SAFE_ALLOWANCE_BYTES - 1 - effective + requested;
    const result = decideGpuMemoryAdmissionV1({
      ...base,
      deviceFreeObserved: effective,
      requestedBytes: requested,
      evictableBytes: evictable,
    });
    expect(result.decision).toBe('REJECT');
  });

  // 12: genuinely critical pressure -> REJECT, not DEFER
  it('12 rejects (not defers) under genuinely CRITICAL pressure with known evidence', () => {
    const result = decideGpuMemoryAdmissionV1({ ...base, deviceFreeObserved: MIN_SAFE_ALLOWANCE_BYTES - 1, requestedBytes: 1 });
    expect(result.pressureState).toBe('CRITICAL');
    expect(result.decision).toBe('REJECT');
    expect(result.decision).not.toBe('DEFER');
  });

  // 13: no physical evidence -> DEFER, not REJECT/ADMIT (restates 01 explicitly against the sibling decisions)
  it('13 defers rather than rejecting or admitting when there is no physical evidence', () => {
    const result = decideGpuMemoryAdmissionV1(base);
    expect(result.decision).toBe('DEFER');
    expect(result.decision).not.toBe('REJECT');
    expect(result.decision).not.toBe('ADMIT');
  });

  // 14: negative/corrupt WDDM-derived headroom -> clamp/reject evidence deterministically
  it('14a clamps a negative WDDM-derived headroom (usage exceeding budget) to zero rather than propagating a negative number', () => {
    const result = decideGpuMemoryAdmissionV1({ ...base, wddmBudget: 1_000_000, wddmCurrentUsage: 5_000_000 });
    // wddm-derived signal clamps to 0; with no other signal present, 0 is the sole trusted reading
    expect(result.effectiveAdmittableBytes).toBe(0);
    expect(result.pressureState).toBe('CRITICAL');
  });

  it('14b excludes an individually corrupt (negative) signal entirely rather than using it', () => {
    const result = decideGpuMemoryAdmissionV1({ ...base, wddmBudget: -5, wddmCurrentUsage: 1, deviceFreeObserved: 4_000_000_000 });
    // the corrupt wddm pair is dropped; only deviceFreeObserved remains trusted
    expect(result.effectiveAdmittableBytes).toBe(4_000_000_000);
  });

  // 15 / 16: checksum determinism and evidenceRefs order sensitivity
  it('15 produces a byte-identical admissionChecksum for repeated identical input', () => {
    const first = decideGpuMemoryAdmissionV1({ ...base, deviceFreeObserved: 4_000_000_000 });
    const second = decideGpuMemoryAdmissionV1({ ...base, deviceFreeObserved: 4_000_000_000 });
    expect(first.admissionChecksum).toBe(second.admissionChecksum);
  });

  it('16 defines evidenceRefs order as checksum-significant (reordering changes admissionChecksum)', () => {
    const a = decideGpuMemoryAdmissionV1({ ...base, deviceFreeObserved: 4_000_000_000, evidenceRefs: ['a.json', 'b.json'] });
    const b = decideGpuMemoryAdmissionV1({ ...base, deviceFreeObserved: 4_000_000_000, evidenceRefs: ['b.json', 'a.json'] });
    expect(a.admissionChecksum).not.toBe(b.admissionChecksum);
  });

  // 17: requestedBytes = 0 is an explicit, tested policy, not accidental branch behavior
  it('17a a zero-byte request ADMITs when the device itself is not already critical', () => {
    const result = decideGpuMemoryAdmissionV1({ ...base, deviceFreeObserved: 200_000_000, requestedBytes: 0 });
    expect(result.decision).toBe('ADMIT');
  });

  it('17b a zero-byte request still REJECTs when the device itself is already CRITICAL -- admission answers device safety, not request cost', () => {
    const result = decideGpuMemoryAdmissionV1({ ...base, deviceFreeObserved: MIN_SAFE_ALLOWANCE_BYTES - 1, requestedBytes: 0 });
    expect(result.pressureState).toBe('CRITICAL');
    expect(result.decision).toBe('REJECT');
  });

  // 18: huge integer / overflow boundary rejected by a safe-integer guard
  it('18 rejects a requestedBytes beyond Number.MAX_SAFE_INTEGER via an explicit guard', () => {
    expect(() => decideGpuMemoryAdmissionV1({ ...base, requestedBytes: Number.MAX_SAFE_INTEGER + 2 })).toThrow(
      'GPU_MEMORY_ADMISSION_REQUESTED_BYTES_INVALID',
    );
    expect(() => decideGpuMemoryAdmissionV1({ ...base, requestedBytes: -1 })).toThrow(
      'GPU_MEMORY_ADMISSION_REQUESTED_BYTES_INVALID',
    );
    expect(() => decideGpuMemoryAdmissionV1({ ...base, requestedBytes: Number.NaN })).toThrow(
      'GPU_MEMORY_ADMISSION_REQUESTED_BYTES_INVALID',
    );
  });

  // --- Property-based assertions: these catch policy defects individual examples miss ---

  function permissivenessRank(decision: GpuAdmissionDecision): number | null {
    // DEFER is an evidence-availability state, not comparable on this scale --
    // property tests below always supply at least one trusted signal, so
    // DEFER should never occur; returning null lets a test fail loudly if it does.
    if (decision === 'REJECT') return 0;
    if (decision === 'EVICT_THEN_ADMIT') return 1;
    if (decision === 'ADMIT') return 2;
    return null;
  }

  it('property: increasing requestedBytes can never increase admission permissiveness', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: MIN_SAFE_ALLOWANCE_BYTES, max: 2_000_000_000 }), // observed free bound
        fc.integer({ min: 0, max: 2_000_000_000 }),
        fc.integer({ min: 0, max: 2_000_000_000 }),
        (observed, requestedA, requestedB) => {
          const [smaller, larger] = requestedA <= requestedB ? [requestedA, requestedB] : [requestedB, requestedA];
          const resultSmaller = decideGpuMemoryAdmissionV1({ ...base, deviceFreeObserved: observed, requestedBytes: smaller });
          const resultLarger = decideGpuMemoryAdmissionV1({ ...base, deviceFreeObserved: observed, requestedBytes: larger });
          const rankSmaller = permissivenessRank(resultSmaller.decision);
          const rankLarger = permissivenessRank(resultLarger.decision);
          expect(rankSmaller).not.toBeNull();
          expect(rankLarger).not.toBeNull();
          expect(rankLarger!).toBeLessThanOrEqual(rankSmaller!);
        },
      ),
    );
  });

  it('property: increasing observed free bytes can never decrease admission permissiveness', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: MIN_SAFE_ALLOWANCE_BYTES, max: 1_000_000_000 }),
        fc.integer({ min: MIN_SAFE_ALLOWANCE_BYTES, max: 1_000_000_000 }),
        fc.integer({ min: 0, max: 500_000_000 }), // fixed requestedBytes
        (observedA, observedB, requested) => {
          const [smaller, larger] = observedA <= observedB ? [observedA, observedB] : [observedB, observedA];
          const resultSmaller = decideGpuMemoryAdmissionV1({ ...base, deviceFreeObserved: smaller, requestedBytes: requested });
          const resultLarger = decideGpuMemoryAdmissionV1({ ...base, deviceFreeObserved: larger, requestedBytes: requested });
          const rankSmaller = permissivenessRank(resultSmaller.decision);
          const rankLarger = permissivenessRank(resultLarger.decision);
          expect(rankSmaller).not.toBeNull();
          expect(rankLarger).not.toBeNull();
          expect(rankLarger!).toBeGreaterThanOrEqual(rankSmaller!);
        },
      ),
    );
  });

  it('decoderActive is never more permissive than decoderActive=false for otherwise identical input', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 4_000_000_000 }), fc.integer({ min: 0, max: 1_000_000_000 }), (observed, requested) => {
        const withoutDecoder = decideGpuMemoryAdmissionV1({ ...base, deviceFreeObserved: observed, requestedBytes: requested, decoderActive: false });
        const withDecoder = decideGpuMemoryAdmissionV1({ ...base, deviceFreeObserved: observed, requestedBytes: requested, decoderActive: true });
        const rankWithout = permissivenessRank(withoutDecoder.decision);
        const rankWith = permissivenessRank(withDecoder.decision);
        // Both should be known-evidence decisions here since deviceFreeObserved is always provided (>=0).
        if (rankWithout !== null && rankWith !== null) {
          expect(rankWith).toBeLessThanOrEqual(rankWithout);
        }
      }),
    );
  });
});
