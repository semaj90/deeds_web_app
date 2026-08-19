import { describe, expect, it } from 'vitest';
import { buildOrnithHybridSequenceState } from './hybrid-sequence-state.js';
import { chooseMemoryPressurePolicy } from './memory-pressure-policy.js';

const ornithDeltaNetObservations = Array.from({ length: 32 }, (_, layerIndex) => layerIndex)
  .filter((layerIndex) => (layerIndex + 1) % 4 !== 0)
  .map((layerIndex) => ({
    layerIndex,
    recurrentStateBytes: 1_000,
    convolutionStateBytes: 100,
    accountingSource: 'RUNTIME_REPORTED' as const,
  }));

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
    expect(policy.sequenceStateBytes).toBe(0);
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

  it('accounts for Ornith hybrid state and targets growing full-attention KV under pressure', () => {
    const sequenceState = buildOrnithHybridSequenceState({
      modelRevision: 'ornith-fixture',
      runtime: 'PYTORCH_TRANSFORMERS',
      batchSize: 1,
      sequenceLengthTokens: 16,
      kvCacheBytesPerElement: 2,
      deltaNetLayers: ornithDeltaNetObservations,
      producerRevision: 'test',
    });

    const policy = chooseMemoryPressurePolicy({
      payloadBytes: 100_000,
      estimatedActivationBytes: 100_000,
      freeVramBytes: 500_000,
      reserveVramBytes: 50_000,
      recomputeCostRatio: 1,
      hybridSequenceState: sequenceState,
      producerRevision: 'test',
    });

    expect(policy.sequenceStateBytes).toBe(sequenceState.totalSequenceStateBytes);
    expect(policy.deltaNetRecurrentStateBytes).toBe(24_000);
    expect(policy.deltaNetConvolutionStateBytes).toBe(2_400);
    expect(policy.fullAttentionKvCacheBytes).toBe(524_288);
    expect(policy.preserveDeltaNetState).toBe(true);
    expect(policy.compactOrPageFullAttentionKv).toBe(true);
    expect(policy.reasons).toContain('TARGET_GROWING_FULL_ATTENTION_KV_BEFORE_UNIFORM_STATE_EVICTION');
  });
});
