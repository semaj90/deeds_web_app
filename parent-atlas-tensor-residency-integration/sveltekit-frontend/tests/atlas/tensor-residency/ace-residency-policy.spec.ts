import { describe, expect, it } from 'vitest';
import { rankEvictionCandidates, tileUtility } from '../../../src/lib/server/atlas/tensors/ace-residency-policy';

describe('ACE residency', () => {
  it('rewards relevance', () => {
    const low = tileUtility({ relevance: 0.1, authority: 0, executionUtility: 0, predictedReuse: 0, memoryBytes: 1, transferCost: 0, recomputeCost: 0 });
    const high = tileUtility({ relevance: 0.9, authority: 0, executionUtility: 0, predictedReuse: 0, memoryBytes: 1, transferCost: 0, recomputeCost: 0 });
    expect(high).toBeGreaterThan(low);
  });
  it('never evicts pinned/in-use first', () => {
    const base = { tileId: '1', artifactId: 'a', artifactRevision: 'r', recordBatchIndex: 0, rowCount: 1, dtype: 'float32' as const, byteLength: 1, contentHash: 'h', hostState: 'PINNED' as const, lastUsedAt: 1 };
    const ranked = rankEvictionCandidates([
      { ...base, tileKey: 'pinned', gpuState: 'RESIDENT', utility: -100, pinCount: 1 },
      { ...base, tileKey: 'free', gpuState: 'RESIDENT', utility: 1, pinCount: 0 }
    ]);
    expect(ranked.map((x) => x.tileKey)).toEqual(['free']);
  });
});
