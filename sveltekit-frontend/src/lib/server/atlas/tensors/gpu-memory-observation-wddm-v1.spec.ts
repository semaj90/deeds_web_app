import { describe, expect, it } from 'vitest';

import { decideGpuMemoryAdmissionV1 } from './gpu-memory-admission-v1';
import { buildGpuMemoryObservationV1, toAdmissionInputFields } from './gpu-memory-observation-v1';

/**
 * BITFROST-GPU-MEMORY-ADMISSION-01 (stage D) -- frozen real-capture regression test.
 *
 * This is the literal `observationV1Shape` captured live by
 * scripts/atlas/prove-gpu-memory-observation-wddm-v1.mjs on 2026-09-14 (see
 * docs/reports/gpu-memory-observation-wddm-v1.json) -- a real nvidia-smi
 * reading, a real Windows "GPU Process Memory\Dedicated Usage" performance
 * counter reading, and a real WSL2 cudaContextFree reading, all taken within
 * the same wall-clock second. Frozen here (not re-queried at test time) so
 * this test is deterministic and doesn't require GPU/WSL2 hardware to run in
 * CI -- it proves the SHAPE and the DOWNSTREAM ADMISSION BEHAVIOR are sound,
 * not that live hardware is currently reachable (stage C's own spec already
 * covers schema validation against synthetic values; this one is anchored to
 * one real, timestamped capture instead).
 */
describe('gpu memory observation v1 -- frozen WDDM + nvidia-smi + CUDA real capture (stage D)', () => {
  const frozenCapture = {
    schema: 'atlas.gpu-memory-observation.v1' as const,
    observedAt: '2026-09-14T21:35:09.991Z',
    deviceFreeObserved: { value: 1_113_587_712, source: 'nvidia-smi' as const },
    wddmBudget: null,
    wddmCurrentUsage: { value: 7_562_141_696, source: 'wddm' as const },
    cudaContextFree: { value: 7_472_152_576, source: 'cuda-context' as const },
    deviceLabel: 'NVIDIA GeForce RTX 3060 Ti',
    writesPerformed: false as const,
  };

  it('parses cleanly -- no WDDM source-mismatch issue when wddmBudget is null', () => {
    const observation = buildGpuMemoryObservationV1(frozenCapture);
    expect(observation.deviceFreeObserved?.value).toBe(1_113_587_712);
    expect(observation.wddmBudget).toBeNull();
    expect(observation.wddmCurrentUsage?.value).toBe(7_562_141_696);
    expect(observation.cudaContextFree?.value).toBe(7_472_152_576);
  });

  it('reproduces the BITFROST-L2-01 cudaMemGetInfo-vs-nvidia-smi discrepancy numerically', () => {
    // cudaContextFree overstates free VRAM ~6.7x relative to nvidia-smi at this
    // capture instant -- same direction and same root cause as the earlier
    // ~20x finding (magnitude varies with how much real contention exists at
    // capture time; direction is the load-bearing, reproduced fact).
    const ratio = frozenCapture.cudaContextFree.value / frozenCapture.deviceFreeObserved.value;
    expect(ratio).toBeGreaterThan(1);
    expect(ratio).toBeCloseTo(6.71, 1);
  });

  it('feeds through decideGpuMemoryAdmissionV1() using the min-of-trusted-signals rule -- cudaContextFree is NOT trusted alone', () => {
    const observation = buildGpuMemoryObservationV1(frozenCapture);
    const fields = toAdmissionInputFields(observation);
    // wddmCurrentUsage alone (no wddmBudget) contributes nothing to
    // wddmAvailable(); the effective free bound must come from the minimum of
    // deviceFreeObserved and cudaContextFree, i.e. deviceFreeObserved
    // (nvidia-smi's real, tighter reading) -- proving the admission policy
    // does NOT get fooled by cudaContextFree's optimistic number even when
    // it is the larger of the two available signals.
    const decision = decideGpuMemoryAdmissionV1({
      ...fields,
      requestedBytes: 500_000_000,
      decoderActive: false,
    });
    expect(decision.deviceFreeObserved).toBe(1_113_587_712);
    expect(decision.cudaContextFree).toBe(7_472_152_576);
    // effectiveAdmittableBytes must be bounded by the SMALLER trusted signal
    // (nvidia-smi), never the larger optimistic one (cudaContextFree).
    expect(decision.effectiveAdmittableBytes).toBeLessThanOrEqual(1_113_587_712);
  });

  it('a large decoder-reserve request against this real capture correctly REJECTs rather than optimistically ADMITting', () => {
    const observation = buildGpuMemoryObservationV1(frozenCapture);
    const fields = toAdmissionInputFields(observation);
    // Requesting 2GB against a real ~1.06GB nvidia-smi-observed free reading
    // must not be rescued by cudaContextFree's optimistic ~7.47GB figure.
    const decision = decideGpuMemoryAdmissionV1({
      ...fields,
      requestedBytes: 2_000_000_000,
      decoderActive: false,
    });
    expect(decision.decision).not.toBe('ADMIT');
  });
});
