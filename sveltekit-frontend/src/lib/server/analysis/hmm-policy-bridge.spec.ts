import { describe, expect, it } from 'vitest';
import { withOkfHmmEvidence } from './hmm-policy-bridge';

describe('withOkfHmmEvidence', () => {
  it('maps existing OKF/HMM provenance into the policy contract', () => {
    const result = withOkfHmmEvidence({
      retrieval: { bestCosine: 0.5, cosineMargin: 0.1, lexicalHitCount: 2, rrfConfidence: 0.6 },
      structural: { astEvidence: 1, symbolMatch: 1, exactPathMatch: 0 },
      graph: { seedCount: 1, shortestPathAvailable: false, communityAgreement: 0.3, authority: 0, hopBudgetRemaining: 1 },
      execution: { compileFailed: false, testFailed: false, retryCount: 0, historicalSuccess: 0 },
      resource: { vramPressure: 0.1, contextPressure: 0.1, latencyPressure: 0.1, cacheHitRatio: 0.2 },
    }, {
      heuristic_prior_score: 0.6,
      heuristic_fit_score: 0.8,
      heuristic_fit_margin: 0.2,
      fit_decision: 'ACCEPT',
      hmm_observation: 'OKF_FIT_STRONG',
      stateHint: 'TRACE',
    });
    expect(result.hmm.stateHint).toBe('TRACE');
    // PolicyStateInput.okf's own field names were deliberately NOT renamed this pass -- see
    // OkfHmmPolicyEvidence's doc comment in hmm-policy-bridge.ts.
    expect(result.okf.logisticRegressionScore).toBe(0.8);
  });
});
