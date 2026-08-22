import { describe, expect, it } from 'vitest';

import {
  temporalActionChecksum,
  type NextActionRecommendationV1,
  type RecommendationOutcomeReceiptV1,
} from './temporal-action-ledger.js';
import { aggregateHistoricalRecommendations } from './temporal-recommendation-history-runtime.js';

const K1 = temporalActionChecksum('k1');
const K2 = temporalActionChecksum('k2');

function recommendation(input: { id: string; createdAt: string; first?: string }): NextActionRecommendationV1 {
  const first = input.first ?? 'candidate:rg';
  const second = first === 'candidate:rg' ? 'candidate:graph' : 'candidate:rg';
  const keyFor = (id: string) => id === 'candidate:rg' ? K1 : K2;
  return {
    schema: 'atlas.next-action-recommendation.v1',
    recommendation_id: input.id,
    workflow_id: 'wf:1',
    workflow_revision: 4,
    policy_family: 'DETERMINISTIC_FULL_SCAN',
    tang_claim: null,
    feature_revision: 'action-features:v1',
    candidates: [
      { candidate_action_id: first, rank: 1, score: 0.8, execution_key: keyFor(first), evidence_refs: [`e:${first}`] },
      { candidate_action_id: second, rank: 2, score: 0.6, execution_key: keyFor(second), evidence_refs: [`e:${second}`] },
    ],
    created_at: input.createdAt,
    producer_revision: 'recommend-policy:v1',
  };
}

function receipt(input: {
  recommendationId: string;
  selected: string | null;
  executionKey?: string | null;
  downstream?: boolean | null;
  outcome?: RecommendationOutcomeReceiptV1['outcome'];
  observedAt: string;
  followed?: boolean;
}): RecommendationOutcomeReceiptV1 {
  return {
    schema: 'atlas.recommendation-outcome-receipt.v1',
    recommendation_id: input.recommendationId,
    selected_action_id: input.selected,
    followed_recommendation: input.followed ?? false,
    resulting_execution_key: input.executionKey ?? null,
    outcome: input.outcome ?? null,
    downstream_success: input.downstream ?? null,
    evidence_refs: [`receipt:${input.recommendationId}`],
    observed_at: input.observedAt,
    producer_revision: 'outcome:v1',
  };
}

describe('historical recommendation aggregate', () => {
  it('separates policy outcome history from action history and computes observational rates', () => {
    const r1 = recommendation({ id: 'rec:1', createdAt: '2026-08-21T20:00:00.000Z' });
    const r2 = recommendation({ id: 'rec:2', createdAt: '2026-08-21T20:01:00.000Z' });
    const r3 = recommendation({ id: 'rec:3', createdAt: '2026-08-21T20:02:00.000Z', first: 'candidate:graph' });

    const aggregate = aggregateHistoricalRecommendations({
      observations: [
        { recommendation: r1, receipt: receipt({ recommendationId: 'rec:1', selected: 'candidate:rg', executionKey: K1, downstream: true, outcome: 'SUCCESS_EXACT', observedAt: '2026-08-21T20:00:30.000Z', followed: true }) },
        { recommendation: r2, receipt: receipt({ recommendationId: 'rec:2', selected: 'candidate:rg', executionKey: K1, downstream: false, outcome: 'TEST_FAILED', observedAt: '2026-08-21T20:01:30.000Z', followed: true }) },
        { recommendation: r3, receipt: receipt({ recommendationId: 'rec:3', selected: 'candidate:graph', executionKey: K2, downstream: true, outcome: 'SUCCESS_EXACT', observedAt: '2026-08-21T20:02:30.000Z', followed: true }) },
      ],
      candidate_action_id: 'candidate:rg',
      policy_family: 'DETERMINISTIC_FULL_SCAN',
      policy_revision: 'recommend-policy:v1',
      feature_revision: 'action-features:v1',
    });

    expect(aggregate.recommendation_count).toBe(3);
    expect(aggregate.selection_count).toBe(2);
    expect(aggregate.execution_count).toBe(2);
    expect(aggregate.downstream_observation_count).toBe(2);
    expect(aggregate.success_after_selection_count).toBe(1);
    expect(aggregate.failure_after_selection_count).toBe(1);
    expect(aggregate.downstream_success_rate).toBe(0.5);
    expect(aggregate.selection_rate).toBeCloseTo(2 / 3);
    expect(aggregate.observational_only).toBe(true);
    expect(aggregate.causal_claim).toBe(false);
    expect(aggregate.aggregate_checksum).toMatch(/^[a-f0-9]{64}$/);
  });

  it('does not turn an unselected candidate into an observed outcome', () => {
    const rec = recommendation({ id: 'rec:1', createdAt: '2026-08-21T20:00:00.000Z' });
    const aggregate = aggregateHistoricalRecommendations({
      observations: [{
        recommendation: rec,
        receipt: receipt({ recommendationId: 'rec:1', selected: 'candidate:graph', executionKey: K2, downstream: true, outcome: 'SUCCESS_EXACT', observedAt: '2026-08-21T20:00:30.000Z', followed: false }),
      }],
      candidate_action_id: 'candidate:rg',
      policy_family: 'DETERMINISTIC_FULL_SCAN',
      policy_revision: 'recommend-policy:v1',
      feature_revision: 'action-features:v1',
    });

    expect(aggregate.recommendation_count).toBe(1);
    expect(aggregate.selection_count).toBe(0);
    expect(aggregate.execution_count).toBe(0);
    expect(aggregate.downstream_success_rate).toBeNull();
  });

  it('rejects execution-key drift between recommendation and receipt', () => {
    const rec = recommendation({ id: 'rec:1', createdAt: '2026-08-21T20:00:00.000Z' });
    expect(() => aggregateHistoricalRecommendations({
      observations: [{
        recommendation: rec,
        receipt: receipt({ recommendationId: 'rec:1', selected: 'candidate:rg', executionKey: K2, downstream: true, observedAt: '2026-08-21T20:00:30.000Z', followed: true }),
      }],
      candidate_action_id: 'candidate:rg',
      policy_family: 'DETERMINISTIC_FULL_SCAN',
      policy_revision: 'recommend-policy:v1',
      feature_revision: 'action-features:v1',
    })).toThrow('RECOMMENDATION_HISTORY_EXECUTION_KEY_MISMATCH');
  });

  it('fails closed across policy revision drift', () => {
    const rec = recommendation({ id: 'rec:1', createdAt: '2026-08-21T20:00:00.000Z' });
    expect(() => aggregateHistoricalRecommendations({
      observations: [{ recommendation: rec, receipt: null }],
      candidate_action_id: 'candidate:rg',
      policy_family: 'DETERMINISTIC_FULL_SCAN',
      policy_revision: 'recommend-policy:v2',
      feature_revision: 'action-features:v1',
    })).toThrow('RECOMMENDATION_HISTORY_POLICY_REVISION_MISMATCH');
  });
});
