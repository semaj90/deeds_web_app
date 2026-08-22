import { describe, expect, it } from 'vitest';

import {
  temporalActionChecksum,
  type NextActionRecommendationV1,
} from './temporal-action-ledger.js';
import type { RecommendationOutcomeReceiptV1 } from './temporal-recommendation-outcome-runtime.js';
import { recommendAlternativeActionFromHistory } from './temporal-action-alternative-runtime.js';

const H = temporalActionChecksum;
const K1 = H('failed-k1');
const K2 = H('candidate-k2');
const K3 = H('candidate-k3');

function candidate(input: { id: string; executionKey: string; structural: number; downstream: number }) {
  return {
    execution_key: input.executionKey,
    candidate: {
      candidate_action_id: input.id,
      opcode: input.id === 'candidate:k2' ? 'RG_SEARCH' : 'AST_LOOKUP',
      query_class: 'EXACT_SYMBOL',
      target_class: 'symbol',
      semantic_affinity: 0.8,
      structural_affinity: input.structural,
      query_class_affinity: 1,
      expected_information_gain: 0.8,
      execution_cost: 0.1,
      estimated_latency: 0.1,
      mutation_risk: 0,
      token_savings: 0.8,
      dependency_readiness: 1,
      downstream_utility: input.downstream,
      latency_budget_ms: 1000,
      prior_failure_error_code: null,
      evidence_refs: [`candidate:${input.id}`],
      feature_revision: 'action-features:v1',
    },
  } as const;
}

function oldRecommendation(id: string): NextActionRecommendationV1 {
  return {
    schema: 'atlas.next-action-recommendation.v1',
    recommendation_id: id,
    workflow_id: 'wf:1',
    workflow_revision: 1,
    policy_family: 'DETERMINISTIC_FULL_SCAN',
    tang_claim: null,
    feature_revision: 'action-features:v1',
    candidates: [
      { candidate_action_id: 'candidate:k2', rank: 1, score: 0.8, execution_key: K2, evidence_refs: ['candidate:k2'] },
      { candidate_action_id: 'candidate:k3', rank: 2, score: 0.7, execution_key: K3, evidence_refs: ['candidate:k3'] },
    ],
    created_at: id === 'rec:k2:1' ? '2026-08-21T20:00:00.000Z' : '2026-08-21T20:02:00.000Z',
    producer_revision: 'recommend-policy:v1',
  };
}

function failedReceipt(id: string, observedAt: string): RecommendationOutcomeReceiptV1 {
  return {
    schema: 'atlas.recommendation-outcome-receipt.v1',
    recommendation_id: id,
    selected_action_id: 'candidate:k2',
    followed_recommendation: true,
    resulting_execution_key: K2,
    outcome: 'TEST_FAILED',
    downstream_success: false,
    evidence_refs: [`receipt:${id}`, 'workflow:failed'],
    observed_at: observedAt,
    producer_revision: 'outcome:v1',
  };
}

describe('alternative recommendation feedback loop', () => {
  it('lets K3 overtake a repeatedly selected K2 that failed downstream while K1 stays excluded', () => {
    const candidates = [
      candidate({ id: 'candidate:k2', executionKey: K2, structural: 0.82, downstream: 0.9 }),
      candidate({ id: 'candidate:k3', executionKey: K3, structural: 0.80, downstream: 0.7 }),
    ];

    const before = recommendAlternativeActionFromHistory({
      workflow_id: 'wf:1',
      workflow_revision: 1,
      failed_execution_key: K1,
      candidates,
      events: [],
      created_at: '2026-08-21T20:04:00.000Z',
      producer_revision: 'recommend-policy:v1',
    });
    expect(before.selected_execution_key).toBe(K2);

    const after = recommendAlternativeActionFromHistory({
      workflow_id: 'wf:1',
      workflow_revision: 1,
      failed_execution_key: K1,
      candidates,
      events: [],
      recommendation_observations: [
        { recommendation: oldRecommendation('rec:k2:1'), receipt: failedReceipt('rec:k2:1', '2026-08-21T20:01:00.000Z') },
        { recommendation: oldRecommendation('rec:k2:2'), receipt: failedReceipt('rec:k2:2', '2026-08-21T20:03:00.000Z') },
      ],
      recommendation_policy_revision: 'recommend-policy:v1',
      created_at: '2026-08-21T20:05:00.000Z',
      producer_revision: 'recommend-policy:v1',
    });

    expect(after.excluded_execution_keys).toContain(K1);
    expect(after.recommendation.candidates.some((row) => row.execution_key === K1)).toBe(false);
    expect(after.selected_execution_key).toBe(K3);
    expect(after.selected_candidate_action_id).toBe('candidate:k3');
  });

  it('fails closed instead of importing recommendation evidence across policy revisions', () => {
    expect(() => recommendAlternativeActionFromHistory({
      workflow_id: 'wf:1',
      workflow_revision: 1,
      failed_execution_key: K1,
      candidates: [candidate({ id: 'candidate:k2', executionKey: K2, structural: 0.82, downstream: 0.9 })],
      events: [],
      recommendation_observations: [
        { recommendation: oldRecommendation('rec:k2:1'), receipt: failedReceipt('rec:k2:1', '2026-08-21T20:01:00.000Z') },
      ],
      recommendation_policy_revision: 'recommend-policy:v2',
      created_at: '2026-08-21T20:05:00.000Z',
      producer_revision: 'recommend-policy:v2',
    })).toThrow('RECOMMENDATION_HISTORY_POLICY_REVISION_MISMATCH');
  });
});
