// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { combineRRFLanes, testRRFCombiner } from '../rrf-combiner-utils.js';

describe('rrf-combiner-utils inline self-test (RF6/RF7 FusionCoreV1 delegation check)', () => {
  it('all 6 built-in arithmetic cases pass after delegating to fuseContributionsV1', () => {
    const result = testRRFCombiner();
    for (const t of result.tests) {
      expect(t.pass, `case failed: ${t.name}`).toBe(true);
    }
    expect(result.pass).toBe(true);
  });
});

describe('combineRRFLanes id normalization (KERNEL-REAL-02 blocker 1)', () => {
  it('does not throw on numeric or missing hit ids; numeric ids fuse as strings', () => {
    const lane = (id: unknown) => ({ id: id as string, rank: 1, rrfContribution: 0.01 });
    const result = combineRRFLanes(
      new Map([
        ['dense_vector', [lane(42), lane(undefined), lane(null), lane('  ')]],
        ['turbovec', [lane('42')]],
      ]),
    );
    expect(result.map((r) => r.id)).toEqual(['42']);
    expect(result[0]!.sourceCount).toBe(2);
  });
});
