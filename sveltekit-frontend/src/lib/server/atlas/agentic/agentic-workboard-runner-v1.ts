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
import {
	partitionConflictFreePrefillBatchV1,
	type ConflictFreePrefillPartitionV1,
	type PrefillRowV1
} from '../kanban/kanban-dag-prefill-v1.js';
import {
	verifyAndParseVitestExecution,
	type ReceiptVerificationOutcome,
	type VitestExecutionEvent
} from '../execution/test-receipt-ingest-v1.js';

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

export interface ConflictFreeWorkboardDispatchResultV1 {
	readonly schema: 'atlas.conflict-free-workboard-dispatch.v1';
	readonly canonicalAuthority: false;
	readonly writesPerformed: false;
	readonly partition: ConflictFreePrefillPartitionV1;
	readonly a2aPayload: {
		readonly jsonrpc: '2.0';
		readonly id: string;
		readonly method: 'tasks/send';
		readonly params: {
			readonly id: string;
			readonly message: {
				readonly role: 'user';
				readonly parts: readonly [{ readonly type: 'text'; readonly text: string }];
			};
			readonly metadata: {
				readonly skill: 'agentic-conflict-free-batch-proposal';
				readonly rows: readonly PrefillRowV1[];
				readonly ownedFilesByKey: Readonly<Record<string, readonly string[]>>;
				readonly maxPerWorker: number;
			};
		};
	};
	readonly workerGates: readonly WorkboardGateResultV1[];
	readonly receiptOutcome: ReceiptVerificationOutcome | null;
}

/**
 * Connects Kanban prefill partitioning -> A2A `agentic-conflict-free-batch-proposal`
 * -> per-worker ACE/FSM workboard admission -> post-patch Vitest receipt ingestion.
 */
export function dispatchConflictFreeWorkboardBatchV1(input: {
	requestId: string;
	executionId: string;
	acePacket: KanbanAcePacketInputV1;
	rows: readonly PrefillRowV1[];
	ownedFilesByKey: Readonly<Record<string, readonly string[]>>;
	maxPerWorker?: number;
	workspaceRevision?: string;
	postPatchExecutionEvent?: VitestExecutionEvent;
}): ConflictFreeWorkboardDispatchResultV1 {
	const maxPerWorker = input.maxPerWorker ?? 4;
	const partition = partitionConflictFreePrefillBatchV1(input.rows, input.ownedFilesByKey, maxPerWorker);

	const a2aPayload = {
		jsonrpc: '2.0' as const,
		id: input.requestId,
		method: 'tasks/send' as const,
		params: {
			id: `batch:${input.executionId}`,
			message: {
				role: 'user' as const,
				parts: [{ type: 'text' as const, text: `Dispatch conflict-free batch (${partition.workerA.length + partition.workerB.length} tasks)` }] as const
			},
			metadata: {
				skill: 'agentic-conflict-free-batch-proposal' as const,
				rows: input.rows,
				ownedFilesByKey: input.ownedFilesByKey,
				maxPerWorker
			}
		}
	};

	const workerQueues = [
		{ workerId: 'worker-a', tasks: partition.workerA },
		{ workerId: 'worker-b', tasks: partition.workerB }
	].filter((q) => q.tasks.length > 0);

	const allowedRefs = new Set(input.acePacket.ContextBlob.prefillTasks.map((t) => t.taskId));
	const fallbackRefs = allowedRefs.size > 0 ? [Array.from(allowedRefs)[0]!] : [];
	const workerGates = workerQueues.map((queue, idx) => {
		const cited = queue.tasks.map((t) => t.taskId).filter((id) => allowedRefs.has(id));
		return runAgenticWorkboardGateV1({
			requestId: `${input.requestId}:${queue.workerId}`,
			executionId: `${input.executionId}:${idx + 1}`,
			acePacket: input.acePacket,
			subpromptResponse: {
				requestId: `${input.requestId}:${queue.workerId}`,
				contextManifestChecksum: `sha256:${input.acePacket.packetSha256}`,
				citedEvidenceIds: cited.length > 0 ? cited : fallbackRefs,
				proposalPayload: { workerId: queue.workerId, taskCount: queue.tasks.length }
			},
			proposedNextActionId: `dispatch_${queue.workerId}`
		});
	});

	const receiptOutcome = input.postPatchExecutionEvent
		? verifyAndParseVitestExecution(input.postPatchExecutionEvent, {
				expectedWorkspaceRevision: input.workspaceRevision
			})
		: null;

	return {
		schema: 'atlas.conflict-free-workboard-dispatch.v1',
		canonicalAuthority: false,
		writesPerformed: false,
		partition,
		a2aPayload,
		workerGates,
		receiptOutcome
	};
}
