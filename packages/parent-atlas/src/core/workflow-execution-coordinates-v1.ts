import { createHash } from 'node:crypto';
import { z } from 'zod';

const nonEmpty = z.string().min(1);

export const workflowExecutionCoordinatesSchema = z.object({
  schema: z.literal('atlas.workflow-execution-coordinates.v1'),
  workflowId: nonEmpty,
  workflowRevision: z.number().int().nonnegative(),
  workflowSpecChecksum: z.string().regex(/^[a-f0-9]{64}$/),
  framework: z.enum(['local', 'langgraph_functional', 'langgraph_stategraph', 'mastra']),
  orchestrationRuntime: z.enum(['in_process', 'langgraph_pregel', 'mastra_engine', 'temporal']),
  checkpointProvider: z.enum(['none', 'memory', 'langgraph_postgres', 'mastra_storage', 'temporal_history']),
  actionExecutor: z.enum(['local', 'grpc_worker', 'gpu_worker']),
  transport: z.enum(['inproc', 'grpc', 'acp', 'a2a']),
  workflowActionEventSchema: z.literal('atlas.workflow-action.v1'),
  canonicalIdentityOwner: z.literal('workflow_action_event'),
  coordinatesChecksum: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();

export type WorkflowExecutionCoordinatesV1 = z.infer<typeof workflowExecutionCoordinatesSchema>;

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

function sha256(value: unknown): string {
  return createHash('sha256').update(stable(value), 'utf8').digest('hex');
}

export function buildWorkflowExecutionCoordinates(input: Omit<WorkflowExecutionCoordinatesV1, 'coordinatesChecksum'>): WorkflowExecutionCoordinatesV1 {
  const body = workflowExecutionCoordinatesSchema.omit({ coordinatesChecksum: true }).parse(input);
  return workflowExecutionCoordinatesSchema.parse({ ...body, coordinatesChecksum: sha256(body) });
}

export function describeWorkflowExecutionCoordinates(): string {
  return [
    'Framework, orchestration runtime, checkpoint provider, action executor, and transport are separate coordinates.',
    'WorkflowActionEventV1 remains the workflow/action identity owner.',
    'Checkpoints and protocol transports are replaceable execution mechanisms, not canonical Atlas state.',
  ].join(' ');
}
