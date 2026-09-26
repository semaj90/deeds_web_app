import {
	writeCanonicalWorkflowActionAtomically,
	type ActionWriteResult,
} from '$lib/server/agent/action-writer.js';

import {
	workflowEventToCanonicalActionWriterRequest,
	type CanonicalWorkflowActionWriterRequest,
} from './workflow-action-event-adapter.js';
import type { WorkflowActionEventV1 } from './contracts.js';

/**
 * Single compiler persistence seam. The existing action/outbox writer remains
 * the transaction owner; this wrapper performs no alternate persistence.
 */
export async function persistWorkflowActionEventV1(
	event: WorkflowActionEventV1,
	context: Omit<CanonicalWorkflowActionWriterRequest, 'event' | 'inputPacket' | 'workflowName' | 'workflowVersion' | 'actionType' | 'idempotencyKey'>,
): Promise<ActionWriteResult> {
	const request = workflowEventToCanonicalActionWriterRequest(event, context);
	return writeCanonicalWorkflowActionAtomically(request);
}
