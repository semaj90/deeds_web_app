import { z } from 'zod';

/** Optional cross-system fields carried inside kanban_task_events.payload. */
export const KanbanTaskEventCorrelationPayloadSchema = z.object({
  pickupId: z.string().min(1).optional(),
  agentName: z.string().min(1).optional(),
  traceId: z.string().min(1).optional(),
  requestId: z.string().min(1).optional(),
  workflowRunId: z.string().min(1).optional(),
  workspaceRevision: z.string().min(1).nullable().optional(),
  graphifyRevision: z.string().min(1).nullable().optional(),
  featureRevision: z.string().min(1).nullable().optional(),
  permissionMode: z.enum(['read_only', 'proposal_only', 'patch_allowed']).optional(),
}).passthrough();

export type KanbanTaskEventCorrelationPayload = z.infer<typeof KanbanTaskEventCorrelationPayloadSchema>;

export function parseKanbanTaskEventCorrelationPayload(
  payload: Record<string, unknown>,
): KanbanTaskEventCorrelationPayload {
  return KanbanTaskEventCorrelationPayloadSchema.parse(payload);
}
