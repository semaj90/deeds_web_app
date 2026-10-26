import { describe, it, expect } from 'vitest';
import { retrieveBM25 } from '$lib/server/retrieval/retrieve-candidates';

describe('retrieveBM25 live PostgreSQL proof', () => {
  it('executes a real FTS query against legal_ai_db and validates scoreSource is postgres_fts', async () => {
    const results = await retrieveBM25('retrieval search');
    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].scoreSource).toBe('postgres_fts');
    expect(results[0].score).toBeGreaterThan(0);
    expect(typeof results[0].sourceRef).toBe('string');
  });

  it('sanitizes boolean characters and raw syntax without failing or throwing error', async () => {
    const results = await retrieveBM25('retrieval & | ! (search)');
    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].scoreSource).toBe('postgres_fts');
  });

  it('handles empty query cleanly without throwing', async () => {
    const emptyResults = await retrieveBM25('');
    expect(emptyResults).toEqual([]);
  });

  it('handles zero-hit queries gracefully without unhandled exception', async () => {
    const results = await retrieveBM25('xyznonexistenttoken999999');
    expect(Array.isArray(results)).toBe(true);
  });
});
