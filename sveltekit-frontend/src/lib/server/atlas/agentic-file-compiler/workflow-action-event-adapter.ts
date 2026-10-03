import { WorkflowActionEventSchema, type WorkflowActionEventV1 } from './contracts.js';
import { toCanonicalWorkflowActionEvent } from './contracts.js';

import type { WorkflowActionEventV1 as CanonicalWorkflowActionEventV1 } from '@deeds/parent-atlas/core/workflow-action-event';

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

export interface CanonicalWorkflowActionWriterRequest {
	event: CanonicalWorkflowActionEventV1;
	workflowName: string;
	workflowVersion: string;
	tenantId: string;
	initiatedBy: string;
	inputPacket: Record<string, unknown>;
	actionType: string;
	permissionScope: string[];
	riskLevel?: number;
	idempotencyKey: string;
}

const CANONICAL_PERSISTED_KINDS = new Set<WorkflowActionEventV1['kind']>([
	'scheduled', 'started', 'progress', 'artifact', 'blocked', 'retrying',
	'completed', 'failed', 'cancelled',
]);

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

/**
 * Convert the compiler-facing lifecycle event into the stricter canonical
 * workflow-event shape used by the durable action/outbox writer. Compiler-only
 * lifecycle kinds fail closed instead of being silently relabeled.
 */
export function workflowEventToCanonicalActionWriterRequest(input: WorkflowActionEventV1, context: {
	tenantId: string;
	initiatedBy: string;
	permissionScope: string[];
	riskLevel?: number;
}): CanonicalWorkflowActionWriterRequest {
	const event = WorkflowActionEventSchema.parse(input);
	if (!CANONICAL_PERSISTED_KINDS.has(event.kind)) {
		throw new Error(`WORKFLOW_ACTION_EVENT_KIND_NOT_CANONICAL_PERSISTENCE: '${event.kind}'`);
	}

	const bridge = toCanonicalWorkflowActionEvent(event);
	const canonical = {
		schema: 'atlas.workflow-action.v1' as const,
		workflowId: bridge.workflowId,
		workflowRevision: bridge.workflowRevision,
		runId: bridge.runId,
		sequence: bridge.sequence,
		actionId: bridge.actionId,
		...(bridge.parentActionId ? { parentActionId: bridge.parentActionId } : {}),
		dagNodeId: bridge.dagNodeId,
		attempt: bridge.attempt,
		lane: bridge.lane,
		...(bridge.transport ? { transport: bridge.transport } : {}),
		kind: bridge.kind,
		resourceRefs: [],
		evidenceRefs: bridge.evidenceRefs ?? [],
		artifactRefs: [],
		...(bridge.revisions ? { revisions: bridge.revisions } : {}),
		producerRevision: bridge.producerRevision,
	} as CanonicalWorkflowActionEventV1;

	return {
		event: canonical,
		workflowName: event.workflowId,
		workflowVersion: String(event.workflowRevision),
		tenantId: context.tenantId,
		initiatedBy: context.initiatedBy,
		inputPacket: event as unknown as Record<string, unknown>,
		actionType: `atlas.workflow.${event.kind}`,
		permissionScope: [...context.permissionScope],
		...(context.riskLevel != null ? { riskLevel: context.riskLevel } : {}),
		idempotencyKey: `${event.workflowId}:${event.workflowRevision}:${event.runId}:${event.dagNodeId}:${event.attempt}:${event.kind}`,
	};
}
