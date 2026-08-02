import { describe, expect, it } from 'vitest';
import { asUuid, buildTraceDynamicContextRecommendation } from './trace-dynamic-context-audit.js';

describe('trace-dynamic-context audit helper', () => {
  it('keeps trace ids UUID-only for durable tool records', () => {
    expect(asUuid('550e8400-e29b-41d4-a716-446655440000')).toBe('550e8400-e29b-41d4-a716-446655440000');
    expect(asUuid('workspace-revision-1842')).toBeUndefined();
  });

  it('builds a bounded recommendation bundle from validation failures', () => {
    const result = {
      validation: {
        status: 'PARTIAL_PROVEN',
        failedGates: ['KB_TRACE_SEARCH_CANONICAL_JOIN', 'KB_TRACE_SEARCH_NONEMPTY_CONTENT'],
        unresolvedClaims: ['Need non-empty Postgres content after join-back'],
      },
      evidence: [
        {
          kind: 'postgres_join_back',
          lane: 'lexical',
          status: 'PARTIAL_PROVEN',
          source: 'atlas_packets',
          path: 'src/routes/api/trace',
          symbol: 'trace_dynamic_context',
        },
      ],
    } as any;

    const recommendation = buildTraceDynamicContextRecommendation(result, 'packet');

    expect(recommendation.kind).toBe('missing_gate');
    expect(recommendation.family).toBe('packet');
    expect(recommendation.likelyCause).toContain('KB_TRACE_SEARCH_CANONICAL_JOIN');
    expect(recommendation.evidenceRefs).toHaveLength(1);
    expect(recommendation.validationPlan).toEqual(['Need non-empty Postgres content after join-back']);
    expect(recommendation.safetyChecks).toHaveLength(3);
  });
});
