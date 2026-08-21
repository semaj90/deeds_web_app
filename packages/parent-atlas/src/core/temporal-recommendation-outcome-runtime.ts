import { z } from 'zod';

import {
  actionOutcomeSchema,
  nextActionRecommendationSchema,
  recommendationOutcomeReceiptSchema,
  temporalActionChecksum,
} from './temporal-action-ledger.js';

const id = z.string().min(1);
const checksum = z.string().regex(/^[a-f0-9]{64}$/);

export type RecommendationOutcomeReceiptV1 = z.infer<typeof recommendationOutcomeReceiptSchema>;

/**
 * Build the final evaluation receipt for one recommendation after the selected
 * action's downstream workflow result is known.
 *
 * Action outcome and downstream success are deliberately separate. The caller
 * may supply an ActionOutcomeV1 only when it comes from an authoritative action
 * event/outcome owner; this helper never infers SUCCESS_EXACT from a transport or
 * tool-level `ok`/`success` boolean.
 */
export function buildFinalRecommendationOutcomeReceipt(input: {
  recommendation: unknown;
  selected_action_id: string;
  resulting_execution_key: string;
  downstream_success: boolean;
  outcome?: unknown | null;
  evidence_refs?: readonly string[];
  observed_at: string;
  producer_revision: string;
}): RecommendationOutcomeReceiptV1 {
  const recommendation = nextActionRecommendationSchema.parse(input.recommendation);
  const selectedActionId = id.parse(input.selected_action_id);
  const executionKey = checksum.parse(input.resulting_execution_key);
  const selected = recommendation.candidates.find(
    (candidate) => candidate.candidate_action_id === selectedActionId,
  );
  if (!selected) {
    throw new Error(`RECOMMENDATION_SELECTED_ACTION_NOT_FOUND:${selectedActionId}`);
  }
  if (!selected.execution_key) {
    throw new Error(`RECOMMENDATION_SELECTED_EXECUTION_KEY_MISSING:${selectedActionId}`);
  }
  if (selected.execution_key !== executionKey) {
    throw new Error(
      `RECOMMENDATION_SELECTED_EXECUTION_KEY_MISMATCH:expected=${selected.execution_key}:actual=${executionKey}`,
    );
  }

  const authoritativeOutcome = input.outcome == null
    ? null
    : actionOutcomeSchema.parse(input.outcome);
  const top = recommendation.candidates[0] ?? null;
  const evidenceRefs = [...new Set([
    recommendation.recommendation_id,
    ...selected.evidence_refs,
    ...(input.evidence_refs ?? []),
  ])].sort();

  return recommendationOutcomeReceiptSchema.parse({
    schema: 'atlas.recommendation-outcome-receipt.v1',
    recommendation_id: recommendation.recommendation_id,
    selected_action_id: selectedActionId,
    followed_recommendation: top?.candidate_action_id === selectedActionId,
    resulting_execution_key: executionKey,
    outcome: authoritativeOutcome,
    downstream_success: input.downstream_success,
    evidence_refs: evidenceRefs,
    observed_at: input.observed_at,
    producer_revision: input.producer_revision,
  });
}

export function recommendationOutcomeReceiptChecksum(input: unknown): string {
  const receipt = recommendationOutcomeReceiptSchema.parse(input);
  return temporalActionChecksum(receipt);
}

export function describeRecommendationOutcomeReceiptBoundary(): string {
  return [
    'RecommendationOutcomeReceiptV1 evaluates a recommendation after downstream execution; it does not become action history or workflow identity.',
    'followed_recommendation is derived from whether the selected action is rank 1 in the referenced recommendation.',
    'downstream_success is supplied by the workflow finalization boundary.',
    'outcome remains null unless an authoritative ActionOutcomeV1 is supplied; tool transport success is never upgraded to SUCCESS_EXACT.',
  ].join(' ');
}
