import { z } from 'zod';

import {
  isSuccessfulOutcome,
  nextActionRecommendationSchema,
  recommendationOutcomeReceiptSchema,
  temporalActionChecksum,
} from './temporal-action-ledger.js';

const id = z.string().min(1);
const revision = z.string().min(1);
const checksum = z.string().regex(/^[a-f0-9]{64}$/);
const policyFamily = z.enum(['DETERMINISTIC_FULL_SCAN', 'TANG_INSPIRED_LOW_RANK_SHORTLIST']);

export const recommendationHistoryObservationSchema = z.object({
  recommendation: nextActionRecommendationSchema,
  receipt: recommendationOutcomeReceiptSchema.nullable(),
}).strict();
export type RecommendationHistoryObservationV1 = z.infer<typeof recommendationHistoryObservationSchema>;

export const historicalRecommendationAggregateSchema = z.object({
  schema: z.literal('atlas.historical-recommendation-aggregate.v1'),
  candidate_action_id: id,
  policy_family: policyFamily,
  policy_revision: revision,
  feature_revision: revision,
  recommendation_count: z.number().int().nonnegative(),
  selection_count: z.number().int().nonnegative(),
  execution_count: z.number().int().nonnegative(),
  downstream_observation_count: z.number().int().nonnegative(),
  success_after_selection_count: z.number().int().nonnegative(),
  failure_after_selection_count: z.number().int().nonnegative(),
  authoritative_outcome_count: z.number().int().nonnegative(),
  authoritative_success_count: z.number().int().nonnegative(),
  followed_recommendation_count: z.number().int().nonnegative(),
  selection_rate: z.number().finite().min(0).max(1),
  execution_after_selection_rate: z.number().finite().min(0).max(1).nullable(),
  downstream_success_rate: z.number().finite().min(0).max(1).nullable(),
  followed_recommendation_rate: z.number().finite().min(0).max(1).nullable(),
  latest_recommendation_id: id.nullable(),
  latest_selected_execution_key: checksum.nullable(),
  latest_outcome: z.string().min(1).nullable(),
  latest_downstream_success: z.boolean().nullable(),
  latest_observed_at: z.string().datetime().nullable(),
  evidence_refs: z.array(id),
  observational_only: z.literal(true),
  causal_claim: z.literal(false),
  aggregate_checksum: checksum,
}).strict();
export type HistoricalRecommendationAggregateV1 = z.infer<typeof historicalRecommendationAggregateSchema>;

function validateObservation(input: unknown): RecommendationHistoryObservationV1 {
  const observation = recommendationHistoryObservationSchema.parse(input);
  const { recommendation, receipt } = observation;
  if (receipt === null) return observation;

  if (receipt.recommendation_id !== recommendation.recommendation_id) {
    throw new Error(
      `RECOMMENDATION_HISTORY_RECEIPT_ID_MISMATCH:expected=${recommendation.recommendation_id}:actual=${receipt.recommendation_id}`,
    );
  }

  if (receipt.selected_action_id === null) {
    if (
      receipt.followed_recommendation
      || receipt.resulting_execution_key !== null
      || receipt.outcome !== null
      || receipt.downstream_success !== null
    ) {
      throw new Error(`RECOMMENDATION_HISTORY_UNSELECTED_EXECUTION_FIELDS_PRESENT:${receipt.recommendation_id}`);
    }
    return observation;
  }

  const selected = recommendation.candidates.find(
    (candidate) => candidate.candidate_action_id === receipt.selected_action_id,
  );
  if (!selected) {
    throw new Error(
      `RECOMMENDATION_HISTORY_SELECTED_ACTION_NOT_FOUND:${receipt.recommendation_id}:${receipt.selected_action_id}`,
    );
  }

  const expectedFollowed = recommendation.candidates[0]?.candidate_action_id === receipt.selected_action_id;
  if (receipt.followed_recommendation !== expectedFollowed) {
    throw new Error(`RECOMMENDATION_HISTORY_FOLLOWED_FLAG_MISMATCH:${receipt.recommendation_id}`);
  }

  if (receipt.resulting_execution_key !== null) {
    if (selected.execution_key === null) {
      throw new Error(`RECOMMENDATION_HISTORY_SELECTED_EXECUTION_KEY_MISSING:${receipt.recommendation_id}`);
    }
    if (receipt.resulting_execution_key !== selected.execution_key) {
      throw new Error(`RECOMMENDATION_HISTORY_EXECUTION_KEY_MISMATCH:${receipt.recommendation_id}`);
    }
  }

  if ((receipt.outcome !== null || receipt.downstream_success !== null) && receipt.resulting_execution_key === null) {
    throw new Error(`RECOMMENDATION_HISTORY_OBSERVED_OUTCOME_REQUIRES_EXECUTION_KEY:${receipt.recommendation_id}`);
  }

  return observation;
}

/**
 * Recommendation-conditioned history answers a different question from
 * HistoricalActionAggregateV1: how the policy behaved when it proposed this
 * candidate, not whether the underlying action itself is semantically relevant.
 *
 * This is observational policy evidence only. It makes no causal claim that the
 * selected recommendation caused the downstream result.
 */
export function aggregateHistoricalRecommendations(input: {
  observations: readonly unknown[];
  candidate_action_id: string;
  policy_family: z.input<typeof policyFamily>;
  policy_revision: string;
  feature_revision: string;
}): HistoricalRecommendationAggregateV1 {
  const candidateActionId = id.parse(input.candidate_action_id);
  const parsedPolicyFamily = policyFamily.parse(input.policy_family);
  const policyRevision = revision.parse(input.policy_revision);
  const featureRevision = revision.parse(input.feature_revision);
  const observations = input.observations.map(validateObservation);

  const relevant = observations.filter(({ recommendation }) =>
    recommendation.candidates.some((candidate) => candidate.candidate_action_id === candidateActionId));

  for (const { recommendation } of relevant) {
    if (recommendation.policy_family !== parsedPolicyFamily) {
      throw new Error(`RECOMMENDATION_HISTORY_POLICY_FAMILY_MISMATCH:${recommendation.recommendation_id}`);
    }
    if (recommendation.producer_revision !== policyRevision) {
      throw new Error(`RECOMMENDATION_HISTORY_POLICY_REVISION_MISMATCH:${recommendation.recommendation_id}`);
    }
    if (recommendation.feature_revision !== featureRevision) {
      throw new Error(`RECOMMENDATION_HISTORY_FEATURE_REVISION_MISMATCH:${recommendation.recommendation_id}`);
    }
  }

  const selected = relevant.filter(({ receipt }) => receipt?.selected_action_id === candidateActionId);
  const executed = selected.filter(({ receipt }) => receipt?.resulting_execution_key !== null);
  const downstreamObserved = selected.filter(({ receipt }) => receipt?.downstream_success !== null);
  const downstreamSuccesses = downstreamObserved.filter(({ receipt }) => receipt?.downstream_success === true);
  const downstreamFailures = downstreamObserved.filter(({ receipt }) => receipt?.downstream_success === false);
  const authoritative = selected.filter(({ receipt }) => receipt?.outcome !== null);
  const authoritativeSuccesses = authoritative.filter(({ receipt }) => isSuccessfulOutcome(receipt?.outcome ?? null));
  const followed = selected.filter(({ receipt }) => receipt?.followed_recommendation === true);
  const latestReceiptObservation = [...selected]
    .filter(({ receipt }) => receipt !== null)
    .sort((a, b) => (a.receipt!.observed_at < b.receipt!.observed_at ? -1 : a.receipt!.observed_at > b.receipt!.observed_at ? 1 : 0))
    .at(-1) ?? null;
  const latestRecommendation = [...relevant]
    .sort((a, b) => (a.recommendation.created_at < b.recommendation.created_at ? -1 : a.recommendation.created_at > b.recommendation.created_at ? 1 : 0))
    .at(-1) ?? null;

  const evidenceRefs = [...new Set(relevant.flatMap(({ recommendation, receipt }) => [
    recommendation.recommendation_id,
    ...(receipt?.evidence_refs ?? []),
  ]))].sort();

  const recommendationCount = relevant.length;
  const selectionCount = selected.length;
  const executionCount = executed.length;
  const downstreamObservationCount = downstreamObserved.length;
  const raw = {
    schema: 'atlas.historical-recommendation-aggregate.v1' as const,
    candidate_action_id: candidateActionId,
    policy_family: parsedPolicyFamily,
    policy_revision: policyRevision,
    feature_revision: featureRevision,
    recommendation_count: recommendationCount,
    selection_count: selectionCount,
    execution_count: executionCount,
    downstream_observation_count: downstreamObservationCount,
    success_after_selection_count: downstreamSuccesses.length,
    failure_after_selection_count: downstreamFailures.length,
    authoritative_outcome_count: authoritative.length,
    authoritative_success_count: authoritativeSuccesses.length,
    followed_recommendation_count: followed.length,
    selection_rate: recommendationCount === 0 ? 0 : selectionCount / recommendationCount,
    execution_after_selection_rate: selectionCount === 0 ? null : executionCount / selectionCount,
    downstream_success_rate: downstreamObservationCount === 0 ? null : downstreamSuccesses.length / downstreamObservationCount,
    followed_recommendation_rate: selectionCount === 0 ? null : followed.length / selectionCount,
    latest_recommendation_id: latestRecommendation?.recommendation.recommendation_id ?? null,
    latest_selected_execution_key: latestReceiptObservation?.receipt?.resulting_execution_key ?? null,
    latest_outcome: latestReceiptObservation?.receipt?.outcome ?? null,
    latest_downstream_success: latestReceiptObservation?.receipt?.downstream_success ?? null,
    latest_observed_at: latestReceiptObservation?.receipt?.observed_at ?? null,
    evidence_refs: evidenceRefs,
    observational_only: true as const,
    causal_claim: false as const,
  };

  return historicalRecommendationAggregateSchema.parse({
    ...raw,
    aggregate_checksum: temporalActionChecksum(raw),
  });
}

export function describeHistoricalRecommendationAggregate(): string {
  return [
    'HistoricalRecommendationAggregateV1 measures how a recommendation policy behaved for one candidate under one policy and feature revision.',
    'It is separate from HistoricalActionAggregateV1 and does not alter semantic, lexical, AST, graph, or canonical identity evidence.',
    'downstream_success_rate is observational policy evidence only; causal_claim is always false.',
  ].join(' ');
}
