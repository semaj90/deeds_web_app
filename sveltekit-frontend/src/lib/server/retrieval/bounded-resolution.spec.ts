import { describe, expect, it } from 'vitest';

import {
  buildBoundedResolutionReceipt,
  deriveResolutionStatus,
  measureCandidateSetStability,
  type ResourceEnvelopeV1,
} from './bounded-resolution';

const envelope: ResourceEnvelopeV1 = {
  maxVramBytes: 6_000_000_000,
  maxContextTokens: 4_800,
  maxCandidates: 512,
  maxGraphHops: 3,
  maxHyperedges: 128,
  maxToolCalls: 12,
  maxWallMs: 5_000,
};

const canonical = (canonicalId: string) => ({ canonicalId, identityStatus: 'canonical' as const });

describe('bounded resolution', () => {
  it('computes Jaccard-distance stabilization over canonical candidate identity', () => {
    const stability = measureCandidateSetStability(
      [canonical('a'), canonical('b'), canonical('c')],
      [canonical('a'), canonical('b'), canonical('c')],
      128,
      256,
    );

    expect(stability.delta).toBe(0);
    expect(stability.stable).toBe(true);
    expect(stability.intersection).toBe(3);
    expect(stability.union).toBe(3);
  });

  it('reports a large delta when envelope expansion changes the candidate set', () => {
    const stability = measureCandidateSetStability(
      [canonical('a'), canonical('b')],
      [canonical('c'), canonical('d')],
      64,
      128,
    );

    expect(stability.delta).toBe(1);
    expect(stability.stable).toBe(false);
  });

  it('returns BOUNDARY_EXHAUSTED instead of pretending an unstable search proved no answer', () => {
    const result = deriveResolutionStatus({
      envelope,
      usage: { candidates: 512 },
      stability: {
        previousK: 256,
        currentK: 512,
        intersection: 100,
        union: 500,
        delta: 0.8,
        stable: false,
      },
      exactPromotionPassed: false,
      identityGapResolved: false,
    });

    expect(result.status).toBe('BOUNDARY_EXHAUSTED');
    expect(result.reasonCodes).toContain('BUDGET_CANDIDATES_EXHAUSTED');
  });

  it('gives revision conflict precedence over stability or exact-promotion claims', () => {
    const result = deriveResolutionStatus({
      envelope,
      usage: {},
      revisionConflict: true,
      exactPromotionPassed: true,
      identityGapResolved: true,
      stability: {
        previousK: 128,
        currentK: 256,
        intersection: 8,
        union: 8,
        delta: 0,
        stable: true,
      },
    });

    expect(result).toEqual({ status: 'REVISION_CONFLICT', reasonCodes: ['REVISION_MISMATCH'] });
  });

  it('produces a deterministic receipt checksum independent of set ordering', () => {
    const base = {
      requestId: 'req-1',
      revisions: {
        workspaceRevision: 'workspace:1',
        sourceRevision: 'source:1',
        graphRevision: 'graph:1',
        featureRevision: 'feature:1',
      },
      envelope,
      usage: { candidates: 128 },
      status: 'AMBIGUOUS' as const,
      reasonCodes: ['IDENTITY_NOT_YET_RESOLVED'],
    };

    const first = buildBoundedResolutionReceipt({
      ...base,
      selectedCanonicalIds: ['b', 'a'],
      unresolvedCanonicalIds: ['d', 'c'],
    });
    const second = buildBoundedResolutionReceipt({
      ...base,
      selectedCanonicalIds: ['a', 'b'],
      unresolvedCanonicalIds: ['c', 'd'],
    });

    expect(first.checksum).toBe(second.checksum);
    expect(first.selectedCanonicalIds).toEqual(['a', 'b']);
  });
});
