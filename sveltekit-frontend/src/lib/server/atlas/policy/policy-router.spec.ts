import { describe, expect, it } from 'vitest';
import { buildPolicyStateVector } from './policy-state';
import { routePolicy } from './policy-router';
import type { PolicyStateInput } from './policy-types';

function state(hmm: PolicyStateInput['hmm']['stateHint'], pressure = 0.2): PolicyStateInput {
  return {
    okf: { naiveBayesScore: 0.5, logisticRegressionScore: 0.8, fitMargin: 0.3, decision: 'ACCEPT' },
    hmm: { stateHint: hmm },
    retrieval: { bestCosine: 0.7, cosineMargin: 0.15, lexicalHitCount: 5, rrfConfidence: 0.8 },
    structural: { astEvidence: 0.8, symbolMatch: 1, exactPathMatch: 0 },
    graph: { seedCount: 4, shortestPathAvailable: true, communityAgreement: 0.7, authority: 1, hopBudgetRemaining: 2 },
    execution: { compileFailed: false, testFailed: false, retryCount: 0, historicalSuccess: 0.5 },
    resource: { vramPressure: pressure, contextPressure: pressure, latencyPressure: pressure, cacheHitRatio: 0.5 },
  };
}

describe('routePolicy', () => {
  it('keeps TRACE inside the finite allowed action set', () => {
    const decision = routePolicy(buildPolicyStateVector(state('TRACE')));
    expect(['GRAPH_TRACE', 'GRAPH_EXPAND', 'FAST_RERANK', 'INSPECT_SOURCE', 'RECOVER', 'TERMINATE']).toContain(decision.action);
    expect(decision.maxParallelToolCalls).toBe(3);
  });

  it('reduces the budget under pressure', () => {
    const decision = routePolicy(buildPolicyStateVector(state('RECOVER', 0.95)));
    expect(decision.budget).toBe('SMALL');
  });
});
