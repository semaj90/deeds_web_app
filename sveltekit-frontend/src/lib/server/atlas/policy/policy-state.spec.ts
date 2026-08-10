import { describe, expect, it } from 'vitest';
import {
  buildPolicyStateTensor,
  buildPolicyStateVector,
  POLICY_FEATURES,
  POLICY_FEATURE_REVISION,
  POLICY_STATE_TENSOR_REVISION,
  PolicyStateTensorSchema,
} from './policy-state';
import type { PolicyStateInput } from './policy-types';

const input: PolicyStateInput = {
  okf: { naiveBayesScore: 0.7, logisticRegressionScore: 0.9, fitMargin: 0.2, decision: 'ACCEPT' },
  hmm: { stateHint: 'TRACE' },
  retrieval: { bestCosine: 0.6, cosineMargin: 0.2, lexicalHitCount: 4, rrfConfidence: 0.8 },
  structural: { astEvidence: 1, symbolMatch: 1, exactPathMatch: 0 },
  graph: { seedCount: 3, shortestPathAvailable: true, communityAgreement: 0.7, authority: 2, hopBudgetRemaining: 2 },
  execution: { compileFailed: true, testFailed: false, retryCount: 1, historicalSuccess: 0.5 },
  resource: { vramPressure: 0.4, contextPressure: 0.3, latencyPressure: 0.2, cacheHitRatio: 0.6 },
};

describe('buildPolicyStateVector', () => {
  it('builds a finite bounded control tensor', () => {
    const state = buildPolicyStateVector(input);
    expect(state.values.length).toBe(POLICY_FEATURES.length);
    expect([...state.values].every(Number.isFinite)).toBe(true);
    expect(state.stateHint).toBe('TRACE');
    expect(state.revision).toBe(POLICY_STATE_TENSOR_REVISION);
    expect(state.featureRevision).toBe(POLICY_FEATURE_REVISION);
    expect(state.featureCount).toBe(POLICY_FEATURES.length);
  });

  it('validates the tensor contract schema', () => {
    const state = buildPolicyStateTensor(input);
    expect(() => PolicyStateTensorSchema.parse(state)).not.toThrow();
  });
});
