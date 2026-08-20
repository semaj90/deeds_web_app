import { describe, expect, it } from 'vitest';
import { extractPolicyPattern, policyPatternAsHmmEmissions } from './policy-pattern-extractor.js';

const fixture = {
  schema: 'atlas.policy-pattern-input.v1' as const,
  queryClass: 'code-repair',
  classifier: { naiveBayes: 0.8, logistic: 0.6, margin: 0.2, abstain: false },
  hmmPosterior: { TRACE: 0.7, REPAIR: 0.2 },
  retrieval: {
    bm25: 4.0,
    bm42Experimental: 2.0,
    denseCosine: 0.8,
    latent128Affinity: 0.75,
    latent64Affinity: 0.7,
    rerankerScore: 3.0,
  },
  structural: {
    astEvidence: 0.9,
    quaternionAffinity: 0.7,
    pageRank: 2,
    hitsHub: 1,
    hitsAuthority: 3,
    communityAgreement: 0.8,
    naryHyperedgeCoverage: 0.6,
  },
  execution: { compileFailed: true, testFailed: false, retryCount: 1, historicalSuccess: 0.7 },
  resource: { vramPressure: 0.8, contextPressure: 0.4, latencyPressure: 0.5, cacheHitRatio: 0.6 },
  revisions: { workspaceRevision: 'ws1', featureRevision: 'f1', graphRevision: 'g1', representationRevision: 'sem1' },
};

describe('policy pattern extractor', () => {
  it('uses HMM posterior only as state evidence', () => {
    const pattern = extractPolicyPattern(fixture, 'test');
    expect(pattern.stateHint).toBe('TRACE');
    expect(pattern.stateConfidence).toBeCloseTo(0.7);
  });

  it('keeps BM25/BM42 disagreement visible rather than averaging it away', () => {
    const pattern = extractPolicyPattern(fixture, 'test');
    expect(pattern.lexicalStrength).toBeGreaterThan(0);
    expect(pattern.lexicalDisagreement).toBeGreaterThan(0);
  });

  it('measures latent agreement against canonical dense evidence without promoting latent vectors', () => {
    const pattern = extractPolicyPattern(fixture, 'test');
    expect(pattern.semanticStrength).toBeCloseTo(0.9);
    expect(pattern.lowRankAgreement).toBeGreaterThan(0.9);
  });

  it('combines PageRank/HITS only into a policy pattern feature, not a new graph relation', () => {
    const pattern = extractPolicyPattern(fixture, 'test');
    expect(pattern.graphAuthorityStrength).toBeGreaterThan(0);
    expect(pattern.graphPartitionStrength).toBe(0.8);
  });

  it('derives bounded HMM emission hints without changing transition legality', () => {
    const pattern = extractPolicyPattern(fixture, 'test');
    const emissions = policyPatternAsHmmEmissions(pattern);
    expect(Object.values(emissions).every((value) => value != null && value >= 0 && value <= 1)).toBe(true);
    expect(emissions.TRACE).toBeGreaterThan(0);
    expect(emissions.RECOVER).toBeGreaterThan(0);
  });
});
