import {
	workflowActionEventSchema,
	workflowActionEventToRuntimeEvidence,
	workflowActionEventReceiptSchema,
	type WorkflowActionEventV1,
} from '@deeds/parent-atlas/core/workflow-action-event';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface CanonicalActionWriteInputV1 {
	runId: string;
	actionId: string;
	sequenceNo: number;
	eventType: string;
	causationId?: string;
	payload: Record<string, unknown>;
	event: WorkflowActionEventV1;
}

/**
 * Converts the canonical workflow event into the existing UUID-backed action-writer shape.
 * This is pure: it validates identity and builds the durable payload, but performs no I/O.
 */
export function prepareCanonicalActionWriteV1(input: unknown): CanonicalActionWriteInputV1 {
	const event = workflowActionEventSchema.parse(input);
	if (!event.runId || !UUID.test(event.runId)) {
		throw new Error('CANONICAL_WORKFLOW_EVENT_RUN_ID_MUST_BE_UUID');
	}
	if (!UUID.test(event.actionId)) {
		throw new Error('CANONICAL_WORKFLOW_EVENT_ACTION_ID_MUST_BE_UUID');
	}
	if (event.parentActionId && !UUID.test(event.parentActionId)) {
		throw new Error('CANONICAL_WORKFLOW_EVENT_PARENT_ACTION_ID_MUST_BE_UUID');
	}

	const { receipt } = workflowActionEventToRuntimeEvidence(event);
	return {
		runId: event.runId,
		actionId: event.actionId,
		sequenceNo: event.sequence,
		eventType: `action.${event.kind}`,
		...(event.parentActionId ? { causationId: event.parentActionId } : {}),
		payload: {
			canonicalEvent: event,
			eventReceipt: receipt,
		},
		event,
	};
}

export interface CanonicalActionReadbackV1 {
	event: unknown;
	workflowPayload: unknown;
	outboxPayload: unknown;
}

export type CanonicalIdentityDecisionV1 =
	| { kind: 'NEW' }
	| { kind: 'IDEMPOTENT_DUPLICATE'; eventChecksum: string }
	| { kind: 'CANONICAL_EVENT_IDENTITY_COLLISION'; existingEventChecksum: string; incomingEventChecksum: string };

/** Compare a stored canonical receipt before treating an existing row as a retry. */
export function classifyCanonicalIdentityV1(input: {
	event: unknown;
	existingEvent?: unknown;
	existingReceipt?: unknown;
}): CanonicalIdentityDecisionV1 {
	const event = workflowActionEventSchema.parse(input.event);
	const incoming = workflowActionEventToRuntimeEvidence(event).receipt.event_checksum;
	if (input.existingEvent === undefined && input.existingReceipt === undefined) return { kind: 'NEW' };
	const existingEvent = workflowActionEventSchema.parse(input.existingEvent);
	const existingReceipt = workflowActionEventReceiptSchema.parse(input.existingReceipt);
	if (existingEvent.runId !== event.runId || existingEvent.actionId !== event.actionId || existingEvent.sequence !== event.sequence) {
		return { kind: 'CANONICAL_EVENT_IDENTITY_COLLISION', existingEventChecksum: existingReceipt.event_checksum, incomingEventChecksum: incoming };
	}
	return existingReceipt.event_checksum === incoming
		? { kind: 'IDEMPOTENT_DUPLICATE', eventChecksum: incoming }
		: { kind: 'CANONICAL_EVENT_IDENTITY_COLLISION', existingEventChecksum: existingReceipt.event_checksum, incomingEventChecksum: incoming };
}

/** Validate the durable payloads without trusting storage presence alone. */
export function validateCanonicalActionReadbackV1(input: CanonicalActionReadbackV1): {
	event: WorkflowActionEventV1;
	eventChecksum: string;
	runtimeEvidenceChecksum: string;
} {
	const event = workflowActionEventSchema.parse(input.event);
	const workflowPayload = input.workflowPayload as Record<string, unknown> | null;
	const outboxPayload = input.outboxPayload as Record<string, unknown> | null;
	if (!workflowPayload || !outboxPayload) throw new Error('CANONICAL_WORKFLOW_EVENT_READBACK_MISSING_PAYLOAD');
	const storedEvent = workflowPayload.canonicalEvent;
	const storedReceipt = workflowPayload.eventReceipt;
	const outboxEvent = outboxPayload.canonicalEvent;
	const outboxReceipt = outboxPayload.eventReceipt;
	const { receipt } = workflowActionEventToRuntimeEvidence(event);
	workflowActionEventSchema.parse(storedEvent);
	workflowActionEventReceiptSchema.parse(storedReceipt);
	workflowActionEventSchema.parse(outboxEvent);
	workflowActionEventReceiptSchema.parse(outboxReceipt);
	if (JSON.stringify(storedEvent) !== JSON.stringify(event) || JSON.stringify(outboxEvent) !== JSON.stringify(event)) {
		throw new Error('CANONICAL_WORKFLOW_EVENT_READBACK_IDENTITY_MISMATCH');
	}
	if (JSON.stringify(storedReceipt) !== JSON.stringify(receipt) || JSON.stringify(outboxReceipt) !== JSON.stringify(receipt)) {
		throw new Error('CANONICAL_WORKFLOW_EVENT_READBACK_CHECKSUM_MISMATCH');
	}
	return { event, eventChecksum: receipt.event_checksum, runtimeEvidenceChecksum: receipt.runtime_evidence_checksum };
}
