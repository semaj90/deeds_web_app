import { describe, expect, it } from 'vitest';
import {
  buildKeywordBundle,
  buildQueryUnderstandingV1,
  buildQueryPlanV1,
  normalizeRetrievalSearchRequest,
  QueryPlanV1Schema,
} from './search-contract.js';

describe('search-fabric contracts', () => {
  it('builds a deterministic KeywordBundleV1 without inventing authority', () => {
    const first = buildKeywordBundle({ query: 'validateSession auth token' });
    const second = buildKeywordBundle({ query: 'validateSession auth token' });

    expect(first).toEqual(second);
    expect(first.schema).toBe('atlas.keyword-bundle.v1');
    expect(first.exactKeywords).toContain('auth');
    expect(first.normalizedKeywords).toEqual(expect.arrayContaining(['validate', 'session']));
  });

  it('decomposes identifiers and paths without model calls', () => {
    const understanding = buildQueryUnderstandingV1({
      query: 'BITFROST_WARM_KEY src/lib/server/cache/atlas-reward-cache.ts',
    });

    expect(understanding.schema).toBe('atlas.query-understanding.v1');
    expect(understanding.identifierTerms).toContain('BITFROST_WARM_KEY');
    expect(understanding.pathTerms).toContain('src/lib/server/cache/atlas-reward-cache.ts');
    expect(understanding.semanticRepresentation).toBe('semantic_768');
    expect(understanding.negativeTerms).toEqual([]);
  });

  it('freezes a stable QueryPlanV1 and rejects authority promotion', () => {
    const request = normalizeRetrievalSearchRequest({
      query: 'find validateSession auth',
      lanes: ['lexical', 'dense'],
      finalTopK: 5,
      rerankTopK: 5,
      pageSize: 5,
    });
    const first = buildQueryPlanV1({
      request,
      workspaceRevision: null,
    });
    const second = buildQueryPlanV1({
      request,
      workspaceRevision: null,
    });

    expect(first).toEqual(second);
    expect(QueryPlanV1Schema.parse(first)).toEqual(first);
    expect(first.planChecksum).toMatch(/^[a-f0-9]{64}$/);
    expect(first.queryUnderstanding.producerRevision).toBe('atlas.query-understanding.v1');
    expect(first.canonicalAuthority).toBe(false);
    expect(first.writesPerformed).toBe(false);
    expect(first.promotionAuthorized).toBe(false);
    expect(first.workspaceRevision).toBeNull();
  });

  it('changes the plan checksum when the admitted workspace frame changes', () => {
    const request = normalizeRetrievalSearchRequest({ query: 'source revision' });
    const unbound = buildQueryPlanV1({ request, workspaceRevision: null });
    const bound = buildQueryPlanV1({ request, workspaceRevision: 'sha256:admitted-frame' });

    expect(bound.planChecksum).not.toBe(unbound.planChecksum);
    expect(bound.workspaceRevision).toBe('sha256:admitted-frame');
    expect(bound.canonicalAuthority).toBe(false);
  });
});
