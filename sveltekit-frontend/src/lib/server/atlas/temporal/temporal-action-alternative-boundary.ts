import { z } from 'zod';

import {
  actionFeatureCandidateInputSchema,
  alternativeActionSelectionSchema,
  buildActionExecutionKey,
  createTemporalActionPostgresRepository,
  recommendAlternativeActionFromHistory,
  temporalActionChecksum,
  type AgentActionEventV1,
} from '@deeds/parent-atlas';

import {
  buildTemporalToolInputHash,
  temporalToolBoundaryDecisionSchema,
  temporalToolExecutionContextSchema,
  type TemporalToolBoundaryDecisionV1,
} from './temporal-tool-execution-boundary.js';

const id = z.string().min(1);
const checksum = z.string().regex(/^[a-f0-9]{64}$/);

export const temporalAlternativeToolCandidateSchema = z.object({
  candidate: actionFeatureCandidateInputSchema,
  execution_key: checksum,
  call: z.object({
    tool: id,
    args: z.record(z.string(), z.unknown()).default({}),
  }).strict(),
  temporal: temporalToolExecutionContextSchema,
}).strict();
export type TemporalAlternativeToolCandidateV1 = z.infer<typeof temporalAlternativeToolCandidateSchema>;

export const temporalAlternativePlanSchema = z.object({
  schema: z.literal('atlas.temporal-alternative-plan.v1').default('atlas.temporal-alternative-plan.v1'),
  workflow_id: id,
  workflow_revision: z.number().int().nonnegative(),
  candidates: z.array(temporalAlternativeToolCandidateSchema).min(1),
  history_limit: z.number().int().positive().max(5000).default(512),
  history_scope: z.enum(['WORKFLOW', 'GLOBAL']).default('WORKFLOW'),
  excluded_execution_keys: z.array(checksum).default([]),
  persist_outcome_receipt: z.boolean().default(false),
  created_at: z.string().datetime(),
  producer_revision: id,
}).strict();
export type TemporalAlternativePlanV1 = z.infer<typeof temporalAlternativePlanSchema>;

export const temporalAlternativeBoundaryResultSchema = z.object({
  schema: z.literal('atlas.temporal-alternative-boundary-result.v1'),
  failed_execution_key: checksum,
  selected_candidate_action_id: id,
  selected_execution_key: checksum,
  selected_call: z.object({
    tool: id,
    args: z.record(z.string(), z.unknown()),
  }).strict(),
  selected_temporal: temporalToolExecutionContextSchema,
  selection_checksum: checksum,
  history_event_count: z.number().int().nonnegative(),
  history_receipt_ref: id.nullable(),
  package_selection: alternativeActionSelectionSchema,
  boundary_checksum: checksum,
}).strict();
export type TemporalAlternativeBoundaryResultV1 = z.infer<typeof temporalAlternativeBoundaryResultSchema>;

function validateCandidate(candidateInput: z.input<typeof temporalAlternativeToolCandidateSchema>): TemporalAlternativeToolCandidateV1 {
  const candidate = temporalAlternativeToolCandidateSchema.parse(candidateInput);
  if (candidate.temporal.expected_tool !== candidate.call.tool) {
    throw new Error(
      `TEMPORAL_ALTERNATIVE_TOOL_IDENTITY_MISMATCH:${candidate.candidate.candidate_action_id}:expected=${candidate.temporal.expected_tool}:actual=${candidate.call.tool}`,
    );
  }
  const inputHash = buildTemporalToolInputHash(candidate.call);
  if (candidate.temporal.descriptor.input_hash !== inputHash) {
    throw new Error(`TEMPORAL_ALTERNATIVE_INPUT_HASH_MISMATCH:${candidate.candidate.candidate_action_id}`);
  }
  const executionKey = buildActionExecutionKey(candidate.temporal.descriptor);
  if (candidate.execution_key !== executionKey) {
    throw new Error(`TEMPORAL_ALTERNATIVE_EXECUTION_KEY_MISMATCH:${candidate.candidate.candidate_action_id}`);
  }
  return candidate;
}

/**
 * Pure adapter from a DRY SELECT_ALTERNATIVE result to one concrete tool edge.
 * Package-level recommendation remains the policy owner; this file only verifies
 * concrete call identity and maps the selected candidate ID back to its call.
 */
export function selectTemporalAlternativeTool(input: {
  failed_boundary: z.input<typeof temporalToolBoundaryDecisionSchema>;
  plan: z.input<typeof temporalAlternativePlanSchema>;
  history_events: readonly AgentActionEventV1[];
  history_receipt_ref?: string | null;
}): TemporalAlternativeBoundaryResultV1 {
  const failedBoundary: TemporalToolBoundaryDecisionV1 = temporalToolBoundaryDecisionSchema.parse(input.failed_boundary);
  if (failedBoundary.disposition !== 'SELECT_ALTERNATIVE') {
    throw new Error(`TEMPORAL_ALTERNATIVE_REQUIRES_SELECT_ALTERNATIVE:${failedBoundary.disposition}`);
  }
  const plan = temporalAlternativePlanSchema.parse(input.plan);
  const candidates = plan.candidates.map(validateCandidate);
  const candidateIds = candidates.map(({ candidate }) => candidate.candidate_action_id);
  if (new Set(candidateIds).size !== candidateIds.length) {
    throw new Error('TEMPORAL_ALTERNATIVE_DUPLICATE_CANDIDATE_ID');
  }

  const packageSelection = recommendAlternativeActionFromHistory({
    workflow_id: plan.workflow_id,
    workflow_revision: plan.workflow_revision,
    failed_execution_key: failedBoundary.execution_key,
    excluded_execution_keys: plan.excluded_execution_keys,
    candidates: candidates.map(({ candidate, execution_key }) => ({ candidate, execution_key })),
    events: input.history_events,
    created_at: plan.created_at,
    producer_revision: plan.producer_revision,
  });
  const selected = candidates.find(
    ({ candidate }) => candidate.candidate_action_id === packageSelection.selected_candidate_action_id,
  );
  if (!selected) {
    throw new Error(`TEMPORAL_ALTERNATIVE_SELECTED_CALL_MISSING:${packageSelection.selected_candidate_action_id}`);
  }
  if (selected.execution_key === failedBoundary.execution_key) {
    throw new Error(`TEMPORAL_ALTERNATIVE_FAILED_KEY_RESELECTED:${selected.execution_key}`);
  }

  const raw = {
    schema: 'atlas.temporal-alternative-boundary-result.v1' as const,
    failed_execution_key: failedBoundary.execution_key,
    selected_candidate_action_id: selected.candidate.candidate_action_id,
    selected_execution_key: selected.execution_key,
    selected_call: selected.call,
    selected_temporal: selected.temporal,
    selection_checksum: packageSelection.selection_checksum,
    history_event_count: input.history_events.length,
    history_receipt_ref: input.history_receipt_ref ?? null,
    package_selection: packageSelection,
  };
  return temporalAlternativeBoundaryResultSchema.parse({
    ...raw,
    boundary_checksum: temporalActionChecksum(raw),
  });
}

/**
 * Live history adapter. It performs a bounded checksum-verifying history read
 * from the existing append-only temporal ledger, then delegates selection to
 * the pure adapter above. It does not dispatch the selected tool.
 */
export async function selectTemporalAlternativeToolFromPostgres(input: {
  failed_boundary: z.input<typeof temporalToolBoundaryDecisionSchema>;
  plan: z.input<typeof temporalAlternativePlanSchema>;
}): Promise<TemporalAlternativeBoundaryResultV1> {
  const plan = temporalAlternativePlanSchema.parse(input.plan);
  const { pool } = await import('$lib/server/db/client.js');
  const repository = createTemporalActionPostgresRepository(pool);
  const history = await repository.listRecentFinalized({
    limit: plan.history_limit,
    workflow_id: plan.history_scope === 'WORKFLOW' ? plan.workflow_id : null,
    producer_revision: plan.producer_revision,
  });
  const receiptIdentity = temporalActionChecksum(history.receipt);
  return selectTemporalAlternativeTool({
    ...input,
    plan,
    history_events: history.events,
    history_receipt_ref: `temporal-history:${receiptIdentity}`,
  });
}
