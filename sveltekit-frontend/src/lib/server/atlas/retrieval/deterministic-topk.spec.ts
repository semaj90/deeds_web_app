import { describe, expect, it } from 'vitest';
import {
  deterministicTopKByDistance,
  deterministicTopKByScore,
  overlapRecallAtK,
  widenKForDistanceTies,
} from './deterministic-topk.js';

describe('deterministicTopKByScore', () => {
  it('uses canonical identity to stabilize equal scores', () => {
    const rows = [
      { canonicalId: 'C', score: 0.9 },
      { canonicalId: 'A', score: 0.9 },
      { canonicalId: 'B', score: 0.9 },
    ];
    expect(deterministicTopKByScore(rows, 3).map((row) => row.canonicalId)).toEqual(['A', 'B', 'C']);
  });

  it('does not mutate the source array', () => {
    const rows = [{ canonicalId: 'B', score: 0.2 }, { canonicalId: 'A', score: 0.8 }];
    const snapshot = JSON.stringify(rows);
    deterministicTopKByScore(rows, 1);
    expect(JSON.stringify(rows)).toBe(snapshot);
  });
});

describe('deterministicTopKByDistance', () => {
  it('orders by distance then canonical identity', () => {
    const rows = [
      { canonicalId: 'C', distance: 0.1 },
      { canonicalId: 'A', distance: 0.1 },
      { canonicalId: 'B', distance: 0.05 },
    ];
    expect(deterministicTopKByDistance(rows, 3).map((row) => row.canonicalId)).toEqual(['B', 'A', 'C']);
  });

  it('rejects negative/non-finite distances and duplicate identities', () => {
    expect(() => deterministicTopKByDistance([{ canonicalId: 'A', distance: -1 }], 1)).toThrow(/non-negative/);
    expect(() => deterministicTopKByDistance([{ canonicalId: 'A', distance: Infinity }], 1)).toThrow(/non-finite/);
    expect(() => deterministicTopKByDistance([
      { canonicalId: 'A', sourceRevision: 'r1', distance: 0.1 },
      { canonicalId: 'A', sourceRevision: 'r1', distance: 0.2 },
    ], 1)).toThrow(/duplicate/);
  });
});

describe('tie-aware recall helpers', () => {
  it('computes identity overlap recall at K', () => {
    const exact = [
      { canonicalId: 'A', sourceRevision: 'r1', distance: 0.01 },
      { canonicalId: 'B', sourceRevision: 'r1', distance: 0.02 },
      { canonicalId: 'C', sourceRevision: 'r1', distance: 0.03 },
    ];
    const challenger = [
      { canonicalId: 'A', sourceRevision: 'r1', distance: 0.01 },
      { canonicalId: 'C', sourceRevision: 'r1', distance: 0.02 },
      { canonicalId: 'D', sourceRevision: 'r1', distance: 0.03 },
    ];
    expect(overlapRecallAtK({ exact, challenger, k: 3 })).toBeCloseTo(2 / 3);
  });

  it('widens K across equal-distance cutoff ties', () => {
    const rows = [
      { canonicalId: 'A', distance: 0.01 },
      { canonicalId: 'B', distance: 0.02 },
      { canonicalId: 'C', distance: 0.02 },
      { canonicalId: 'D', distance: 0.03 },
    ];
    expect(widenKForDistanceTies(rows, 2)).toBe(3);
  });

  it('supports an explicit floating tolerance around the cutoff', () => {
    const rows = [
      { canonicalId: 'A', distance: 0.01 },
      { canonicalId: 'B', distance: 0.02 },
      { canonicalId: 'C', distance: 0.02000001 },
      { canonicalId: 'D', distance: 0.03 },
    ];
    expect(widenKForDistanceTies(rows, 2, 1e-6)).toBe(3);
    expect(widenKForDistanceTies(rows, 2, 1e-9)).toBe(2);
  });
});
