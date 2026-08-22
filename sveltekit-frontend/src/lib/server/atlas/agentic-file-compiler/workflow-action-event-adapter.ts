import { WorkflowActionEventSchema, type WorkflowActionEventV1 } from './contracts.js';

export interface ExistingActionWriterRequest {
	workflowName: string;
	workflowVersion: string;
	tenantId: string;
	initiatedBy: string;
	inputPacket: Record<string, unknown>;
	actionType: string;
	permissionScope: string[];
	riskLevel?: number;
	causationId?: string;
	idempotencyKey: string;
}

/**
 * Pure adapter into the existing action-writer boundary. Persistence stays with
 * writeActionAtomically(); this module intentionally performs no DB writes.
 */
export function workflowEventToActionWriterRequest(input: WorkflowActionEventV1, context: {
	tenantId: string;
	initiatedBy: string;
	permissionScope: string[];
	riskLevel?: number;
}): ExistingActionWriterRequest {
	const event = WorkflowActionEventSchema.parse(input);
	return {
		workflowName: event.workflowId,
		workflowVersion: String(event.workflowRevision),
		tenantId: context.tenantId,
		initiatedBy: context.initiatedBy,
		inputPacket: event as unknown as Record<string, unknown>,
		actionType: `atlas.workflow.${event.kind}`,
		permissionScope: [...context.permissionScope],
		...(context.riskLevel != null ? { riskLevel: context.riskLevel } : {}),
		...(event.parentActionId ? { causationId: event.parentActionId } : {}),
		idempotencyKey: `${event.workflowId}:${event.workflowRevision}:${event.runId}:${event.dagNodeId}:${event.attempt}:${event.kind}`,
	};
}
