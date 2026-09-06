// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { selectLaneNamesForTier, mergeDuplicateIdentityScores } from './service.js';
import type { SearchResult } from './types.js';

describe('retrieval service lane defaults', () => {
  it('keeps 384 out of the automatic tier defaults', () => {
    expect(selectLaneNamesForTier('hot')).toEqual(['lexical', 'qdrant-768', 'gpu-cuvs', 'bm25']);
    expect(selectLaneNamesForTier('warm')).toEqual(['lexical', 'qdrant-768', 'bm25', 'gpu-cuvs']);
    expect(selectLaneNamesForTier('cold')).toEqual(['lexical', 'qdrant-768', 'bm25', 'gpu-cuvs']);
  });
});

function makeResult(overrides: Partial<SearchResult>): SearchResult {
  return {
    id: overrides.id ?? 'default-id',
    rank: overrides.rank ?? 0,
    score: overrides.score ?? 0,
    confidence: overrides.confidence ?? 1,
    source: overrides.source ?? ('qdrant-768' as SearchResult['source']),
    packet_key: overrides.packet_key ?? null,
    symbol_version_id: overrides.symbol_version_id,
    ...overrides,
  } as SearchResult;
}

describe('mergeDuplicateIdentityScores (RF7 fix-in-place: service.ts::rrfFusion post-fusion dedup)', () => {
  it('sums scores for two backend-local ids resolving to the same symbol_version_id, instead of discarding the loser', () => {
    const results = [
      makeResult({ id: 'qdrant:1', symbol_version_id: 'sym:foo', score: 0.5 }),
      makeResult({ id: 'turbovec:1', symbol_version_id: 'sym:foo', score: 0.3 }),
    ];

    const merged = mergeDuplicateIdentityScores(results);

    expect(merged).toHaveLength(1);
    expect(merged[0].score).toBeCloseTo(0.8, 10);
    expect(merged[0].id).toBe('qdrant:1'); // higher-scored entry is the representative
  });

  it('falls back to packet_key when symbol_version_id is absent', () => {
    const results = [
      makeResult({ id: 'a', packet_key: 'pkt:1', score: 0.2 }),
      makeResult({ id: 'b', packet_key: 'pkt:1', score: 0.6 }),
    ];

    const merged = mergeDuplicateIdentityScores(results);

    expect(merged).toHaveLength(1);
    expect(merged[0].score).toBeCloseTo(0.8, 10);
    expect(merged[0].id).toBe('b');
  });

  it('falls back to id when neither symbol_version_id nor packet_key is present', () => {
    const results = [
      makeResult({ id: 'only-id', score: 0.4 }),
      makeResult({ id: 'other-id', score: 0.1 }),
    ];

    const merged = mergeDuplicateIdentityScores(results);

    expect(merged).toHaveLength(2); // distinct ids, no shared identity, no merge
  });

  it('leaves distinct identities unmerged and sorts by descending score', () => {
    const results = [
      makeResult({ id: 'a', symbol_version_id: 'sym:a', score: 0.1 }),
      makeResult({ id: 'b', symbol_version_id: 'sym:b', score: 0.9 }),
    ];

    const merged = mergeDuplicateIdentityScores(results);

    expect(merged).toHaveLength(2);
    expect(merged[0].id).toBe('b');
    expect(merged[1].id).toBe('a');
  });
});
