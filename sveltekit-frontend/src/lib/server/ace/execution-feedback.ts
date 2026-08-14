import type { ContextManifest, RepairOutcomeObservation } from './context-compiler.parent-atlas.js';
import type { RlmRuntimeReceipt } from '$lib/server/atlas/rlm/rlm-runtime.js';

export interface AceExecutionFeedbackInput {
	manifest: ContextManifest;
	rlmReceipt?: Pick<RlmRuntimeReceipt, 'requestId' | 'workspaceRevision' | 'policyRevision' | 'observed'>;
	executionId: string;
	success: boolean;
	validationPassed?: boolean;
	attempts?: number;
	retrievalLatencyMs?: number;
	totalRuntimeMs?: number;
	failureKind?: string;
}

export interface AceExecutionFeedback {
	requestId: string;
	manifestId: string;
	manifestHash: string;
	workspaceRevision?: string;
	policyRevision?: string;
	executionId: string;
	success: boolean;
	helpfulDelta: number;
	harmfulDelta: number;
	failureKind?: string;
	selectedPacketKeys: string[];
	selectedProcessIds: string[];
	outcome: RepairOutcomeObservation;
}

/**
 * Pure bridge from validated execution outcomes to ACE feedback. It does not
 * write a playbook or mutate canonical truth; a later approved curator owns
 * persistence.
 */
export function buildAceExecutionFeedback(input: AceExecutionFeedbackInput): AceExecutionFeedback {
	const success = input.success && input.validationPassed !== false;
	const outcome: RepairOutcomeObservation = {
		request_id: input.manifest.request_id,
		manifest_id: input.manifest.manifest_id,
		success,
		attempts: input.attempts ?? 1,
		retrieval_latency_ms: input.retrievalLatencyMs,
		total_runtime_ms: input.totalRuntimeMs,
		validation_passed: input.validationPassed ?? success,
	};
	return {
		requestId: input.manifest.request_id,
		manifestId: input.manifest.manifest_id,
		manifestHash: input.manifest.manifest_id,
		workspaceRevision: input.rlmReceipt?.workspaceRevision,
		policyRevision: input.rlmReceipt?.policyRevision,
		executionId: input.executionId,
		success,
		helpfulDelta: success ? 1 : 0,
		harmfulDelta: success ? 0 : 1,
		failureKind: input.failureKind,
		selectedPacketKeys: [...input.manifest.selected_packet_keys],
		selectedProcessIds: [...(input.manifest.selected_process_ids ?? [])],
		outcome,
	};
}
