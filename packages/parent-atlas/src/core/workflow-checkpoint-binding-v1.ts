import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  workflowActionEventSchema,
  type WorkflowActionEventV1,
} from './workflow-action-event.js';
import {
  workflowExecutionCoordinatesSchema,
  type WorkflowExecutionCoordinatesV1,
} from './workflow-execution-coordinates-v1.js';

const checksum = (value: unknown): string => createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex');

export const workflowCheckpointBindingSchema = z.object({
  schema: z.literal('atlas.workflow-checkpoint-binding.v1'),
  workflowId: z.string().min(1),
  workflowRevision: z.number().int().nonnegative(),
  actionId: z.string().min(1),
  dagNodeId: z.string().min(1),
  attempt: z.number().int().positive(),
  checkpointId: z.string().min(1),
  checkpointRevision: z.string().min(1),
  checkpointProvider: z.enum(['none', 'memory', 'langgraph_postgres', 'mastra_storage', 'temporal_history']),
  coordinatesChecksum: z.string().regex(/^[a-f0-9]{64}$/),
  canonicalIdentityOwner: z.literal('workflow_action_event'),
  bindingChecksum: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();

export type WorkflowCheckpointBindingV1 = z.infer<typeof workflowCheckpointBindingSchema>;

function bindingBody(
  event: WorkflowActionEventV1,
  coordinates: WorkflowExecutionCoordinatesV1,
  checkpointId: string,
  checkpointRevision: string,
) {
  if (event.workflowId !== coordinates.workflowId || event.workflowRevision !== coordinates.workflowRevision) {
    throw new Error('WORKFLOW_CHECKPOINT_COORDINATE_MISMATCH');
  }
  return {
    schema: 'atlas.workflow-checkpoint-binding.v1' as const,
    workflowId: event.workflowId,
    workflowRevision: event.workflowRevision,
    actionId: event.actionId,
    dagNodeId: event.dagNodeId,
    attempt: event.attempt,
    checkpointId,
    checkpointRevision,
    checkpointProvider: coordinates.checkpointProvider,
    coordinatesChecksum: coordinates.coordinatesChecksum,
    canonicalIdentityOwner: 'workflow_action_event' as const,
  };
}

export function bindWorkflowCheckpointV1(input: {
  event: WorkflowActionEventV1;
  coordinates: WorkflowExecutionCoordinatesV1;
  checkpointId: string;
  checkpointRevision: string;
}): WorkflowActionEventV1 {
  const event = workflowActionEventSchema.parse(input.event);
  const coordinates = workflowExecutionCoordinatesSchema.parse(input.coordinates);
  const body = bindingBody(event, coordinates, input.checkpointId, input.checkpointRevision);
  const binding = workflowCheckpointBindingSchema.parse({ ...body, bindingChecksum: checksum(body) });
  return workflowActionEventSchema.parse({
    ...event,
    metadata: { ...event.metadata, checkpointBinding: binding },
  });
}

export function verifyWorkflowCheckpointBindingV1(
  eventInput: WorkflowActionEventV1,
  coordinatesInput: WorkflowExecutionCoordinatesV1,
): WorkflowCheckpointBindingV1 {
  const event = workflowActionEventSchema.parse(eventInput);
  const coordinates = workflowExecutionCoordinatesSchema.parse(coordinatesInput);
  const binding = workflowCheckpointBindingSchema.parse(event.metadata.checkpointBinding);
  const body = bindingBody(event, coordinates, binding.checkpointId, binding.checkpointRevision);
  if (binding.bindingChecksum !== checksum(body)) throw new Error('WORKFLOW_CHECKPOINT_BINDING_CHECKSUM_MISMATCH');
  return binding;
}
