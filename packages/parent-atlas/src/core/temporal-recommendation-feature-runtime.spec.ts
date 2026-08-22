import { describe, expect, it } from 'vitest';

import {
  temporalActionChecksum,
  type NextActionRecommendationV1,
  type RecommendationOutcomeReceiptV1,
} from './temporal-action-ledger.js';
import { compileActionFeatureRowWithRecommendationHistory } from './temporal-recommendation-feature-runtime.js';

const K = temporalActionChecksum('rg-key');

function candidate() {
  return {
    candidate_action_id: 'candidate:rg',
    opcode: 'RG_SEARCH',
    query_class: 'EXACT_SYMBOL',
    target_class: 'symbol',
    semantic_affinity: 0.8,
    structural_affinity: 0.9,
    query_class_affinity: 1,
    expected_information_gain: 0.9,
    execution_cost: 0.1,
    estimated_latency: 0.2,
    mutation_risk: 0,
    token_savings: 0.8,
    dependency_readiness: 1,
    downstream_utility: 0.8,
    latency_budget_ms: 1000,
    prior_failure_error_code: null,
    evidence_refs: ['candidate:rg'],
    feature_revision: 'action-features:v1',
  } as const;
}

function recommendation(id: string): NextActionRecommendationV1 {
  return {
    schema: 'atlas.next-action-recommendation.v1',
    recommendation_id: id,
    workflow_id: 'wf:1',
    workflow_revision: 1,
    policy_family: 'DETERMINISTIC_FULL_SCAN',
    tang_claim: null,
    feature_revision: 'action-features:v1',
    candidates: [{
      candidate_action_id: 'candidate:rg',
      rank: 1,
      score: 0.7,
      execution_key: K,
      evidence_refs: ['e:rg'],
    }],
    created_at: '2026-08-21T20:00:00.000Z',
    producer_revision: 'recommend-policy:v1',
  };
}

function receipt(id: string, success: boolean): RecommendationOutcomeReceiptV1 {
  return {
    schema: 'atlas.recommendation-outcome-receipt.v1',
    recommendation_id: id,
    selected_action_id: 'candidate:rg',
    followed_recommendation: true,
    resulting_execution_key: K,
    outcome: success ? 'SUCCESS_EXACT' : 'TEST_FAILED',
    downstream_success: success,
    evidence_refs: [`receipt:${id}`],
    observed_at: '2026-08-21T20:01:00.000Z',
    producer_revision: 'outcome:v1',
  };
}

describe('recommendation-conditioned action features', () => {
  it('updates only downstream utility from observed recommendation outcomes', () => {
    const row = compileActionFeatureRowWithRecommendationHistory({
      candidate: candidate(),
      action_events: [],
      recommendation_observations: [
        { recommendation: recommendation('rec:1'), receipt: receipt('rec:1', false) },
      ],
      policy_revision: 'recommend-policy:v1',
    });

    // One prior observation at 0.8 plus one failure -> 0.4.
    expect(row.downstream_utility).toBeCloseTo(0.4);
    expect(row.semantic_affinity).toBe(0.8);
    expect(row.structural_affinity).toBe(0.9);
    expect(row.query_class_affinity).toBe(1);
    expect(row.historical_success_rate).toBe(0);
    expect(row.cache_hit_probability).toBe(0);
    expect(row.last_failure_similarity).toBe(0);
    expect(row.execution_cost).toBe(0.1);
    expect(row.mutation_risk).toBe(0);
    expect(row.evidence_refs).toContain('receipt:rec:1');
    expect(row.evidence_refs.some((ref) => ref.startsWith('recommendation-aggregate:'))).toBe(true);
  });

  it('retains the original action feature row when no downstream result was observed', () => {
    const row = compileActionFeatureRowWithRecommendationHistory({
      candidate: candidate(),
      action_events: [],
      recommendation_observations: [{ recommendation: recommendation('rec:1'), receipt: null }],
      policy_revision: 'recommend-policy:v1',
    });

    expect(row.downstream_utility).toBe(0.8);
    expect(row.evidence_refs).toEqual(['candidate:rg']);
  });

  it('blends multiple outcomes deterministically without claiming causality', () => {
    const row = compileActionFeatureRowWithRecommendationHistory({
      candidate: candidate(),
      action_events: [],
      recommendation_observations: [
        { recommendation: recommendation('rec:1'), receipt: receipt('rec:1', true) },
        { recommendation: { ...recommendation('rec:2'), created_at: '2026-08-21T20:02:00.000Z' }, receipt: { ...receipt('rec:2', false), observed_at: '2026-08-21T20:03:00.000Z' } },
      ],
      policy_revision: 'recommend-policy:v1',
    });

    // Prior 0.8 + one success across two observations -> 1.8 / 3.
    expect(row.downstream_utility).toBeCloseTo(0.6);
  });
});
