import {
  actionFeatureRowSchema,
  type ActionFeatureRowV1,
} from './temporal-action-ledger.js';
import {
  actionFeatureCandidateInputSchema,
  compileActionFeatureRowFromHistory,
} from './temporal-action-recommendation-runtime.js';
import {
  aggregateHistoricalRecommendations,
  type RecommendationHistoryObservationV1,
} from './temporal-recommendation-history-runtime.js';
import { z } from 'zod';

/**
 * Adds recommendation-conditioned policy evidence to the existing action feature
 * row without mutating non-procedural evidence dimensions.
 *
 * The prior candidate downstream_utility is given weight 1. Each observed
 * downstream recommendation result contributes one Bernoulli observation. This
 * makes the update deterministic and bounded while avoiding a false causal claim.
 */
export function compileActionFeatureRowWithRecommendationHistory(input: {
  candidate: z.input<typeof actionFeatureCandidateInputSchema>;
  action_events: readonly unknown[];
  recommendation_observations: readonly RecommendationHistoryObservationV1[];
  policy_revision: string;
}): ActionFeatureRowV1 {
  const candidate = actionFeatureCandidateInputSchema.parse(input.candidate);
  const base = compileActionFeatureRowFromHistory({
    candidate,
    events: input.action_events,
  });
  const aggregate = aggregateHistoricalRecommendations({
    observations: input.recommendation_observations,
    candidate_action_id: candidate.candidate_action_id,
    policy_family: 'DETERMINISTIC_FULL_SCAN',
    policy_revision: input.policy_revision,
    feature_revision: candidate.feature_revision,
  });

  if (
    aggregate.downstream_observation_count === 0
    || aggregate.downstream_success_rate === null
  ) {
    return base;
  }

  const observedSuccesses = aggregate.success_after_selection_count;
  const observationCount = aggregate.downstream_observation_count;
  const blendedDownstreamUtility = (
    candidate.downstream_utility + observedSuccesses
  ) / (1 + observationCount);

  return actionFeatureRowSchema.parse({
    ...base,
    downstream_utility: blendedDownstreamUtility,
    evidence_refs: [...new Set([
      ...base.evidence_refs,
      ...aggregate.evidence_refs,
      `recommendation-aggregate:${aggregate.aggregate_checksum}`,
    ])].sort(),
  });
}

export function describeRecommendationFeatureLearningBoundary(): string {
  return [
    'Recommendation outcome history may update downstream_utility only.',
    'It does not change semantic_affinity, structural_affinity, query_class_affinity, historical_success_rate, cache_hit_probability, last_failure_similarity, execution_cost, latency, mutation_risk, or canonical identity.',
    'The update is observational policy evidence with one prior pseudo-observation; it is not a causal estimate.',
  ].join(' ');
}
