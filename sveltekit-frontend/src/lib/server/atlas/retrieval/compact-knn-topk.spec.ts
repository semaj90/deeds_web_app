import { describe, expect, it } from 'vitest';
import {
  CompactKnnPlanV1Schema,
  compactKnnCoverageComplete,
  compactRowsToCsr,
  createCompactKnnRowState,
  mergeCompactKnnTile,
} from './compact-knn-topk.js';

describe('compact KNN top-K', () => {
  it('keeps the exact global top-K from tile-local top-K winners', () => {
    let state = createCompactKnnRowState(0, 3);
    state = mergeCompactKnnTile({
      state,
      tileCandidateCount: 4,
      valueOrder: 'LARGER_IS_BETTER',
      localTopK: [
        { queryOrdinal: 0, candidateOrdinal: 0, canonicalId: 'A', value: 0.91 },
        { queryOrdinal: 0, candidateOrdinal: 1, canonicalId: 'B', value: 0.80 },
        { queryOrdinal: 0, candidateOrdinal: 2, canonicalId: 'C', value: 0.50 },
      ],
    });
    state = mergeCompactKnnTile({
      state,
      tileCandidateCount: 4,
      valueOrder: 'LARGER_IS_BETTER',
      localTopK: [
        { queryOrdinal: 0, candidateOrdinal: 4, canonicalId: 'E', value: 0.95 },
        { queryOrdinal: 0, candidateOrdinal: 5, canonicalId: 'F', value: 0.82 },
        { queryOrdinal: 0, candidateOrdinal: 6, canonicalId: 'G', value: 0.10 },
      ],
    });
    expect(state.entries.map((entry) => entry.canonicalId)).toEqual(['E', 'A', 'F']);
    expect(compactKnnCoverageComplete(state, 8)).toBe(true);
  });

  it('supports distance top-K where smaller is better', () => {
    let state = createCompactKnnRowState(0, 2);
    state = mergeCompactKnnTile({
      state,
      tileCandidateCount: 3,
      valueOrder: 'SMALLER_IS_BETTER',
      localTopK: [
        { queryOrdinal: 0, candidateOrdinal: 0, canonicalId: 'A', value: 0.20 },
        { queryOrdinal: 0, candidateOrdinal: 1, canonicalId: 'B', value: 0.30 },
      ],
    });
    state = mergeCompactKnnTile({
      state,
      tileCandidateCount: 2,
      valueOrder: 'SMALLER_IS_BETTER',
      localTopK: [
        { queryOrdinal: 0, candidateOrdinal: 3, canonicalId: 'D', value: 0.10 },
        { queryOrdinal: 0, candidateOrdinal: 4, canonicalId: 'E', value: 0.25 },
      ],
    });
    expect(state.entries.map((entry) => entry.canonicalId)).toEqual(['D', 'A']);
  });

  it('uses canonical identity to stabilize ties', () => {
    let state = createCompactKnnRowState(0, 2);
    state = mergeCompactKnnTile({
      state,
      tileCandidateCount: 3,
      valueOrder: 'LARGER_IS_BETTER',
      localTopK: [
        { queryOrdinal: 0, candidateOrdinal: 2, canonicalId: 'C', value: 0.9 },
        { queryOrdinal: 0, candidateOrdinal: 0, canonicalId: 'A', value: 0.9 },
      ],
    });
    expect(state.entries.map((entry) => entry.canonicalId)).toEqual(['A', 'C']);
  });

  it('serializes winners in a compact CSR-like row layout', () => {
    let row0 = createCompactKnnRowState(0, 2);
    let row1 = createCompactKnnRowState(1, 2);
    row0 = mergeCompactKnnTile({
      state: row0, tileCandidateCount: 2, valueOrder: 'LARGER_IS_BETTER',
      localTopK: [
        { queryOrdinal: 0, candidateOrdinal: 0, canonicalId: 'A', value: 0.8 },
        { queryOrdinal: 0, candidateOrdinal: 1, canonicalId: 'B', value: 0.7 },
      ],
    });
    row1 = mergeCompactKnnTile({
      state: row1, tileCandidateCount: 2, valueOrder: 'LARGER_IS_BETTER',
      localTopK: [
        { queryOrdinal: 1, candidateOrdinal: 1, canonicalId: 'B', value: 0.9 },
      ],
    });
    const csr = compactRowsToCsr([row1, row0]);
    expect([...csr.rowOffsets]).toEqual([0, 2, 3]);
    expect([...csr.candidateOrdinals]).toEqual([0, 1, 1]);
    expect(csr.canonicalIds).toEqual(['A', 'B', 'B']);
  });

  it('pins metric direction in the plan', () => {
    expect(() => CompactKnnPlanV1Schema.parse({
      schema: 'atlas.compact-knn-topk-plan.v1',
      queryCount: 1,
      candidateCount: 10,
      dimension: 768,
      k: 4,
      metric: 'L2_DISTANCE',
      valueOrder: 'LARGER_IS_BETTER',
      candidateTileRows: 4,
      materializeFullPairMatrix: false,
      exactCandidateCoverageRequired: true,
      canonicalTieBreakRequired: true,
      producerRevision: 'test',
    })).toThrow(/SMALLER_IS_BETTER/);
  });
});
