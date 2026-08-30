import { describe, expect, it } from 'vitest';
import { pickPageRankAuthorityScore, resolvePageRankAuthority } from './pagerank-authority.js';

describe('resolvePageRankAuthority', () => {
  it('marks l1Status ABSENT when pagerank_l1 was never populated', () => {
    const resolved = resolvePageRankAuthority({ pagerank_raw: 1.5 });
    expect(resolved.l1Status).toBe('ABSENT');
    expect(resolved.l1).toBeNull();
    expect(resolved.raw).toBe(1.5);
  });

  it('marks l1Status PRESENT when pagerank_l1 is a valid finite value', () => {
    const resolved = resolvePageRankAuthority({ pagerank_l1: 0.42 });
    expect(resolved.l1Status).toBe('PRESENT');
    expect(resolved.l1).toBe(0.42);
  });

  it('marks l1Status CORRUPT when pagerank_l1 is present but non-finite', () => {
    const nan = resolvePageRankAuthority({ pagerank_l1: NaN, pagerank_raw: 1.5 });
    expect(nan.l1Status).toBe('CORRUPT');
    expect(nan.l1).toBeNull();
    expect(nan.raw).toBe(1.5);

    const infinite = resolvePageRankAuthority({ pagerank_l1: Infinity, pagerank_raw: 1.5 });
    expect(infinite.l1Status).toBe('CORRUPT');
  });
});

describe('pickPageRankAuthorityScore', () => {
  it('returns the l1 score when present', () => {
    expect(pickPageRankAuthorityScore({ pagerank_l1: 0.9 })).toBe(0.9);
  });

  it('falls back to raw then legacy when l1 is legitimately absent', () => {
    expect(pickPageRankAuthorityScore({ pagerank_raw: 0.7 })).toBe(0.7);
    expect(pickPageRankAuthorityScore({ pagerank: 0.3 })).toBe(0.3);
  });

  it('fails closed instead of silently substituting raw/legacy when l1 is corrupt', () => {
    expect(() => pickPageRankAuthorityScore({ pagerank_l1: NaN, pagerank_raw: 0.7 }))
      .toThrow('PAGERANK_L1_CORRUPT_FAIL_CLOSED');
  });

  it('returns null when nothing is available at all', () => {
    expect(pickPageRankAuthorityScore(null)).toBeNull();
    expect(pickPageRankAuthorityScore(undefined)).toBeNull();
    expect(pickPageRankAuthorityScore({})).toBeNull();
  });
});
