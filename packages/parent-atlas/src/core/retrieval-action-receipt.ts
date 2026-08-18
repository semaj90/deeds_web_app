import { z } from 'zod';
import { sufficiencyActionSchema, sufficiencyStateSchema } from './hypergraph-retrieval.js';

const revision = z.string().min(1);
const id = z.string().min(1);

export const retrievalActionReceiptSchema = z.object({
  schema: z.literal('atlas.retrieval-action-receipt.v1').default('atlas.retrieval-action-receipt.v1'),
  receipt_id: id,
  query_id: id,
  sequence: z.number().int().nonnegative(),
  before_state: sufficiencyStateSchema,
  action: sufficiencyActionSchema,
  requested_entity_types: z.array(z.string().min(1)).default([]),
  requested_relationship_types: z.array(z.string().min(1)).default([]),
  requested_evidence_kinds: z.array(z.string().min(1)).default([]),
  candidate_ids: z.array(id).default([]),
  retrieved_evidence_refs: z.array(id).default([]),
  relationship_ids: z.array(id).default([]),
  source_snapshot_revision_before: revision,
  source_snapshot_revision_after: revision,
  after_state: sufficiencyStateSchema,
  sufficient_after: z.boolean(),
  executor_refs: z.array(z.string().min(1)).default([]),
  started_at: z.string().datetime(),
  finished_at: z.string().datetime(),
  producer_revision: revision,
}).strict().superRefine((value, ctx) => {
  if (value.sufficient_after && value.after_state !== 'ENOUGH_EVIDENCE') {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'sufficient_after requires ENOUGH_EVIDENCE', path: ['after_state'] });
  }
  if (!value.sufficient_after && value.after_state === 'ENOUGH_EVIDENCE') {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'ENOUGH_EVIDENCE requires sufficient_after=true', path: ['sufficient_after'] });
  }
});

export type RetrievalActionReceiptV1 = z.infer<typeof retrievalActionReceiptSchema>;

export function buildRetrievalActionReceipt(
  input: z.input<typeof retrievalActionReceiptSchema>,
): RetrievalActionReceiptV1 {
  return retrievalActionReceiptSchema.parse(input);
}

/**
 * TODO(FI-16M): live DAG orchestrator adapter should emit one receipt for each
 * NEED_* -> retrieval action -> new evidence snapshot -> sufficiency re-check.
 */
export type RetrievalActionExecutorV1 = (input: {
  query_id: string;
  action: z.infer<typeof sufficiencyActionSchema>;
  requested_entity_types: string[];
  requested_relationship_types: string[];
  requested_evidence_kinds: string[];
}) => Promise<{
  candidate_ids: string[];
  evidence_refs: string[];
  relationship_ids: string[];
  executor_refs: string[];
}>;
