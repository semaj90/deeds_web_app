/**
 * Parent Atlas Agentic Workboard & ACE-Subprompt-FSM Runner (v1)
 *
 * Wires together:
 * 1. Daily Graphify Kanban ACE Context Packet (`atlas.kanban-ace-packet.v1`)
 * 2. MEM-05 GPU Residency Budget Guard (`admitGpuResidencyLeaseV1`)
 * 3. SUBPROMPT-CONTRACT-01 (`SubpromptRequestBoundaryV1` + `validateSubpromptResponseAgainstRequestV1`)
 * 4. AGENT-FSM-01 (`acceptAgentPlanV1` + `assertAgentActionAllowedAfterPlanAcceptanceV1`)
 *
 * Invariants:
 * - Never mutates Kanban tables or auto-promotes task status (`canonicalAuthority: false`).
 * - Rejects unallowed evidence/task citations and GPU OOM-risk leases before execution.
 */

import {
	acceptAgentPlanV1,
	assertAgentActionAllowedAfterPlanAcceptanceV1,
	type AgentPlanAcceptanceReceiptV1
} from './agent-execution-spine-v1.js';
import {
	admitGpuResidencyLeaseV1,
	validateSubpromptResponseAgainstRequestV1,
	type GpuResidencyLeaseReceiptV1,
	type SubpromptRequestBoundaryV1,
	type SubpromptResponseBoundaryV1
} from './subprompt-vram-contract-v1.js';
import {
	promoteGepaCandidateWithReviewV1,
	type BoundedExecutionReceiptsV1,
	type FrozenEvalSplitV1,
	type GepaPromotionReceiptV1
} from './oak-gepa-heldout-gate-v1.js';

export interface KanbanAcePacketInputV1 {
	readonly schema: 'atlas.kanban-ace-packet.v1';
	readonly redisKeyHint: string;
	readonly packetSha256: string;
	readonly ContextBlob: {
		readonly prefillTasks: ReadonlyArray<{
			readonly taskId: string;
			readonly sourceRef: string;
			readonly quickHitScore: number;
		}>;
	};
}

export interface WorkboardGateResultV1 {
	readonly request: SubpromptRequestBoundaryV1;
	readonly gpuLease: GpuResidencyLeaseReceiptV1 | null;
	readonly planReceipt: AgentPlanAcceptanceReceiptV1;
	readonly admittedActionId: string;
}

export function runAgenticWorkboardGateV1(input: {
	requestId: string;
	executionId: string;
	acePacket: KanbanAcePacketInputV1;
	gpuRequest?: { workerId: string; requiredMiB: number; freeVramMiB: number };
	subpromptResponse: Omit<SubpromptResponseBoundaryV1, 'schema' | 'canonicalAuthority'>;
	proposedNextActionId: string;
}): WorkboardGateResultV1 {
	const contextManifestChecksum = `sha256:${input.acePacket.packetSha256}`;
	const allowedEvidenceIds = input.acePacket.ContextBlob.prefillTasks.map((t) => t.taskId);

	const gpuLease = input.gpuRequest ? admitGpuResidencyLeaseV1(input.gpuRequest) : null;

	const request: SubpromptRequestBoundaryV1 = {
		schema: 'atlas.subprompt-request.v1',
		requestId: input.requestId,
		contextManifestChecksum,
		acePacketKey: input.acePacket.redisKeyHint,
		allowedEvidenceIds,
		promptSurface: 'model_proposal',
		maxOutputTokens: 2048
	};

	validateSubpromptResponseAgainstRequestV1(request, {
		...input.subpromptResponse,
		schema: 'atlas.subprompt-response.v1',
		canonicalAuthority: false
	});

	const planReceipt = acceptAgentPlanV1({
		requestId: input.requestId,
		executionId: input.executionId,
		planRevision: 'workboard-v1',
		planChecksum: contextManifestChecksum,
		consumedActionIds: ['load_kanban_ace_packet', 'validate_subprompt'],
		planningActionIds: ['rank_prefill_tasks'],
		allowedNextActionIds: [input.proposedNextActionId]
	});

	assertAgentActionAllowedAfterPlanAcceptanceV1({
		receipt: planReceipt,
		requestId: input.requestId,
		executionId: input.executionId,
		planRevision: 'workboard-v1',
		planChecksum: contextManifestChecksum,
		actionId: input.proposedNextActionId
	});

	return {
		request,
		gpuLease,
		planReceipt,
		admittedActionId: input.proposedNextActionId
	};
}

/**
 * Emits an `atlas.agentic-repair-example.v1` envelope compatible with
 * `python/parent_atlas_dspy_repair.py::admit_agentic_repair_example_v1()`.
 */
export function buildDspyRepairExampleEnvelopeV1(input: {
	taskId: string;
	canonicalId: string;
	packetKey: string;
	sourceRevision: string;
	workspaceRevision: string;
	filePath: string;
	startByte: number;
	endByte: number;
	errorMessage: string;
	candidateIds: string[];
	validatorId: string;
}) {
	return {
		schema: 'atlas.agentic-repair-example.v1' as const,
		taskId: input.taskId,
		canonicalId: input.canonicalId,
		packetKey: input.packetKey,
		sourceRevision: input.sourceRevision,
		workspaceRevision: input.workspaceRevision,
		sourceRefs: [
			{
				locator: {
					filePath: input.filePath,
					startByte: input.startByte,
					endByte: input.endByte
				},
				surface: 'typescript'
			}
		],
		error: {
			message: input.errorMessage,
			validatorId: input.validatorId
		},
		retrieval: {
			candidateIds: input.candidateIds
		},
		expectedOutcome: {
			validatorId: input.validatorId,
			requiresReadback: true
		}
	};
}

/**
 * Closed-loop gate: runs workboard admission + FSM PLAN_VALIDATED receipt,
 * then enforces GEPA held-out isolation, OaK judge receipts, and human approval
 * before emitting an immutable promotion receipt.
 */
export function runWorkboardAndPromotionLoopV1(input: {
	workboard: Parameters<typeof runAgenticWorkboardGateV1>[0];
	split: FrozenEvalSplitV1;
	receipts: BoundedExecutionReceiptsV1;
	consumedCandidateChecksums: Set<string>;
	humanReview: { reviewerId: string; approved: boolean };
}): {
	workboard: WorkboardGateResultV1;
	promotion: GepaPromotionReceiptV1;
} {
	const workboard = runAgenticWorkboardGateV1(input.workboard);
	const promotion = promoteGepaCandidateWithReviewV1({
		split: input.split,
		receipts: input.receipts,
		consumedCandidateChecksums: input.consumedCandidateChecksums,
		humanReview: input.humanReview
	});
	return { workboard, promotion };
}
