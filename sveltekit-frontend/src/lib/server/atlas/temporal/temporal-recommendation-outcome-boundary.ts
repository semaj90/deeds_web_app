import { z } from 'zod';

import {
  actionOutcomeSchema,
  buildFinalRecommendationOutcomeReceipt,
  createRecommendationOutcomePostgresRepository,
  recommendationOutcomeAppendReceiptSchema,
  recommendationOutcomeReceiptSchema,
  type RecommendationOutcomeAppendReceiptV1,
  type RecommendationOutcomeReceiptV1,
} from '@deeds/parent-atlas';

import { temporalAlternativeBoundaryResultSchema } from './temporal-action-alternative-boundary.js';

const id = z.string().min(1);

export const temporalRecommendationOutcomeBoundaryResultSchema = z.object({
  schema: z.literal('atlas.temporal-recommendation-outcome-boundary-result.v1'),
  receipt: recommendationOutcomeReceiptSchema,
  append_receipt: recommendationOutcomeAppendReceiptSchema,
}).strict();
export type TemporalRecommendationOutcomeBoundaryResultV1 = z.infer<typeof temporalRecommendationOutcomeBoundaryResultSchema>;

/**
 * Pure finalization adapter. It binds a downstream workflow result to the exact
 * frozen alternative selection and package recommendation that caused the edge
 * to execute. It never infers ActionOutcomeV1 from tool transport success.
 */
export function buildTemporalRecommendationOutcome(input: {
  selection: unknown;
  downstream_success: boolean;
  outcome?: z.input<typeof actionOutcomeSchema> | null;
  evidence_refs?: readonly string[];
  observed_at: string;
  producer_revision: string;
}): RecommendationOutcomeReceiptV1 {
  const selection = temporalAlternativeBoundaryResultSchema.parse(input.selection);
  return buildFinalRecommendationOutcomeReceipt({
    recommendation: selection.package_selection.recommendation,
    selected_action_id: selection.selected_candidate_action_id,
    resulting_execution_key: selection.selected_execution_key,
    downstream_success: input.downstream_success,
    outcome: input.outcome ?? null,
    evidence_refs: [
      selection.boundary_checksum,
      selection.selection_checksum,
      ...(selection.history_receipt_ref ? [selection.history_receipt_ref] : []),
      ...(input.evidence_refs ?? []),
    ],
    observed_at: input.observed_at,
    producer_revision: input.producer_revision,
  });
}

export async function persistTemporalRecommendationOutcomeFromPostgres(input: {
  selection: unknown;
  downstream_success: boolean;
  outcome?: z.input<typeof actionOutcomeSchema> | null;
  evidence_refs?: readonly string[];
  observed_at?: string;
  producer_revision: string;
}): Promise<TemporalRecommendationOutcomeBoundaryResultV1> {
  id.parse(input.producer_revision);
  const receipt = buildTemporalRecommendationOutcome({
    ...input,
    observed_at: input.observed_at ?? new Date().toISOString(),
  });
  const { pool } = await import('$lib/server/db/client.js');
  const repository = createRecommendationOutcomePostgresRepository(pool);
  const appendReceipt: RecommendationOutcomeAppendReceiptV1 = await repository.append(
    receipt,
    input.producer_revision,
  );
  return temporalRecommendationOutcomeBoundaryResultSchema.parse({
    schema: 'atlas.temporal-recommendation-outcome-boundary-result.v1',
    receipt,
    append_receipt: appendReceipt,
  });
}
