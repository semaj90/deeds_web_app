import { z } from 'zod';
import { workflowActionEventSchema, type WorkflowActionEventV1 } from './workflow-action-event.js';
import {
  actionExecutionDescriptorSchema,
  actionOutcomeSchema,
  buildAgentActionEvent,
  type ActionExecutionDescriptorV1,
  type AgentActionEventV1,
} from './temporal-action-ledger.js';

const id = z.string().min(1);

export const workflowTemporalActionAdaptationSchema = z.object({
  workflow_event: workflowActionEventSchema,
  ledger_sequence: z.number().int().positive(),
  descriptor: actionExecutionDescriptorSchema,
  outcome: actionOutcomeSchema.nullable().default(null),
  result_ref: id.nullable().default(null),
  error_code: z.string().min(1).nullable().default(null),
  evidence_refs: z.array(id).default([]),
  artifact_refs: z.array(id).default([]),
  cost: z.object({
    latency_ms: z.number().finite().nonnegative().nullable().default(null),
    gpu_bytes: z.number().int().nonnegative().nullable().default(null),
    tokens: z.number().int().nonnegative().nullable().default(null),
    tool_calls: z.number().int().nonnegative().nullable().default(null),
  }).strict().default({ latency_ms: null, gpu_bytes: null, tokens: null, tool_calls: null }),
  producer_revision: z.string().min(1),
}).strict().superRefine((value, ctx) => {
  if (value.workflow_event.kind === 'completed' && value.outcome === null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['outcome'],
      message: 'completed workflow event requires explicit action outcome; completion alone cannot imply SUCCESS_EXACT',
    });
  }
  if (value.workflow_event.kind === 'failed' && value.outcome === null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['outcome'], message: 'failed workflow event requires explicit action outcome' });
  }
  if (value.workflow_event.kind === 'completed' && !value.result_ref) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['result_ref'], message: 'completed workflow event requires result_ref for temporal reuse' });
  }
  if (value.workflow_event.kind === 'failed' && !value.error_code && !value.workflow_event.errorCode) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['error_code'], message: 'failed workflow event requires an error code' });
  }
}).transform((value) => value);

export type WorkflowTemporalActionAdaptationV1 = z.infer<typeof workflowTemporalActionAdaptationSchema>;

function ledgerState(event: WorkflowActionEventV1): AgentActionEventV1['state'] {
  switch (event.kind) {
    case 'scheduled': return 'SCHEDULED';
    case 'started': return 'STARTED';
    case 'progress':
    case 'artifact':
    case 'blocked': return 'PROGRESS';
    case 'retrying': return 'RETRIED';
    case 'completed':
    case 'failed': return 'FINALIZED';
    case 'cancelled': return 'SUPERSEDED';
  }
}

/**
 * Converts the canonical workflow runtime event into immutable temporal history.
 * The adapter does not mint or normalize workflow/action identity: workflowId,
 * workflowRevision, actionId and sequence are copied exactly from the runtime owner.
 *
 * Outcome semantics remain explicit. In particular, `kind=completed` means the
 * workflow runtime finished the action; it does not prove the result was exact,
 * useful, fresh, validator-approved, or otherwise eligible for reuse.
 */
export function adaptWorkflowActionEventToTemporalHistory(
  raw: z.input<typeof workflowTemporalActionAdaptationSchema>,
): AgentActionEventV1 {
  const input = workflowTemporalActionAdaptationSchema.parse(raw);
  const event = input.workflow_event;
  const descriptor: ActionExecutionDescriptorV1 = actionExecutionDescriptorSchema.parse(input.descriptor);
  const observedAt = event.completedAt ?? event.startedAt ?? descriptor.applicability.observed_at;
  const alignedDescriptor = actionExecutionDescriptorSchema.parse({
    ...descriptor,
    applicability: {
      ...descriptor.applicability,
      observed_at: observedAt,
    },
  });

  return buildAgentActionEvent({
    event_id: `workflow:${event.workflowId}:${event.workflowRevision}:${event.sequence}`,
    ledger_sequence: input.ledger_sequence,
    workflow_action: {
      workflow_id: event.workflowId,
      workflow_revision: event.workflowRevision,
      action_id: event.actionId,
      sequence: event.sequence,
    },
    descriptor: alignedDescriptor,
    state: ledgerState(event),
    outcome: input.outcome,
    result_ref: input.result_ref,
    error_code: input.error_code ?? event.errorCode ?? null,
    evidence_refs: [...new Set([...event.evidenceRefs, ...input.evidence_refs])],
    artifact_refs: [...new Set([...event.artifactRefs, ...input.artifact_refs])],
    cost: input.cost,
    observed_at: observedAt,
    producer_revision: input.producer_revision,
  });
}

export function describeTemporalWorkflowAdapter(): string {
  return [
    'WorkflowActionEventV1 remains the canonical workflow/action identity owner.',
    'The temporal adapter copies runtime-owned IDs exactly and only adds execution-key, outcome, applicability and append-only history semantics.',
    'A completed workflow event requires an explicit ActionOutcomeV1 and result_ref; completion alone never implies exact reusable success.',
  ].join(' ');
}
