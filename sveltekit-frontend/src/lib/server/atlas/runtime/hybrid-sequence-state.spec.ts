import { describe, expect, it } from 'vitest';
import { buildOrnithHybridSequenceState } from './hybrid-sequence-state.js';

function deltaNetObservations(recurrentStateBytes = 1_024, convolutionStateBytes = 128) {
  return Array.from({ length: 32 }, (_, layerIndex) => layerIndex)
    .filter((layerIndex) => (layerIndex + 1) % 4 !== 0)
    .map((layerIndex) => ({
      layerIndex,
      recurrentStateBytes,
      convolutionStateBytes,
      accountingSource: 'MEASURED' as const,
    }));
}

describe('HybridSequenceStateV1', () => {
  it('materializes the frozen Ornith 24 DeltaNet / 8 full-attention layout', () => {
    const state = buildOrnithHybridSequenceState({
      modelRevision: 'ornith-fixture',
      runtime: 'PYTORCH_TRANSFORMERS',
      batchSize: 1,
      sequenceLengthTokens: 128,
      kvCacheBytesPerElement: 2,
      deltaNetLayers: deltaNetObservations(),
      producerRevision: 'test',
    });

    expect(state.layers).toHaveLength(32);
    expect(state.layers.filter((layer) => layer.layerKind === 'GATED_DELTANET')).toHaveLength(24);
    expect(state.layers.filter((layer) => layer.layerKind === 'FULL_ATTENTION')).toHaveLength(8);
    expect(state.layers.filter((layer) => layer.layerKind === 'FULL_ATTENTION').map((layer) => layer.layerIndex))
      .toEqual([3, 7, 11, 15, 19, 23, 27, 31]);
    expect(state.deltaNetRecurrentStateBytes).toBe(24 * 1_024);
    expect(state.deltaNetConvolutionStateBytes).toBe(24 * 128);
  });

  it('makes only full-attention KV grow with context length', () => {
    const base = {
      modelRevision: 'ornith-fixture',
      runtime: 'PYTORCH_TRANSFORMERS' as const,
      batchSize: 1,
      kvCacheBytesPerElement: 2,
      deltaNetLayers: deltaNetObservations(),
      producerRevision: 'test',
    };

    const shortContext = buildOrnithHybridSequenceState({ ...base, sequenceLengthTokens: 128 });
    const longContext = buildOrnithHybridSequenceState({ ...base, sequenceLengthTokens: 256 });

    expect(longContext.deltaNetRecurrentStateBytes).toBe(shortContext.deltaNetRecurrentStateBytes);
    expect(longContext.deltaNetConvolutionStateBytes).toBe(shortContext.deltaNetConvolutionStateBytes);
    expect(longContext.fullAttentionKvCacheBytes).toBe(shortContext.fullAttentionKvCacheBytes * 2);
    expect(longContext.totalSequenceStateBytes - shortContext.totalSequenceStateBytes)
      .toBe(shortContext.fullAttentionKvCacheBytes);
  });

  it('requires explicit DeltaNet observations instead of guessing recurrent-state bytes', () => {
    expect(() => buildOrnithHybridSequenceState({
      modelRevision: 'ornith-fixture',
      runtime: 'PYTORCH_TRANSFORMERS',
      batchSize: 1,
      sequenceLengthTokens: 128,
      kvCacheBytesPerElement: 2,
      deltaNetLayers: deltaNetObservations().slice(0, -1),
      producerRevision: 'test',
    })).toThrow(/exactly one observation/);
  });
});
