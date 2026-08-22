import { z } from 'zod';

import {
  nextActionRecommendationSchema,
  temporalActionChecksum,
  type NextActionRecommendationV1,
} from './temporal-action-ledger.js';
import {
  actionFeatureCandidateInputSchema,
  compileActionFeatureRowFromHistory,
  recommendNextActionsDeterministic,
} from './temporal-action-recommendation-runtime.js';
import {
  compileActionFeatureRowWithRecommendationHistory,
} from './temporal-recommendation-feature-runtime.js';
import {
  recommendationHistoryObservationSchema,
} from './temporal-recommendation-history-runtime.js';

const id = z.string().min(1);
const checksum = z.string().regex(/^[a-f0-9]{64}$/);

export const alternativeActionCandidateSchema = z.object({
  candidate: actionFeatureCandidateInputSchema,
  execution_key: checksum,
}).strict();
export type AlternativeActionCandidateV1 = z.infer<typeof alternativeActionCandidateSchema>;

export const alternativeActionSelectionSchema = z.object({
  schema: z.literal('atlas.alternative-action-selection.v1'),
  failed_execution_key: checksum,
  excluded_execution_keys: z.array(checksum),
  selected_candidate_action_id: id,
  selected_execution_key: checksum,
  recommendation: nextActionRecommendationSchema,
  selection_checksum: checksum,
}).strict();
export type AlternativeActionSelectionV1 = z.infer<typeof alternativeActionSelectionSchema>;

/**
 * Converts checksum-verified procedural history into a deterministic alternative
 * recommendation after DRY has returned SELECT_ALTERNATIVE.
 *
 * The exact failed execution key is a hard exclusion. Historical failure
 * similarity remains a ranking feature for related actions, but it can never
 * cause the exact failed execution to be selected again.
 *
 * Optional recommendation outcome observations are policy evidence only. When
 * supplied they may update downstream_utility, but never semantic/structural
 * relevance, action success history, failure similarity, cost, latency, risk,
 * or canonical identity.
 */
export function recommendAlternativeActionFromHistory(input: {
  workflow_id: string;
  workflow_revision: number;
  failed_execution_key: string;
  excluded_execution_keys?: readonly string[];
  candidates: readonly z.input<typeof alternativeActionCandidateSchema>[];
  events: readonly unknown[];
  recommendation_observations?: readonly z.input<typeof recommendationHistoryObservationSchema>[];
  recommendation_policy_revision?: string;
  created_at: string;
  producer_revision: string;
}): AlternativeActionSelectionV1 {
  const failedExecutionKey = checksum.parse(input.failed_execution_key);
  if (input.candidates.length === 0) throw new Error('ACTION_ALTERNATIVE_CANDIDATES_REQUIRED');

  const parsedCandidates = input.candidates.map((candidate) => alternativeActionCandidateSchema.parse(candidate));
  const candidateIds = parsedCandidates.map(({ candidate }) => candidate.candidate_action_id);
  if (new Set(candidateIds).size !== candidateIds.length) {
    throw new Error('ACTION_ALTERNATIVE_DUPLICATE_CANDIDATE_ID');
  }

  const excluded = new Set<string>([
    failedExecutionKey,
    ...(input.excluded_execution_keys ?? []).map((value) => checksum.parse(value)),
  ]);
  const eligible = parsedCandidates.filter((candidate) => !excluded.has(candidate.execution_key));
  if (eligible.length === 0) throw new Error('ACTION_ALTERNATIVE_CANDIDATES_EXHAUSTED');

  const recommendationObservations = (input.recommendation_observations ?? [])
    .map((observation) => recommendationHistoryObservationSchema.parse(observation));
  const recommendationPolicyRevision = input.recommendation_policy_revision ?? input.producer_revision;

  const rows = eligible.map(({ candidate }) => recommendationObservations.length === 0
    ? compileActionFeatureRowFromHistory({ candidate, events: input.events })
    : compileActionFeatureRowWithRecommendationHistory({
        candidate,
        action_events: input.events,
        recommendation_observations: recommendationObservations,
        policy_revision: recommendationPolicyRevision,
      }));
  const executionKeys = Object.fromEntries(
    eligible.map(({ candidate, execution_key }) => [candidate.candidate_action_id, execution_key]),
  );
  const recommendation: NextActionRecommendationV1 = recommendNextActionsDeterministic({
    workflow_id: input.workflow_id,
    workflow_revision: input.workflow_revision,
    rows,
    execution_keys: executionKeys,
    created_at: input.created_at,
    producer_revision: input.producer_revision,
  });
  const selected = recommendation.candidates[0];
  if (!selected?.execution_key) throw new Error('ACTION_ALTERNATIVE_SELECTED_EXECUTION_KEY_MISSING');
  if (excluded.has(selected.execution_key)) {
    throw new Error(`ACTION_ALTERNATIVE_EXCLUSION_VIOLATION:${selected.execution_key}`);
  }

  const raw = {
    schema: 'atlas.alternative-action-selection.v1' as const,
    failed_execution_key: failedExecutionKey,
    excluded_execution_keys: [...excluded].sort(),
    selected_candidate_action_id: selected.candidate_action_id,
    selected_execution_key: selected.execution_key,
    recommendation,
  };
  return alternativeActionSelectionSchema.parse({
    ...raw,
    selection_checksum: temporalActionChecksum(raw),
  });
}

export function describeTemporalAlternativeSelection(): string {
  return [
    'SELECT_ALTERNATIVE is resolved by the package-owned deterministic recommendation policy, not by prompting the LLM to rediscover the workflow.',
    'The exact failed execution key is a hard exclusion. Related historical failures remain recommendation features only.',
    'Recommendation outcome history may affect downstream_utility only and remains observational, not causal evidence.',
    'AlternativeActionSelectionV1 is a derived execution-policy result; it does not become workflow identity, temporal history, or graph truth.',
  ].join(' ');
}
