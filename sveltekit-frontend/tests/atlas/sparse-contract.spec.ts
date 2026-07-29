import { describe, expect, it } from 'vitest';
import { assertSafeCollection, assertSparseApplyContext } from '../../scripts/atlas/sparse/lib/collection-guard.mjs';
import { tokenizeCodeAware } from '../../scripts/atlas/sparse/lib/tokenization.mjs';

describe('sparse contract guards', () => {
  it('rejects the degraded legacy dense collection', () => {
    expect(() => assertSafeCollection('codebase_chunks_768')).toThrow(/degraded collection/i);
  });

  it('requires bounded apply metadata before mutation', () => {
    expect(() => assertSparseApplyContext({ collection: 'codebase_chunks_768_v2', apply: true, limit: 10 })).toThrow(/corpusRevision/i);
    const plan = assertSparseApplyContext({
      collection: 'codebase_chunks_768_v2',
      apply: false,
      limit: 10,
    });
    expect(plan.apply).toBe(false);
    expect(plan.collection).toBe('codebase_chunks_768_v2');
  });

  it('tokenizes code-aware identifiers into stable lexical pieces', () => {
    const tokens = tokenizeCodeAware('QDRANT_CONTENT_VECTOR_NAME retrieveAllCandidates');
    expect(tokens).toEqual(expect.arrayContaining(['qdrant', 'content', 'vector', 'name', 'retrieve', 'all', 'candidates']));
  });
});
