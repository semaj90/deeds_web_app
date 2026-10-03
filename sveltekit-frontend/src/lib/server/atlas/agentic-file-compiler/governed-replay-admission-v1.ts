import {
	workflowActionEventSchema,
	workflowActionEventToRuntimeEvidence,
	type WorkflowActionEventReceiptV1,
	type WorkflowActionEventV1,
} from '@deeds/parent-atlas/core/workflow-action-event';
import {
	FileMutationPlanSchema,
	type FileMutationPlanV1,
} from './contracts.js';
import { resolveMutationApproval, type MutationApprovalRecordV1 } from './mutation-approval-resolver.js';
import { preflightFileMutation, type MutationPreflightResult } from './file-mutation-guard.js';

export type GovernedReplayStatusV1 =
	| 'ADMITTED_READ_ONLY'
	| 'REJECTED_NO_APPROVAL'
	| 'REJECTED_EVENT_PLAN_MISMATCH'
	| 'REJECTED_APPROVAL'
	| 'REJECTED_PREFLIGHT';

export interface GovernedReplayAdmissionV1 {
	status: GovernedReplayStatusV1;
	writesPerformed: false;
	canonicalEvent: WorkflowActionEventV1 | null;
	eventReceipt: WorkflowActionEventReceiptV1 | null;
	plan: FileMutationPlanV1 | null;
	approvalErrors: string[];
	preflight: MutationPreflightResult | null;
	errors: string[];
}

function reject(
	status: GovernedReplayStatusV1,
	input: Partial<GovernedReplayAdmissionV1> = {},
): GovernedReplayAdmissionV1 {
	return {
		status,
		writesPerformed: false,
		canonicalEvent: input.canonicalEvent ?? null,
		eventReceipt: input.eventReceipt ?? null,
		plan: input.plan ?? null,
		approvalErrors: input.approvalErrors ?? [],
		preflight: input.preflight ?? null,
		errors: input.errors ?? [],
	};
}

/**
 * Read-only admission proof for an agentic replay.
 *
 * This adapter intentionally stops before a filesystem mutation. The actual mutation
 * executor must consume an admitted result plus its own receipt-writing boundary.
 */
export function admitGovernedReplayV1(input: {
	event: unknown;
	plan: unknown;
	approvalRecord?: MutationApprovalRecordV1;
	workspaceRoot: string;
	now?: Date;
}): GovernedReplayAdmissionV1 {
	const eventResult = workflowActionEventSchema.safeParse(input.event);
	if (!eventResult.success) {
		return reject('REJECTED_EVENT_PLAN_MISMATCH', { errors: ['canonical workflow event is invalid'] });
	}
	const canonicalEvent = eventResult.data;
	const eventReceipt = workflowActionEventToRuntimeEvidence(canonicalEvent).receipt;

	if (!input.plan || typeof input.plan !== 'object' || !('approvalReceipt' in input.plan)) {
		return reject('REJECTED_NO_APPROVAL', {
			canonicalEvent,
			eventReceipt,
			errors: ['mutation plan has no approval receipt'],
		});
	}

	const planResult = FileMutationPlanSchema.safeParse(input.plan);
	if (!planResult.success) {
		return reject('REJECTED_APPROVAL', {
			canonicalEvent,
			eventReceipt,
			errors: ['mutation plan is invalid'],
		});
	}
	const plan = planResult.data;

	if (
		canonicalEvent.workflowId !== plan.workflowId ||
		canonicalEvent.actionId !== plan.mutationId ||
		canonicalEvent.revisions?.workspace !== plan.workspaceRevision
	) {
		return reject('REJECTED_EVENT_PLAN_MISMATCH', {
			canonicalEvent,
			eventReceipt,
			plan,
			errors: ['canonical event and mutation plan identity/revision mismatch'],
		});
	}

	if (!input.approvalRecord) {
		return reject('REJECTED_NO_APPROVAL', {
			canonicalEvent,
			eventReceipt,
			plan,
			errors: ['approval record is required for governed replay'],
		});
	}

	const approval = resolveMutationApproval(plan, input.approvalRecord, input.now);
	if (!approval.valid) {
		return reject('REJECTED_APPROVAL', {
			canonicalEvent,
			eventReceipt,
			plan,
			approvalErrors: approval.errors,
			errors: approval.errors,
		});
	}

	const preflight = preflightFileMutation(plan, input.workspaceRoot);
	if (!preflight.ok) {
		return reject('REJECTED_PREFLIGHT', {
			canonicalEvent,
			eventReceipt,
			plan,
			preflight,
			errors: preflight.errors,
		});
	}

	return {
		status: 'ADMITTED_READ_ONLY',
		writesPerformed: false,
		canonicalEvent,
		eventReceipt,
		plan,
		approvalErrors: [],
		preflight,
		errors: [],
	};
}
