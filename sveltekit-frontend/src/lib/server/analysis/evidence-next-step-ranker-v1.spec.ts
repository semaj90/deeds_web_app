import { describe, expect, it } from 'vitest';
import { rankEvidenceNextStepsV1 } from './evidence-next-step-ranker-v1.js';

describe('rankEvidenceNextStepsV1', () => {
  it('uses the existing DIAGNOSE transition priors after extraction', () => {
    expect(rankEvidenceNextStepsV1({ currentState: 'DIAGNOSE', extractedFactCount: 2 })).toEqual([
      {
        state: 'RETRIEVE',
        transitionPrior: 0.9,
        extractionStatus: 'FACTS_RETURNED',
        admission: 'PROPOSAL_ONLY',
      },
      {
        state: 'RECOVER',
        transitionPrior: 0.1,
        extractionStatus: 'FACTS_RETURNED',
        admission: 'PROPOSAL_ONLY',
      },
    ]);
  });

  it('marks empty extraction as unverified input without inventing a confidence score', () => {
    const ranked = rankEvidenceNextStepsV1({ currentState: 'DIAGNOSE', extractedFactCount: 0 });

    expect(ranked.map((step) => step.state)).toEqual(['RECOVER', 'RETRIEVE']);
    expect(ranked.map((step) => step.extractionStatus)).toEqual(['NO_FACTS_RETURNED', 'NO_FACTS_RETURNED']);
    expect(ranked.every((step) => step.admission === 'PROPOSAL_ONLY')).toBe(true);
    expect(ranked.some((step) => 'successRate' in step || 'confidence' in step)).toBe(false);
  });

  it('fails closed for invalid or unbounded inputs', () => {
    expect(rankEvidenceNextStepsV1({ currentState: 'EXECUTE', extractedFactCount: 61 })).toEqual([]);
    expect(rankEvidenceNextStepsV1({ currentState: 'UNKNOWN', extractedFactCount: 1 })).toEqual([]);
  });
});
