import { buildGraphifyTaskCandidate, type GraphifyTaskCandidate } from '../contracts/graphify-task-candidate.js';
import type { DailyGraphifyBoardData, DailyGraphifyTask } from './daily-graphify-board.js';
import { SEMANTIC_REPRESENTATION_ID } from '../../embedding/embedding-contract-768.js';

export interface GraphifyTaskCandidateBuildContext {
	producerId?: string;
	producerRevision?: string;
	workspaceRevision?: string;
	sourceRevision?: string;
	graphRevision?: string | null;
	representationRevision?: string;
	generatedAt?: string;
}

function priorityFallback(task: DailyGraphifyTask): 'P0' | 'P1' | 'P2' | 'P3' {
	return task.priority;
}

function candidateKind(task: DailyGraphifyTask): 'graphify_evidence' | 'recommendation_review' {
	return task.origin === 'atlas_recommendation' ? 'recommendation_review' : 'graphify_evidence';
}

export function buildDailyGraphifyTaskCandidates(
	board: DailyGraphifyBoardData,
	context: GraphifyTaskCandidateBuildContext = {},
): GraphifyTaskCandidate[] {
	const producerId = context.producerId ?? 'daily-graphify-board';
	const producerRevision = context.producerRevision ?? board.generated;
	const workspaceRevision = context.workspaceRevision ?? 'main';
	const sourceRevision = context.sourceRevision ?? board.generated;
	const graphRevision = context.graphRevision ?? board.generated;
	const representationRevision = context.representationRevision ?? SEMANTIC_REPRESENTATION_ID;
	const generatedAt = context.generatedAt ?? board.generated;

	return board.columns.flatMap((column) =>
		column.tasks.map((task): GraphifyTaskCandidate =>
			buildGraphifyTaskCandidate({
				taskId: task.id,
				priority: priorityFallback(task),
				taskLabel: task.label,
				kind: candidateKind(task),
				producerId,
				producerRevision,
				workspaceRevision,
				sourceRevision,
				graphRevision,
				representationRevision,
				confidence: task.confidence ?? null,
				packetKeys: task.packet_key ? [task.packet_key] : [],
				featureIds: [],
				symbols: [],
				files: task.script ? [task.script] : [],
				evidenceRefs: task.evidence_refs ?? [],
				requiredGates: task.gate ? [task.gate] : [],
				blockedBy: task.blockedBy ?? [],
				sourceRef: task.source_ref ?? null,
				sourceRefs: [
					task.source_ref ?? null,
					...(task.evidence_refs ?? []),
					...(task.reason_codes ?? []),
				],
				treeNodeId: task.tree_node_id ?? null,
				titleId: task.title_id ?? null,
				script: task.script ?? null,
				notes: [task.status, task.origin].filter(Boolean).join(' | ') || null,
				generatedAt,
			}),
		),
	);
}
