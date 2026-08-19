import { describe, expect, it } from 'vitest';
import { chooseMemoryPressurePolicy } from './memory-pressure-policy.js';

describe('memory pressure policy', () => {
  it('keeps a small working set resident', () => {
    const policy = chooseMemoryPressurePolicy({
      payloadBytes: 100,
      estimatedActivationBytes: 100,
      freeVramBytes: 1000,
      reserveVramBytes: 100,
      recomputeCostRatio: 1,
      producerRevision: 'test',
    });
    expect(policy.selectedMode).toBe('FULL_RESIDENT');
  });

  it('tiles when payload fits but activations do not', () => {
    const policy = chooseMemoryPressurePolicy({
      payloadBytes: 600,
      estimatedActivationBytes: 400,
      freeVramBytes: 1000,
      reserveVramBytes: 100,
      recomputeCostRatio: 1,
      producerRevision: 'test',
    });
    expect(policy.selectedMode).toBe('TILED');
  });

  it('uses checkpointing when recompute is cheap enough under pressure', () => {
    const policy = chooseMemoryPressurePolicy({
      payloadBytes: 850,
      estimatedActivationBytes: 900,
      freeVramBytes: 1000,
      reserveVramBytes: 100,
      recomputeCostRatio: 1.5,
      producerRevision: 'test',
    });
    expect(policy.selectedMode).toBe('CHECKPOINTED');
    expect(policy.checkpointSegments).toBeGreaterThanOrEqual(2);
    expect(policy.preferNonReentrantCheckpoint).toBe(true);
  });

  it('falls back to routing-only LOD for workloads far outside the GPU envelope', () => {
    const policy = chooseMemoryPressurePolicy({
      payloadBytes: 10_000,
      estimatedActivationBytes: 10_000,
      freeVramBytes: 1000,
      reserveVramBytes: 100,
      recomputeCostRatio: 4,
      producerRevision: 'test',
    });
    expect(policy.selectedMode).toBe('ROUTING_ONLY_LOD');
  });
});
