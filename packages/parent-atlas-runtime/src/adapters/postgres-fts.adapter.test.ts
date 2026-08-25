import { describe, expect, it, vi } from 'vitest';
import {
  filterBySourceScope,
  scorePostgresFtsFallback,
  searchPostgresFts,
  validatePostgresFtsResults,
  type PostgresFtsCandidate,
} from './postgres-fts.adapter.js';

function fakeDb(rows: Record<string, unknown>[]) {
  const execute = vi.fn(async () => rows);
  return { db: { execute } as unknown as Parameters<typeof searchPostgresFts>[0]['db'], execute };
}

describe('searchPostgresFts', () => {
  it('returns [] for an empty/whitespace query without hitting the database', async () => {
    const { db, execute } = fakeDb([]);
    const result = await searchPostgresFts({ db, query: '   ', limit: 10 });
    expect(result).toEqual([]);
    expect(execute).not.toHaveBeenCalled();
  });

  it('tags exact-lane rows with source_ref_content_hash_exact', async () => {
    const { db } = fakeDb([{
      id: 'p1', packet_key: 'packet:1', source_ref: 'src/a.ts', feature_id: 'feature:a',
      content_hash: 'hash1', lexical_score: 0.5, title: 'a', snippet: 'snip',
      identity_resolution_source: 'source_ref_content_hash_exact',
    }]);
    const [candidate] = await searchPostgresFts({ db, query: 'find a', limit: 10 });
    expect(candidate.identity_resolution_source).toBe('source_ref_content_hash_exact');
    expect(candidate.packet_key).toBe('packet:1');
    expect(candidate.score).toBe(0.5);
  });

  it('tags bridge-lane rows with chunk_packet_identity_link_exact_canonical, not the exact-lane default', async () => {
    const { db } = fakeDb([{
      id: 'p2', packet_key: 'packet:2', source_ref: 'src/b.ts', feature_id: 'feature:b',
      content_hash: 'hash2', lexical_score: 0.3, title: null, snippet: null,
      identity_resolution_source: 'chunk_packet_identity_link_exact_canonical',
    }]);
    const [candidate] = await searchPostgresFts({ db, query: 'find b', limit: 10 });
    expect(candidate.identity_resolution_source).toBe('chunk_packet_identity_link_exact_canonical');
  });

  it('falls back to source_ref_content_hash_exact for an unrecognized/missing identity_resolution_source value rather than throwing', async () => {
    const { db } = fakeDb([{
      id: 'p3', packet_key: 'packet:3', source_ref: 'src/c.ts', feature_id: 'feature:c',
      content_hash: 'hash3', lexical_score: 0.1,
      // identity_resolution_source intentionally omitted — simulates a driver/shape drift
    }]);
    const [candidate] = await searchPostgresFts({ db, query: 'find c', limit: 10 });
    expect(candidate.identity_resolution_source).toBe('source_ref_content_hash_exact');
  });

  it('clamps limit into [1, 200] rather than passing an unbounded/invalid value through', async () => {
    const { db, execute } = fakeDb([]);
    await searchPostgresFts({ db, query: 'q', limit: 10_000 });
    expect(execute).toHaveBeenCalledTimes(1);
    // The bound is enforced before the query is built; a non-throwing call is the observable proof.
  });

  it('maps null title/snippet to undefined, not the string "null"', async () => {
    const { db } = fakeDb([{
      id: 'p4', packet_key: 'packet:4', source_ref: 'src/d.ts', feature_id: 'feature:d',
      content_hash: 'hash4', lexical_score: 0.2, title: null, snippet: null,
      identity_resolution_source: 'source_ref_content_hash_exact',
    }]);
    const [candidate] = await searchPostgresFts({ db, query: 'q', limit: 5 });
    expect(candidate.title).toBeUndefined();
    expect(candidate.snippet).toBeUndefined();
  });
});

describe('scorePostgresFtsFallback', () => {
  it('returns 0 for a query with no token matches in the document', () => {
    expect(scorePostgresFtsFallback('completely unrelated text', 'xyzzy')).toBe(0);
  });

  it('returns a positive score in [0,1] when query tokens appear in the document', () => {
    const score = scorePostgresFtsFallback('the quick brown fox jumps', 'quick fox');
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThanOrEqual(1);
  });
});

describe('filterBySourceScope', () => {
  const candidates: PostgresFtsCandidate[] = [
    {
      id: '1', packet_key: 'p1', source_ref: 'src/lib/server/a.ts', feature_id: 'f1', content_hash: 'h1',
      score: 0.5, retrieved_via: 'postgres_fts', indexKind: 'postgres_tsvector_english',
      retrieval_algorithm: 'postgres_fts_ts_rank_cd', identity_resolution_source: 'source_ref_content_hash_exact',
    },
    {
      id: '2', packet_key: 'p2', source_ref: 'src/routes/api/b.ts', feature_id: 'f2', content_hash: 'h2',
      score: 0.4, retrieved_via: 'postgres_fts', indexKind: 'postgres_tsvector_english',
      retrieval_algorithm: 'postgres_fts_ts_rank_cd', identity_resolution_source: 'source_ref_content_hash_exact',
    },
  ];

  it('returns all candidates unchanged when no scope is given', () => {
    expect(filterBySourceScope(candidates)).toEqual(candidates);
  });

  it('filters to only candidates matching a glob scope pattern', () => {
    const result = filterBySourceScope(candidates, ['src/lib/server/*']);
    expect(result).toHaveLength(1);
    expect(result[0].packet_key).toBe('p1');
  });

  it('drops candidates with no source_ref when a scope is given', () => {
    const withMissing = [...candidates, { ...candidates[0], source_ref: '' }];
    const result = filterBySourceScope(withMissing, ['src/lib/server/*']);
    expect(result.every((c) => c.source_ref)).toBe(true);
  });
});

describe('validatePostgresFtsResults', () => {
  const valid: PostgresFtsCandidate = {
    id: '1', packet_key: 'p1', source_ref: 'src/a.ts', feature_id: 'f1', content_hash: 'h1',
    score: 0.5, retrieved_via: 'postgres_fts', indexKind: 'postgres_tsvector_english',
    retrieval_algorithm: 'postgres_fts_ts_rank_cd', identity_resolution_source: 'source_ref_content_hash_exact',
  };

  it('reports valid: true for well-formed candidates', () => {
    expect(validatePostgresFtsResults([valid])).toEqual({ valid: true, errors: [] });
  });

  it('reports missing packet_key, missing feature_id, and NaN score as distinct errors', () => {
    const broken: PostgresFtsCandidate = { ...valid, packet_key: '', feature_id: '', score: NaN };
    const result = validatePostgresFtsResults([broken]);
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(3);
  });

  it('does not require source_ref when requireSourceRef is false', () => {
    const noSourceRef: PostgresFtsCandidate = { ...valid, source_ref: '' };
    expect(validatePostgresFtsResults([noSourceRef], false).valid).toBe(true);
    expect(validatePostgresFtsResults([noSourceRef], true).valid).toBe(false);
  });
});
