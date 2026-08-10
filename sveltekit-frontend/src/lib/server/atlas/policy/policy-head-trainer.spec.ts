import { describe, expect, it } from 'vitest';
import { trainPolicyHeads } from './policy-head-trainer.js';
import { POLICY_FEATURES } from './policy-state.js';
import type { RouteTraceTrainingRow } from './policy-training.js';

const ACTIONS = ['LEXICAL_SEARCH', 'SEMANTIC_SEARCH', 'GRAPH_TRACE', 'PATCH'] as const;
const MODELS = ['NO_LLM', 'ORNITH', 'GEMMA4'] as const;
const BUDGETS = ['SMALL', 'MEDIUM', 'DEEP'] as const;
const STATES = ['LOCATE', 'UNDERSTAND', 'TRACE', 'REPAIR'] as const;

function makeRow(index: number): RouteTraceTrainingRow {
  const action = ACTIONS[index % ACTIONS.length];
  const model = MODELS[index % MODELS.length];
  const budget = BUDGETS[index % BUDGETS.length];
  const stateHint = STATES[(index + 1) % STATES.length];
  const values = new Array(POLICY_FEATURES.length).fill(0);

  values[0 + ACTIONS.indexOf(action)] = 1;
  values[10 + MODELS.indexOf(model)] = 1;
  values[20 + BUDGETS.indexOf(budget)] = 1;

  return {
    revision: 'parent-atlas.policy-training-row.v1',
    trainingDigest: `digest:${index}`,
    traceId: `trace:${index}`,
    queryHash: `query:${index}`,
    query: `query ${index}`,
    revisions: {
      workspaceRevision: 'ws:1',
      sourceRevision: 'src:1',
      representationRevision: 'rep:1',
      graphRevision: 'graph:1',
      featureRevision: 'feat:1',
    },
    selectedState: 'RETRIEVE',
    selectedToolName: action,
    candidateTools: [action, 'RECOVER'],
    proposalId: `proposal:${index}`,
    executed: true,
    executionId: `exec:${index}`,
    resultClass: 'answer',
    resultCount: 1,
    sourceRefCount: 1,
    sourceRefs: [`source:${index}`],
    finalState: 'SYNTHESIZE',
    finalOutcome: 'success',
    policyAction: action,
    policyModel: model,
    policyBudget: budget,
    policyDecisionRevision: 'parent-atlas.policy-decision.v1',
    policyStateRevision: 'parent-atlas.policy-state.v1',
    policyFeatureRevision: 'parent-atlas.policy-features.v1',
    stateHint,
    featureCount: POLICY_FEATURES.length,
    features: POLICY_FEATURES,
    values: Float32Array.from(values),
    labelSource: 'EXECUTION',
    labelSourceRevision: 'labels:1',
    labelSourceRefs: [`ledger:${index}`],
    labelConfidence: 0.95,
    createdAt: new Date(`2026-08-10T12:00:${String(index).padStart(2, '0')}.000Z`).toISOString(),
  };
}

describe('policy head trainer', () => {
  it('learns tiny heads and beats the deterministic baseline on held-out rows', () => {
    const rows = Array.from({ length: 12 }, (_, index) => makeRow(index));
    const result = trainPolicyHeads(rows, {
      holdoutFraction: 0.25,
      learningRate: 0.3,
      epochs: 80,
      l2: 1e-4,
      seed: 'trainer-test',
    });

    expect(result.trainCount).toBe(9);
    expect(result.holdoutCount).toBe(3);
    expect(result.metrics.actionLearned.accuracy).toBeGreaterThanOrEqual(result.metrics.actionBaseline.accuracy);
    expect(result.metrics.modelLearned.accuracy).toBeGreaterThan(0.9);
    expect(result.metrics.budgetLearned.accuracy).toBeGreaterThan(0.9);
    expect(result.metrics.repairSuccessLearned.accuracy).toBeGreaterThanOrEqual(result.metrics.repairSuccessBaseline.accuracy);
  });
});
