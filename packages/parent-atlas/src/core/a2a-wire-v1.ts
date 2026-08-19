import { createHash } from 'node:crypto';
import { z } from 'zod';
import { workflowActionEventSchema, type WorkflowActionEventV1 } from './workflow-action-event.js';

const id = z.string().min(1);
const revision = z.string().min(1);
const checksum = z.string().regex(/^[a-f0-9]{64}$/);

/**
 * A2A release/specification is 1.0.0, while AgentInterface.protocolVersion
 * uses the major.minor wire value "1.0" per the normative v1 data model.
 */
export const A2A_RELEASE_VERSION = '1.0.0' as const;
export const A2A_PROTOCOL_VERSION = '1.0' as const;
export const A2A_CORE_BINDINGS = ['JSONRPC', 'GRPC', 'HTTP+JSON'] as const;

export const a2aTaskStateSchema = z.enum([
  'TASK_STATE_UNSPECIFIED',
  'TASK_STATE_SUBMITTED',
  'TASK_STATE_WORKING',
  'TASK_STATE_COMPLETED',
  'TASK_STATE_FAILED',
  'TASK_STATE_CANCELED',
  'TASK_STATE_INPUT_REQUIRED',
  'TASK_STATE_REJECTED',
  'TASK_STATE_AUTH_REQUIRED',
]);
export type A2aTaskStateV1 = z.infer<typeof a2aTaskStateSchema>;

const jsonScalarSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
export const jsonValueSchema: z.ZodType<unknown> = z.lazy(() => z.union([
  jsonScalarSchema,
  z.array(jsonValueSchema),
  z.record(z.string(), jsonValueSchema),
]));

export const a2aPartSchema = z.object({
  text: z.string().optional(),
  raw: z.string().optional(),
  url: z.string().optional(),
  data: jsonValueSchema.optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  filename: z.string().min(1).optional(),
  mediaType: z.string().min(1).optional(),
}).strict().superRefine((part, ctx) => {
  const contentMembers = [part.text !== undefined, part.raw !== undefined, part.url !== undefined, part.data !== undefined]
    .filter(Boolean).length;
  if (contentMembers !== 1) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'A2A Part MUST contain exactly one of text/raw/url/data' });
  }
  if (part.raw !== undefined && !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(part.raw)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['raw'], message: 'A2A raw bytes must be base64 in JSON serialization' });
  }
});
export type A2aPartV1 = z.infer<typeof a2aPartSchema>;

export const a2aArtifactSchema = z.object({
  artifactId: id,
  name: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  parts: z.array(a2aPartSchema).min(1),
  metadata: z.record(z.string(), z.unknown()).optional(),
  extensions: z.array(z.string().min(1)).optional(),
}).strict();
export type A2aArtifactV1 = z.infer<typeof a2aArtifactSchema>;

export const a2aMessageSchema = z.object({
  messageId: id,
  contextId: id.optional(),
  taskId: id.optional(),
  role: z.enum(['ROLE_UNSPECIFIED', 'ROLE_USER', 'ROLE_AGENT']),
  parts: z.array(a2aPartSchema).min(1),
  metadata: z.record(z.string(), z.unknown()).optional(),
  extensions: z.array(z.string().min(1)).optional(),
  referenceTaskIds: z.array(id).optional(),
}).strict();
export type A2aMessageV1 = z.infer<typeof a2aMessageSchema>;

export const a2aTaskStatusSchema = z.object({
  state: a2aTaskStateSchema,
  message: a2aMessageSchema.optional(),
  timestamp: z.string().datetime({ offset: true }).optional(),
}).strict();
export type A2aTaskStatusV1 = z.infer<typeof a2aTaskStatusSchema>;

export const a2aTaskSchema = z.object({
  id,
  contextId: id.optional(),
  status: a2aTaskStatusSchema,
  artifacts: z.array(a2aArtifactSchema).optional(),
  history: z.array(a2aMessageSchema).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
}).strict();
export type A2aTaskV1 = z.infer<typeof a2aTaskSchema>;

export const a2aTaskStatusUpdateEventSchema = z.object({
  taskId: id,
  contextId: id,
  status: a2aTaskStatusSchema,
  metadata: z.record(z.string(), z.unknown()).optional(),
}).strict();
export type A2aTaskStatusUpdateEventV1 = z.infer<typeof a2aTaskStatusUpdateEventSchema>;

export const a2aTaskArtifactUpdateEventSchema = z.object({
  taskId: id,
  contextId: id,
  artifact: a2aArtifactSchema,
  append: z.boolean().optional(),
  lastChunk: z.boolean().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
}).strict();
export type A2aTaskArtifactUpdateEventV1 = z.infer<typeof a2aTaskArtifactUpdateEventSchema>;

/** ProtoJSON StreamResponse oneof: exactly one member, no v0.x kind/final field. */
export const a2aStreamResponseSchema = z.object({
  task: a2aTaskSchema.optional(),
  message: a2aMessageSchema.optional(),
  statusUpdate: a2aTaskStatusUpdateEventSchema.optional(),
  artifactUpdate: a2aTaskArtifactUpdateEventSchema.optional(),
}).strict().superRefine((response, ctx) => {
  const memberCount = [response.task, response.message, response.statusUpdate, response.artifactUpdate]
    .filter((value) => value !== undefined).length;
  if (memberCount !== 1) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'A2A StreamResponse MUST contain exactly one of task/message/statusUpdate/artifactUpdate' });
  }
});
export type A2aStreamResponseV1 = z.infer<typeof a2aStreamResponseSchema>;

export const a2aAgentInterfaceSchema = z.object({
  url: z.string().min(1),
  protocolBinding: z.enum(A2A_CORE_BINDINGS),
  tenant: z.string().min(1).optional(),
  protocolVersion: z.literal(A2A_PROTOCOL_VERSION),
}).strict().superRefine((value, ctx) => {
  if (value.protocolBinding === 'GRPC') {
    if (!/^[A-Za-z0-9.-]+:\d+$/.test(value.url)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['url'], message: 'GRPC AgentInterface must use hostname:port' });
    }
  } else if (!/^https:\/\//.test(value.url)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['url'], message: 'HTTP-based A2A production interfaces must use absolute HTTPS URLs' });
  }
});
export type A2aAgentInterfaceV1 = z.infer<typeof a2aAgentInterfaceSchema>;

export const a2aProjectionReceiptSchema = z.object({
  schema: z.literal('atlas.a2a-wire-projection-receipt.v1').default('atlas.a2a-wire-projection-receipt.v1'),
  workflow_id: id,
  workflow_revision: z.number().int().nonnegative(),
  action_id: id,
  sequence: z.number().int().nonnegative(),
  task_id: id,
  context_id: id,
  protocol_release: z.literal(A2A_RELEASE_VERSION),
  protocol_version: z.literal(A2A_PROTOCOL_VERSION),
  wire_payload_checksum: checksum,
  event_checksum: checksum,
  canonical_authority: z.literal(false).default(false),
  producer_revision: revision,
}).strict();
export type A2aProjectionReceiptV1 = z.infer<typeof a2aProjectionReceiptSchema>;

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

export function a2aWireChecksum(value: unknown): string {
  return createHash('sha256').update(stable(value), 'utf8').digest('hex');
}

function stateForWorkflowEvent(event: WorkflowActionEventV1): A2aTaskStateV1 {
  switch (event.kind) {
    case 'scheduled': return 'TASK_STATE_SUBMITTED';
    case 'completed': return 'TASK_STATE_COMPLETED';
    case 'failed': return 'TASK_STATE_FAILED';
    case 'cancelled': return 'TASK_STATE_CANCELED';
    case 'blocked': {
      if (event.metadata['a2a_interruption'] === 'input_required') return 'TASK_STATE_INPUT_REQUIRED';
      if (event.metadata['a2a_interruption'] === 'auth_required') return 'TASK_STATE_AUTH_REQUIRED';
      return 'TASK_STATE_WORKING';
    }
    default: return 'TASK_STATE_WORKING';
  }
}

function artifactForAtlasRef(event: WorkflowActionEventV1, artifactRef: string): A2aArtifactV1 {
  return a2aArtifactSchema.parse({
    artifactId: artifactRef,
    parts: [{
      data: {
        atlasArtifactRef: artifactRef,
        workflowId: event.workflowId,
        actionId: event.actionId,
        sequence: event.sequence,
      },
      mediaType: 'application/json',
    }],
    metadata: {
      atlasWorkflowId: event.workflowId,
      atlasActionId: event.actionId,
      atlasSequence: event.sequence,
    },
  });
}

/**
 * Wire projection only. WorkflowActionEventV1 remains the internal identity and
 * ordering owner; A2A task/status/artifact IDs are protocol-layer resources.
 */
export function workflowEventToA2aWire(input: {
  event: z.input<typeof workflowActionEventSchema>;
  task_id: string;
  context_id: string;
  timestamp?: string;
  producer_revision: string;
}): {
  task: A2aTaskV1;
  streamResponses: A2aStreamResponseV1[];
  receipt: A2aProjectionReceiptV1;
} {
  const event = workflowActionEventSchema.parse(input.event);
  const status = a2aTaskStatusSchema.parse({
    state: stateForWorkflowEvent(event),
    timestamp: input.timestamp,
  });
  const artifacts = event.artifactRefs.map((artifactRef) => artifactForAtlasRef(event, artifactRef));
  const task = a2aTaskSchema.parse({
    id: input.task_id,
    contextId: input.context_id,
    status,
    ...(artifacts.length > 0 ? { artifacts } : {}),
    metadata: {
      atlasWorkflowId: event.workflowId,
      atlasWorkflowRevision: event.workflowRevision,
      atlasActionId: event.actionId,
      atlasDagNodeId: event.dagNodeId,
      atlasSequence: event.sequence,
      atlasLane: event.lane,
      atlasTransport: event.transport ?? null,
      atlasReceiptId: event.receiptId ?? null,
      atlasEvidenceRefs: event.evidenceRefs,
      atlasResourceRefs: event.resourceRefs,
      canonicalAuthority: false,
    },
  });

  const streamResponses: A2aStreamResponseV1[] = [];
  // For a newly observed task lifecycle the initial Task can be sent first.
  streamResponses.push(a2aStreamResponseSchema.parse({ task }));
  streamResponses.push(a2aStreamResponseSchema.parse({
    statusUpdate: {
      taskId: input.task_id,
      contextId: input.context_id,
      status,
      metadata: {
        atlasWorkflowId: event.workflowId,
        atlasActionId: event.actionId,
        atlasSequence: event.sequence,
      },
    },
  }));
  for (const artifact of artifacts) {
    streamResponses.push(a2aStreamResponseSchema.parse({
      artifactUpdate: {
        taskId: input.task_id,
        contextId: input.context_id,
        artifact,
        lastChunk: true,
        metadata: { atlasSequence: event.sequence },
      },
    }));
  }

  const receipt = a2aProjectionReceiptSchema.parse({
    workflow_id: event.workflowId,
    workflow_revision: event.workflowRevision,
    action_id: event.actionId,
    sequence: event.sequence,
    task_id: input.task_id,
    context_id: input.context_id,
    protocol_release: A2A_RELEASE_VERSION,
    protocol_version: A2A_PROTOCOL_VERSION,
    wire_payload_checksum: a2aWireChecksum({ task, streamResponses }),
    event_checksum: a2aWireChecksum(event),
    canonical_authority: false,
    producer_revision: input.producer_revision,
  });
  return { task, streamResponses, receipt };
}

export function describeA2aWireV1(): string {
  return [
    'A2A release 1.0.0 advertises protocolVersion 1.0 on AgentInterface; the core binding tokens are JSONRPC, GRPC and HTTP+JSON.',
    'A2A v1 Part uses member-presence oneof discrimination: exactly one of text/raw/url/data; no legacy kind discriminator is emitted.',
    'A2A v1 Task contains id/contextId/status/artifacts/history/metadata. Atlas workflow identity is carried only as metadata and remains owned by WorkflowActionEventV1.',
    'Streaming uses StreamResponse oneof members task/message/statusUpdate/artifactUpdate; no legacy event kind or final boolean is emitted.',
    'A2A projection is an external interoperability view and cannot authorize Atlas mutations or canonical promotion.',
  ].join(' ');
}
