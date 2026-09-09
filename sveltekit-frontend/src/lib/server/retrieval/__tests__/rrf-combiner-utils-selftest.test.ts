// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { testRRFCombiner } from '../rrf-combiner-utils.js';

describe('rrf-combiner-utils inline self-test (RF6/RF7 FusionCoreV1 delegation check)', () => {
  it('all 6 built-in arithmetic cases pass after delegating to fuseContributionsV1', () => {
    const result = testRRFCombiner();
    for (const t of result.tests) {
      expect(t.pass, `case failed: ${t.name}`).toBe(true);
    }
    expect(result.pass).toBe(true);
  });
});
