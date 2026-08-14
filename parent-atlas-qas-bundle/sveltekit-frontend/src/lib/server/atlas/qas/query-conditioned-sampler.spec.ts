import { describe, expect, it } from 'vitest';
import type { QasCandidateFeatureV1 } from './contracts';
import {
  markExactPromotion,
  proposalWeight,
  sampleQueryConditionedCandidates
} from './query-conditioned-sampler';

const rows: QasCandidateFeatureV1[] = Array.from({ length: 20 }, (_, i) => ({
  canonicalId: `packet:${i}`,
  semanticAffinity: i / 20,
  graphAffinity: (20 - i) / 20,
  domainAffinity: i % 2 ? 0.9 : 0.2,
  processAffinity: i % 3 ? 0.6 : 0.1,
  executionPrior: i % 4 ? 0.8 : 0.1,
  evidenceRefs: [`evidence:${i}`]
}));

const options = {
  requestId: 'req-1',
  policyRevision: 'qas-policy-v1',
  featureRevision: 'feature-v1',
  seed: 42,
  budget: 5,
  weights: {
    semantic: 1,
    graph: 1,
    domain: 1,
    process: 0.5,
    execution: 0.5
  }
};

describe('query-conditioned sampler', () => {
  it('is deterministic for a fixed seed', () => {
    expect(
      sampleQueryConditionedCandidates(rows, options)
    ).toEqual(
      sampleQueryConditionedCandidates(rows, options)
    );
  });

  it('respects the sample budget', () => {
    const result = sampleQueryConditionedCandidates(rows, options);
    expect(result.sampledCount).toBe(5);
    expect(result.candidates.filter((x) => x.sampled)).toHaveLength(5);
  });

  it('keeps proposal weights positive', () => {
    for (const row of rows) {
      expect(proposalWeight(row, options.weights)).toBeGreaterThan(0);
    }
  });

  it('does not claim exact evidence before canonical promotion', () => {
    const result = sampleQueryConditionedCandidates(rows, options);
    expect(result.candidates.some((x) => x.evidenceState === 'EXACT_PROMOTED')).toBe(false);
  });

  it('marks only canonical IDs confirmed by the exact owner', () => {
    const result = sampleQueryConditionedCandidates(rows, options);
    const sampled = result.candidates.find((x) => x.sampled)!;
    const promoted = markExactPromotion(result, new Set([sampled.canonicalId]));

    expect(
      promoted.candidates.find((x) => x.canonicalId === sampled.canonicalId)?.evidenceState
    ).toBe('EXACT_PROMOTED');
  });
});
