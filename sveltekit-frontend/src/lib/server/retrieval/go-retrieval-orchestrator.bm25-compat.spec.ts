import { describe, expect, it } from 'vitest';
import { parseGoRetrievalBm25Response } from './go-retrieval-orchestrator.js';

describe('parseGoRetrievalBm25Response — /search/bm25 compatibility contract', () => {
  it('consumes lane: postgres_fts without inferring scoring semantics from the route name', () => {
    const result = parseGoRetrievalBm25Response({
      results: [{ id: 'p1', source_ref: 'src/a.ts', score: 0.8 }],
      lane: 'postgres_fts',
      legacy_lane: 'bm25',
      capability: { trueBm25: false },
    }, true, 200);
    expect(result.laneMeta.lane).toBe('postgres_fts');
    expect(result.laneMeta.trueBm25).toBe(false);
    expect(result.ranked[0].bm25_score).toBe(0.8);
  });

  it('tolerates legacy_lane: bm25 being present without treating it as the real lane', () => {
    const result = parseGoRetrievalBm25Response({
      results: [],
      lane: 'postgres_fts',
      legacy_lane: 'bm25',
    }, true, 200);
    expect(result.laneMeta.legacyLane).toBe('bm25');
    expect(result.laneMeta.lane).toBe('postgres_fts');
  });

  it('reads capability.trueBm25 rather than assuming true from the field name bm25_score', () => {
    const trueBm25Response = parseGoRetrievalBm25Response({
      results: [{ id: 'p1', score: 1 }],
      capability: { trueBm25: true },
    }, true, 200);
    expect(trueBm25Response.laneMeta.trueBm25).toBe(true);

    const ftsShimResponse = parseGoRetrievalBm25Response({
      results: [{ id: 'p1', score: 1 }],
      capability: { trueBm25: false },
    }, true, 200);
    expect(ftsShimResponse.laneMeta.trueBm25).toBe(false);
  });

  it('remains fully backward-compatible with a response carrying none of the new fields', () => {
    const result = parseGoRetrievalBm25Response({
      results: [{ id: 'p1', source_ref: 'src/a.ts', score: 0.5 }],
    }, true, 200);
    expect(result.ids).toEqual(['p1']);
    expect(result.ranked).toEqual([{ feature_id: 'p1', bm25_score: 0.5, rank: 0 }]);
    expect(result.laneMeta).toEqual({ lane: null, legacyLane: null, trueBm25: null });
  });

  it('still throws on a non-OK HTTP response, regardless of new fields', () => {
    expect(() => parseGoRetrievalBm25Response({ error: 'boom' }, false, 503))
      .toThrow('boom');
    expect(() => parseGoRetrievalBm25Response({}, false, 503))
      .toThrow('BM25 service returned 503');
  });

  it('falls back to source_ref when id is absent, same as the pre-refactor behavior', () => {
    const result = parseGoRetrievalBm25Response({
      results: [{ source_ref: 'src/only-source-ref.ts', score: 0.2 }],
    }, true, 200);
    expect(result.ids).toEqual(['src/only-source-ref.ts']);
  });

  it('handles an empty results array without throwing', () => {
    const result = parseGoRetrievalBm25Response({ results: [] }, true, 200);
    expect(result.ids).toEqual([]);
    expect(result.ranked).toEqual([]);
  });
});
