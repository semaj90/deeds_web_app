import { createHash } from 'node:crypto';
import { z } from 'zod';
import { workflowActionEventSchema, type WorkflowActionEventV1 } from './workflow-action-event.js';

const id = z.string().min(1);
const checksum = z.string().regex(/^[a-f0-9]{64}$/);

/**
 * Experimental delivery envelope for JetStream workflow experiments.
 *
 * JetStream supplies delivery/replay mechanics only. The workflow event,
 * Postgres ledger, outbox ordering, and DAG admission contracts remain Atlas
 * authorities. This envelope is never a canonical identity or mutation grant.
 */
export const jetStreamWorkflowEnvelopeV1Schema = z.object({
  schema: z.literal('atlas.jetstream-workflow-envelope.v1').default('atlas.jetstream-workflow-envelope.v1'),
  streamName: z.string().regex(/^[A-Z][A-Z0-9_-]*$/),
  subject: z.string().regex(/^[a-z][a-z0-9_.-]*$/),
  messageId: id,
  workflowId: id,
  workflowRevision: z.number().int().nonnegative(),
  dagNodeId: id,
  sequence: z.number().int().nonnegative(),
  deliveryAttempt: z.number().int().positive().default(1),
  event: workflowActionEventSchema,
  source: z.enum(['postgres_outbox', 'read_only_replay']),
  databaseCommitRequired: z.literal(true).default(true),
  mutationRequested: z.boolean().default(false),
  eventChecksum: checksum,
  canonicalAuthority: z.literal(false).default(false),
}).strict().superRefine((value, ctx) => {
  if (value.event.workflowId !== value.workflowId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['workflowId'], message: 'envelope workflowId must match event workflowId' });
  }
  if (value.event.workflowRevision !== value.workflowRevision) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['workflowRevision'], message: 'envelope workflowRevision must match event workflowRevision' });
  }
  if (value.event.dagNodeId !== value.dagNodeId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['dagNodeId'], message: 'envelope dagNodeId must match event dagNodeId' });
  }
  if (value.event.sequence !== value.sequence) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['sequence'], message: 'envelope sequence must match event sequence' });
  }
  if (value.mutationRequested && value.source !== 'postgres_outbox') {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['source'], message: 'mutation workflow events must originate from the Postgres outbox' });
  }
});

export type JetStreamWorkflowEnvelopeV1 = z.infer<typeof jetStreamWorkflowEnvelopeV1Schema>;

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

export function jetStreamWorkflowEventChecksum(event: WorkflowActionEventV1): string {
  return createHash('sha256').update(stable(event), 'utf8').digest('hex');
}

export function buildJetStreamWorkflowEnvelopeV1(
  input: Omit<z.input<typeof jetStreamWorkflowEnvelopeV1Schema>, 'eventChecksum'>,
): JetStreamWorkflowEnvelopeV1 {
  const event = workflowActionEventSchema.parse(input.event);
  return jetStreamWorkflowEnvelopeV1Schema.parse({
    ...input,
    event,
    eventChecksum: jetStreamWorkflowEventChecksum(event),
  });
}
