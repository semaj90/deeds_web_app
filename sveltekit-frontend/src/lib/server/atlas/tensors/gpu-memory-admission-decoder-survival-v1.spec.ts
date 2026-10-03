import { describe, expect, it } from 'vitest';

import { decideGpuMemoryAdmissionV1 } from './gpu-memory-admission-v1';

/**
 * BITFROST-GPU-MEMORY-ADMISSION-01 (stage E) -- frozen real-capture regression test.
 *
 * This is the literal `observation`/`requestedBytes` pair captured live by
 * scripts/atlas/prove-gpu-memory-admission-decoder-survival-v1.mjs on
 * 2026-09-14 against a REAL running llama-server.exe (:8090, ornith-1.5-9b),
 * confirmed alive via GET /v1/models both immediately before and immediately
 * after this exact decision pair was computed (see
 * docs/reports/gpu-memory-admission-decoder-survival-v1.json). Frozen here
 * so the regression is deterministic and doesn't require a live decoder or
 * GPU to run in CI -- the live-hardware proof is the receipt; this test
 * pins the canonical module's behavior against that one real capture.
 */
describe('gpu memory admission v1 -- frozen decoder-survival real capture (stage E)', () => {
  const observation = {
    deviceFreeObserved: 1_176_502_272,
    wddmBudget: null,
    wddmCurrentUsage: null,
    cudaContextFree: 7_472_152_576,
  };
  const requestedBytes = 588_251_136; // ~50% of the real nvidia-smi free reading at capture time

  it('ADMITs when no decoder is active -- request fits comfortably under the real free bound', () => {
    const decision = decideGpuMemoryAdmissionV1({ ...observation, requestedBytes, decoderActive: false });
    expect(decision.decision).toBe('ADMIT');
    expect(decision.effectiveAdmittableBytes).toBe(1_176_502_272);
  });

  it('REJECTs the identical request once decoderActive=true -- the 2GB reserve is load-bearing, not inert', () => {
    const decision = decideGpuMemoryAdmissionV1({ ...observation, requestedBytes, decoderActive: true });
    expect(decision.decision).toBe('REJECT');
    expect(decision.reservedHeadroom).toBe(2_000_000_000);
    // effectiveAdmittableBytes clamps to 0 rather than going negative --
    // freeBound (1.18GB) - reserve (2GB) would be negative.
    expect(decision.effectiveAdmittableBytes).toBe(0);
    expect(decision.pressureState).toBe('CRITICAL');
  });

  it('never DEFERs on this evidence -- both signals are trusted and present, so pressure is always classifiable', () => {
    const withoutDecoder = decideGpuMemoryAdmissionV1({ ...observation, requestedBytes, decoderActive: false });
    const withDecoder = decideGpuMemoryAdmissionV1({ ...observation, requestedBytes, decoderActive: true });
    expect(withoutDecoder.decision).not.toBe('DEFER');
    expect(withDecoder.decision).not.toBe('DEFER');
    // DEFER is reserved solely for UNKNOWN evidence -- this capture has real
    // trusted readings, so neither call should ever fall back to it.
  });
});
