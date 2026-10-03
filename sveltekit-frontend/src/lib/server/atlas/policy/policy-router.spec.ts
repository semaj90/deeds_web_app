import { describe, expect, it } from 'vitest';
import { buildPolicyStateVector } from './policy-state';
import { routePolicy } from './policy-router';
import {
  BUDGET_TIERS,
  MODEL_TARGETS,
  POLICY_ACTIONS,
  type PolicyStateInput,
} from './policy-types';

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
  it('keeps the policy vocabulary finite and version-bounded', () => {
    expect(POLICY_ACTIONS).toHaveLength(12);
    expect(MODEL_TARGETS).toEqual(['NO_LLM', 'ORNITH', 'GEMMA4']);
    expect(BUDGET_TIERS).toEqual(['SMALL', 'MEDIUM', 'DEEP']);
  });

  it('applies a state-specific action mask before ranking', () => {
    const allowedByState: Record<PolicyStateInput['hmm']['stateHint'], string[]> = {
      LOCATE: ['LEXICAL_SEARCH', 'SEMANTIC_SEARCH', 'GRAPH_TRACE', 'FAST_RERANK', 'INSPECT_SOURCE', 'RECOVER', 'TERMINATE'],
      UNDERSTAND: ['SEMANTIC_SEARCH', 'GRAPH_TRACE', 'FAST_RERANK', 'DEEP_RERANK', 'INSPECT_SOURCE', 'RECOVER', 'TERMINATE'],
      TRACE: ['GRAPH_TRACE', 'GRAPH_EXPAND', 'FAST_RERANK', 'INSPECT_SOURCE', 'RECOVER', 'TERMINATE'],
      REPAIR: ['INSPECT_SOURCE', 'PATCH', 'COMPILE', 'TEST', 'RECOVER', 'TERMINATE'],
      VALIDATE: ['COMPILE', 'TEST', 'INSPECT_SOURCE', 'RECOVER', 'TERMINATE'],
      RECOVER: ['LEXICAL_SEARCH', 'SEMANTIC_SEARCH', 'GRAPH_EXPAND', 'DEEP_RERANK', 'INSPECT_SOURCE', 'RECOVER', 'TERMINATE'],
    };

    for (const [stateHint, allowed] of Object.entries(allowedByState) as Array<[PolicyStateInput['hmm']['stateHint'], string[]]>) {
      const decision = routePolicy(buildPolicyStateVector(state(stateHint)));
      expect(decision.rankedActions.map(({ action }) => action)).toEqual(expect.arrayContaining(allowed));
      expect(decision.rankedActions.every(({ action }) => allowed.includes(action))).toBe(true);
    }
  });

  it('uses the deterministic baseline when learned weights are absent', () => {
    const preferredByState: Record<PolicyStateInput['hmm']['stateHint'], string> = {
      LOCATE: 'SEMANTIC_SEARCH',
      UNDERSTAND: 'INSPECT_SOURCE',
      TRACE: 'GRAPH_TRACE',
      REPAIR: 'PATCH',
      VALIDATE: 'TEST',
      RECOVER: 'LEXICAL_SEARCH',
    };

    for (const [stateHint, preferred] of Object.entries(preferredByState) as Array<[PolicyStateInput['hmm']['stateHint'], string]>) {
      expect(routePolicy(buildPolicyStateVector(state(stateHint))).action).toBe(preferred);
    }
  });

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
