import { describe, expect, it } from 'vitest';
import { rankIntent } from '$lib/intent/regex-intent.js';

describe('rankIntent (cosine ranker)', () => {
  it('ranks legal research query above fallback threshold', () => {
    const result = rankIntent('search case law precedent and citation for hearsay');

    expect(result.label).toBe('legal_research');
    expect(result.fallback).toBe(false);
    expect(result.confidence).toBeGreaterThanOrEqual(0.5);
  });

  it('keeps ambiguous text in fallback mode', () => {
    const result = rankIntent('hello there can you help me');

    expect(result.fallback).toBe(true);
    expect(result.confidence).toBeLessThan(0.5);
  });

  it('returns alternates for overlapping intent language', () => {
    const result = rankIntent('rerank graph search results with gpu attention');

    expect(result.alternates.length).toBeGreaterThanOrEqual(1);
  });
});
