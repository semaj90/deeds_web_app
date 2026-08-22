import { describe, expect, it } from 'vitest';

import {
  temporalActionChecksum,
  type NextActionRecommendationV1,
} from './temporal-action-ledger.js';
import {
  buildFinalRecommendationOutcomeReceipt,
  recommendationOutcomeReceiptChecksum,
} from './temporal-recommendation-outcome-runtime.js';

const K1 = 'a'.repeat(64);
const K2 = 'b'.repeat(64);

function recommendation(): NextActionRecommendationV1 {
  return {
    schema: 'atlas.next-action-recommendation.v1',
    recommendation_id: 'rec:test',
    workflow_id: 'wf:1',
    workflow_revision: 3,
    policy_family: 'DETERMINISTIC_FULL_SCAN',
    tang_claim: null,
    feature_revision: 'features:v1',
    candidates: [
      { candidate_action_id: 'candidate:rg', rank: 1, score: 0.8, execution_key: K1, evidence_refs: ['e:rg'] },
      { candidate_action_id: 'candidate:graph', rank: 2, score: 0.5, execution_key: K2, evidence_refs: ['e:graph'] },
    ],
    created_at: '2026-08-21T20:00:00.000Z',
    producer_revision: 'recommend:v1',
  };
}

describe('recommendation outcome runtime', () => {
  it('records downstream success without inventing an action outcome', () => {
    const receipt = buildFinalRecommendationOutcomeReceipt({
      recommendation: recommendation(),
      selected_action_id: 'candidate:rg',
      resulting_execution_key: K1,
      downstream_success: true,
      observed_at: '2026-08-21T20:01:00.000Z',
      producer_revision: 'outcome:v1',
      evidence_refs: ['workflow:success'],
    });

    expect(receipt.followed_recommendation).toBe(true);
    expect(receipt.downstream_success).toBe(true);
    expect(receipt.outcome).toBeNull();
    expect(receipt.evidence_refs).toContain('rec:test');
    expect(receipt.evidence_refs).toContain('workflow:success');
    expect(recommendationOutcomeReceiptChecksum(receipt)).toBe(temporalActionChecksum(receipt));
  });

  it('records a receipt-backed negative recommendation outcome', () => {
    const receipt = buildFinalRecommendationOutcomeReceipt({
      recommendation: recommendation(),
      selected_action_id: 'candidate:graph',
      resulting_execution_key: K2,
      downstream_success: false,
      outcome: 'TEST_FAILED',
      observed_at: '2026-08-21T20:02:00.000Z',
      producer_revision: 'outcome:v1',
      evidence_refs: ['action-event:failed-test'],
    });

    expect(receipt.followed_recommendation).toBe(false);
    expect(receipt.downstream_success).toBe(false);
    expect(receipt.outcome).toBe('TEST_FAILED');
  });

  it('rejects a selected action not present in the recommendation', () => {
    expect(() => buildFinalRecommendationOutcomeReceipt({
      recommendation: recommendation(),
      selected_action_id: 'candidate:missing',
      resulting_execution_key: K1,
      downstream_success: false,
      observed_at: '2026-08-21T20:03:00.000Z',
      producer_revision: 'outcome:v1',
    })).toThrow('RECOMMENDATION_SELECTED_ACTION_NOT_FOUND');
  });

  it('rejects execution key drift between recommendation and observed execution', () => {
    expect(() => buildFinalRecommendationOutcomeReceipt({
      recommendation: recommendation(),
      selected_action_id: 'candidate:rg',
      resulting_execution_key: K2,
      downstream_success: true,
      observed_at: '2026-08-21T20:04:00.000Z',
      producer_revision: 'outcome:v1',
    })).toThrow('RECOMMENDATION_SELECTED_EXECUTION_KEY_MISMATCH');
  });
});
