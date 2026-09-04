import { z } from 'zod';

import {
	buildEventRecommendationFeatureRow,
	type EventRecommendationFeatureRow,
	EventRecommendationFeatureRowSchema,
} from '$lib/server/analysis/event-hypergraph-contract.js';
import {
	buildRecommendationPolicyResults,
	type RecommendationPolicyResult,
	RecommendationPolicyResultSchema,
} from '$lib/server/analytics/recommendation-policy.js';
import {
	FeatureMatrixSetupV1Schema,
	PosTaggerOutputV1Schema,
	DomainClassificationV1Schema,
} from '../contracts/feature-extraction-v1.js';
import { buildPosConceptTaggingPacketFromSource } from '$lib/server/analysis/source-pos-concept-packet.js';

import {
	buildDailyGraphifyTaskCandidates,
	type GraphifyTaskCandidateBuildContext,
} from './graphify-task-candidates.js';
import type { DailyGraphifyBoardData } from './daily-graphify-board.js';
import { resolveCurrentGraphifyWorkspaceRevision } from './graphify-current-workspace-revision.js';
type GraphifyTaskCandidate = ReturnType<typeof buildDailyGraphifyTaskCandidates>[number];

export const DailyGraphifyBoardRecommendationSchema = z
	.object({
		rank: z.number().int().positive(),
		taskId: z.string().min(1),
		taskLabel: z.string().min(1),
		priority: z.enum(['P0', 'P1', 'P2', 'P3']),
		kind: z.enum(['graphify_evidence', 'recommendation_review']),
		retrievalMode: z.enum(['sparse', 'hybrid']),
		candidate: z.object({
			task_id: z.string().min(1),
			dedup_key: z.string().min(1),
		}),
		domainClassification: DomainClassificationV1Schema,
		posTaggerOutput: PosTaggerOutputV1Schema,
		featureMatrixSetup: FeatureMatrixSetupV1Schema,
		featureRow: EventRecommendationFeatureRowSchema,
		policyResult: RecommendationPolicyResultSchema,
		kanbanCardId: z.string().min(1),
	})
	.strict();

export type DailyGraphifyBoardRecommendation = z.infer<typeof DailyGraphifyBoardRecommendationSchema>;

export interface DailyGraphifyBoardRecommendationContext extends GraphifyTaskCandidateBuildContext {
	policyRevision?: string;
	featureRevision?: string;
	traceId?: string;
	sourceRef?: string;
	maxResults?: number;
	/**
	 * KANBAN-RECOMMENDATION-REVISION-BINDING-01: the real content-derived Graphify workspace
	 * revision (`sha256:...`), NOT a timestamp. When omitted, resolved live from `graphify_runs`
	 * via `resolveCurrentGraphifyWorkspaceRevision()`; when no proven revision exists yet (e.g.
	 * before the first successful Graphify run), this stays `null` rather than falling back to
	 * `board.generated` — a generated/observed timestamp is never a valid workspaceRevision value.
	 */
	workspaceRevision?: string | null;
	/** Paired with `workspaceRevision` above — see the same resolver for provenance/caveats. */
	graphRevision?: string | null;
}

function priorityScore(priority: 'P0' | 'P1' | 'P2' | 'P3'): number {
	switch (priority) {
		case 'P0':
			return 0.96;
		case 'P1':
			return 0.74;
		case 'P2':
			return 0.52;
		default:
			return 0.28;
	}
}

function clamp(value: number): number {
	return Math.max(0, Math.min(1, Number(value.toFixed(6))));
}

function inferPartOfSpeech(taskLabel: string, script?: string | null): string {
	const text = `${taskLabel} ${script ?? ''}`.trim().toLowerCase();
	const firstWord = text.split(/\s+/)[0] ?? '';
	if (['add', 'build', 'close', 'create', 'fix', 'implement', 'refresh', 'review', 'run', 'scan', 'validate', 'wire', 'update', 'seed', 'rank', 'route', 'classify', 'wire'].includes(firstWord)) {
		return 'VERB';
	}
	if (text.includes('board') || text.includes('validator') || text.includes('schema') || text.includes('recommendation')) {
		return 'NOUN';
	}
	return 'PROPN';
}

async function buildEvidencePacket(
	candidate: GraphifyTaskCandidate,
	boardGenerated: string,
	featureRevision: string,
	eventRevision: string,
	workspaceRevision: string | null,
	runGraphRevision: string | null,
) {
	const packetKey = candidate.packet_keys[0] ?? `kanban:${candidate.task_id}`;
	const sourceRef = candidate.source_ref ?? `kanban:${candidate.task_id}`;
	const pos = inferPartOfSpeech(candidate.task_label, candidate.script);
	const text = [
		candidate.task_label,
		candidate.script,
		candidate.notes,
		`priority:${candidate.priority}`,
		`kind:${candidate.kind}`,
		`blocked_by:${candidate.blocked_by.join(',')}`,
		`gates:${candidate.required_gates.join(',')}`,
		`files:${candidate.files.join(',')}`,
		`evidence:${candidate.evidence_refs.join(',')}`,
		`source_refs:${candidate.source_refs.join(',')}`,
	].filter((value): value is string => typeof value === 'string' && value.trim().length > 0).join('\n');

	return buildPosConceptTaggingPacketFromSource({
		packetKey,
		sourceRef,
		sourceRevision: eventRevision,
		workspaceRevision,
		featureId: candidate.task_id,
		featureLabel: candidate.task_label ?? candidate.task_id,
		text,
		isCode: candidate.kind === 'graphify_evidence' || candidate.files.length > 0,
		treeNodeId: candidate.tree_node_id ?? null,
		titleId: candidate.title_id ?? null,
		representationRevision: featureRevision,
		producerId: 'daily-graphify-board-recommendations',
		producerRevision: boardGenerated,
		featureRevision,
		graphRevision: candidate.graph_revision ?? runGraphRevision,
		modelRevision: featureRevision,
		partOfSpeech: pos,
		semanticConceptIds: candidate.evidence_refs,
		ontologyIds: candidate.source_refs,
		posCandidateLabels: [{ label: pos, score: 0.92 }],
		citations: candidate.evidence_refs.map((ref) => ({ citationText: ref, sourceRef: ref })),
		screenshots: [],
		mcpToolCalls: [],
		rankingSignals: {
			pageRank: candidate.confidence ?? null,
			communityId: candidate.kind,
			somCell: candidate.priority,
		},
		participants: [],
		concepts: [],
		sourceTables: ['daily_graphify_board', 'graphify_task_candidates'],
		jsonlSourceDigest: candidate.dedup_key,
	});
}

function buildFeatureRow(
	candidate: GraphifyTaskCandidate,
	featureRevision: string,
	eventRevision: string,
	domainClassificationConfidence: number,
	posConfidence: number,
	runGraphRevision: string | null,
): EventRecommendationFeatureRow {
	const evidenceCoverage = clamp((candidate.evidence_refs.length + candidate.source_refs.length) / 8);
	const structuralScore = clamp(
		(candidate.tree_node_id ? 0.35 : 0) +
			Math.min(1, candidate.files.length / 3) * 0.35 +
			Math.min(1, candidate.evidence_refs.length / 3) * 0.3,
	);
	const graphScore = clamp((candidate.packet_keys.length > 0 ? 0.45 : 0.2) + (candidate.source_refs.length > 0 ? 0.2 : 0) + (candidate.tree_node_id ? 0.2 : 0));
	const workflowScore = clamp(priorityScore(candidate.priority) - (candidate.blocked_by.length > 0 ? 0.25 : 0));
	const breadthScore = clamp((candidate.files.length + candidate.source_refs.length + candidate.evidence_refs.length) / 12);
	const approximationScore = candidate.kind === 'recommendation_review' ? 0.15 : 0.05;
	const utilityBias = clamp(priorityScore(candidate.priority) - 0.5 + domainClassificationConfidence * 0.1 + posConfidence * 0.05);
	const tokenCost = Math.max(0, candidate.task_label.length + (candidate.script?.length ?? 0));

	return buildEventRecommendationFeatureRow({
		eventId: candidate.task_id,
		candidateKey: candidate.task_id,
		packetKey: candidate.packet_keys[0] ?? null,
		semanticScore: clamp((candidate.confidence ?? priorityScore(candidate.priority)) * 0.75 + domainClassificationConfidence * 0.15 + posConfidence * 0.1),
		structuralScore,
		graphScore: clamp(graphScore + (domainClassificationConfidence >= 0.55 ? 0.05 : 0)),
		workflowScore: clamp(workflowScore + (posConfidence >= 0.8 ? 0.05 : 0)),
		breadthScore,
		approximationScore,
		utilityBias,
		tokenCost,
		latencyMs: 0,
		evidenceCoverage,
		freshnessScore: 1,
		featureRevision,
		graphRevision: candidate.graph_revision ?? runGraphRevision,
		eventRevision,
	});
}

export async function buildDailyGraphifyBoardRecommendations(
	board: DailyGraphifyBoardData,
	context: DailyGraphifyBoardRecommendationContext = {},
): Promise<DailyGraphifyBoardRecommendation[]> {
	const candidates = buildDailyGraphifyTaskCandidates(board, context);
	const policyRevision = context.policyRevision ?? 'daily-graphify-board-policy-v1';
	const featureRevision = context.featureRevision ?? 'daily-graphify-board-feature-v1';
	const traceId = context.traceId ?? board.generated;
	const sourceRef = context.sourceRef ?? board.collection;
	const eventRevision = context.sourceRevision ?? board.generated;
	const generatedAt = context.generatedAt ?? board.generated;

	if (candidates.length === 0) return [];

	// KANBAN-RECOMMENDATION-REVISION-BINDING-01: resolve real workspaceRevision/graphRevision
	// instead of defaulting to board.generated (a timestamp, not a content-derived identity —
	// see the frozen identity model this violated). Explicit context values still win; `null` is
	// a legitimate outcome (no proven Graphify run yet) and is propagated as-is, never coerced
	// into a fabricated placeholder.
	let workspaceRevision = context.workspaceRevision ?? null;
	let runGraphRevision = context.graphRevision ?? null;
	if (context.workspaceRevision === undefined) {
		const resolved = await resolveCurrentGraphifyWorkspaceRevision();
		workspaceRevision = resolved?.workspaceRevision ?? null;
		if (context.graphRevision === undefined) {
			runGraphRevision = resolved?.graphRevision ?? null;
		}
	}

	const evidencePackets = await Promise.all(
		candidates.map((candidate) =>
			buildEvidencePacket(candidate, board.generated, featureRevision, eventRevision, workspaceRevision, runGraphRevision),
		),
	);
	const featureRows = candidates.map((candidate, index) => {
		const evidencePacket = evidencePackets[index]?.packet;
		if (!evidencePacket) {
			throw new Error(`Missing evidence packet for Graphify candidate ${candidate.task_id}`);
		}
		return buildFeatureRow(
			candidate,
			featureRevision,
			eventRevision,
			evidencePacket.domainClassification?.confidence ?? 0,
			evidencePacket.posTaggerOutput.confidence ?? 0,
			runGraphRevision,
		);
	});
	const policyResults = buildRecommendationPolicyResults({
		policyRevision,
		eventRevision,
		featureRevision,
		generatedAt,
		traceId,
		sourceRef,
		maxResults: Math.min(context.maxResults ?? 8, featureRows.length),
		candidates: featureRows,
	});

	const candidateById = new Map(candidates.map((candidate) => [candidate.task_id, candidate] as const));

	return policyResults.map((result, index) => {
		const candidate = candidateById.get(result.featureRow.candidateKey);
		if (!candidate) {
			throw new Error(`Missing Graphify candidate for recommendation ${result.featureRow.candidateKey}`);
		}

		return DailyGraphifyBoardRecommendationSchema.parse({
			rank: index + 1,
			taskId: candidate.task_id,
			taskLabel: candidate.task_label,
			priority: candidate.priority,
			kind: candidate.kind,
			retrievalMode: candidate.kind === 'graphify_evidence' ? 'sparse' : 'hybrid',
			candidate: {
				task_id: candidate.task_id,
				dedup_key: candidate.dedup_key,
			},
			domainClassification: evidencePackets[index]?.packet.domainClassification,
			posTaggerOutput: evidencePackets[index]?.packet.posTaggerOutput,
			featureMatrixSetup: evidencePackets[index]?.packet.featureMatrixSetup,
			featureRow: result.featureRow,
			policyResult: result,
			kanbanCardId: `kanban:${candidate.task_id}`,
		});
	});
}
