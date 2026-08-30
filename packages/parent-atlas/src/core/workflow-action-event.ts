import { createHash } from 'node:crypto';
import { z } from 'zod';
import { runtimeEvidencePayloadSchema, type RuntimeEvidencePayloadV1 } from './evidence-entity-extractors.js';

const id = z.string().min(1);
const revision = z.string().min(1);

export const WORKFLOW_ACTION_LANES = [
  'planner', 'lexical', 'ast', 'semantic', 'graph', 'gpu', 'tool',
  'validator', 'materializer', 'acp', 'a2a',
] as const;
export const WORKFLOW_ACTION_TRANSPORTS = ['local', 'grpc', 'rabbitmq', 'acp', 'a2a'] as const;
export const WORKFLOW_ACTION_KINDS = [
  'scheduled', 'started', 'progress', 'artifact', 'blocked', 'retrying',
  'completed', 'failed', 'cancelled',
] as const;

export const workflowResourceRefSchema = z.object({
  resource_type: z.string().regex(/^[a-z][a-z0-9_.-]*$/),
  resource_id: id,
  role: z.string().min(1).default('resource'),
  identity_status: z.literal('canonical').default('canonical'),
}).strict();

export const workflowActionEventSchema = z.object({
  schema: z.literal('atlas.workflow-action.v1').default('atlas.workflow-action.v1'),
  workflowId: id,
  workflowRevision: z.number().int().nonnegative(),
  sequence: z.number().int().nonnegative(),
  actionId: id,
  parentActionId: id.optional(),
  dagNodeId: id,
  attempt: z.number().int().positive(),
  lane: z.enum(WORKFLOW_ACTION_LANES),
  transport: z.enum(WORKFLOW_ACTION_TRANSPORTS).optional(),
  kind: z.enum(WORKFLOW_ACTION_KINDS),
  toolId: id.optional(),
  receiptId: id.optional(),
  resourceRefs: z.array(workflowResourceRefSchema).default([]),
  evidenceRefs: z.array(id).default([]),
  artifactRefs: z.array(id).default([]),
  /** Aggregate execution telemetry only; no hidden reasoning or KV-cache contents. */
  tokensUsed: z.number().int().nonnegative().optional(),
  /** Source/worktree edits are distinct from build/data artifactRefs. */
  filesEdited: z.array(z.string().trim().min(1)).max(4096).optional(),
  openspecChange: z.string().trim().min(1).optional(),
  startedAt: z.string().datetime().optional(),
  completedAt: z.string().datetime().optional(),
  errorCode: z.string().min(1).optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
  producerRevision: revision,
}).strict().superRefine((value, ctx) => {
  if (value.kind === 'completed' && !value.receiptId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['receiptId'], message: 'completed workflow action requires receiptId' });
  }
  if (value.kind === 'failed' && !value.errorCode) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['errorCode'], message: 'failed workflow action requires errorCode' });
  }
});

export const workflowActionEventReceiptSchema = z.object({
  schema: z.literal('atlas.workflow-action-event-receipt.v1').default('atlas.workflow-action-event-receipt.v1'),
  workflow_id: id,
  workflow_revision: z.number().int().nonnegative(),
  action_id: id,
  sequence: z.number().int().nonnegative(),
  event_checksum: z.string().regex(/^[a-f0-9]{64}$/),
  runtime_evidence_checksum: z.string().regex(/^[a-f0-9]{64}$/),
  producer_revision: revision,
  canonical_identity_owner: z.literal('workflow_runtime').default('workflow_runtime'),
}).strict();

export type WorkflowActionEventV1 = z.infer<typeof workflowActionEventSchema>;
export type WorkflowActionEventReceiptV1 = z.infer<typeof workflowActionEventReceiptSchema>;

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function checksum(value: unknown): string {
  return createHash('sha256').update(stable(value), 'utf8').digest('hex');
}

/**
 * Workflow runtime owns workflow/action/receipt identities. This adapter exposes
 * those already-canonical IDs to the evidence-entity layer; it does not derive
 * canonical IDs from log messages or model text.
 */
export function workflowActionEventToRuntimeEvidence(
  eventInput: z.input<typeof workflowActionEventSchema>,
): { payload: RuntimeEvidencePayloadV1; receipt: WorkflowActionEventReceiptV1 } {
  const event = workflowActionEventSchema.parse(eventInput);
  const payload = runtimeEvidencePayloadSchema.parse({
    schema: 'atlas.runtime-evidence.v1',
    runtime_revision: `${event.workflowId}:${event.workflowRevision}:${event.sequence}`,
    tool: event.toolId ? { tool_id: event.toolId, identity_status: 'canonical' } : undefined,
    action: { action_id: event.actionId, identity_status: 'canonical' },
    receipt: event.receiptId ? { receipt_id: event.receiptId, identity_status: 'canonical' } : undefined,
    resources: event.resourceRefs,
  });

  return {
    payload,
    receipt: workflowActionEventReceiptSchema.parse({
      workflow_id: event.workflowId,
      workflow_revision: event.workflowRevision,
      action_id: event.actionId,
      sequence: event.sequence,
      event_checksum: checksum(event),
      runtime_evidence_checksum: checksum(payload),
      producer_revision: event.producerRevision,
      canonical_identity_owner: 'workflow_runtime',
    }),
  };
}

export function describeWorkflowActionEvent(): string {
  return [
    'WorkflowActionEventV1 is the common runtime event understood by planners, retrieval lanes, tools, validators, materializers, ACP and A2A adapters.',
    'workflow/action/receipt/resource IDs are runtime-owned canonical identities; logs and model text cannot mint them.',
    'sequence plus workflowRevision provide deterministic ordering within a workflow revision.',
    'Runtime evidence derived from the event can participate in dynamic hyperedge joins without implying a canonical application relationship.',
  ].join(' ');
}
