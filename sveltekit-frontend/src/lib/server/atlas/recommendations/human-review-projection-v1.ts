import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { RepairEvalExampleV1 } from '../evals/repair-eval-contract.js';
import { TaskPromotionGateSchema } from '../contracts/recommendation.js';

export const KanbanRecommendationProjectionV1Schema = z.object({
	schema: z.literal('atlas.kanban-recommendation-projection.v1'),
	recommendationId: z.string().min(1),
	title: z.string().min(1),
	summary: z.string().min(1),
	status: z.enum(['proposed', 'review_required', 'approved', 'rejected', 'executing', 'verified']),
	priority: z.enum(['low', 'medium', 'high', 'critical']),
	targetFiles: z.array(z.string().min(1)),
	evidenceRefs: z.array(z.string().min(1)).min(1),
	acceptanceCriteria: z.array(z.string().min(1)).min(1),
	validationCommands: z.array(z.string().min(1)).min(1),
	permissionMode: z.enum(['read_only', 'proposal_only', 'patch_allowed']),
	humanDecision: z.enum(['pending', 'approve', 'reject', 'request_changes']),
	graphifyRevision: z.string().min(1),
	featureRevision: z.string().min(1),
	createdAt: z.string().datetime(),
}).strict();

export type KanbanRecommendationProjectionV1 = z.infer<typeof KanbanRecommendationProjectionV1Schema>;

export const KanbanReviewEventV1Schema = z.object({
	schema: z.literal('atlas.kanban-review-event.v1'),
	eventId: z.string().min(1),
	recommendationId: z.string().min(1),
	decision: z.enum(['approve', 'reject', 'request_changes']),
	reviewerId: z.string().min(1),
	notes: z.string().optional(),
	timestamp: z.string().datetime(),
	appliedToEval: z.boolean(),
}).strict();

export type KanbanReviewEventV1 = z.infer<typeof KanbanReviewEventV1Schema>;

export function projectRecommendationToKanbanV1(input: {
	recommendationId: string;
	title: string;
	summary: string;
	priority: 'low' | 'medium' | 'high' | 'critical';
	targetFiles: readonly string[];
	evidenceRefs: readonly string[];
	acceptanceCriteria: readonly string[];
	validationCommands: readonly string[];
	permissionMode: 'read_only' | 'proposal_only' | 'patch_allowed';
	promotionGate: z.infer<typeof TaskPromotionGateSchema>;
	graphifyRevision: string;
	featureRevision: string;
	createdAt?: string;
}): KanbanRecommendationProjectionV1 {
	const gate = TaskPromotionGateSchema.parse(input.promotionGate);
	const status = gate.gate_decision === 'PROMOTE' ? 'proposed' : 'review_required';
	return KanbanRecommendationProjectionV1Schema.parse({
		schema: 'atlas.kanban-recommendation-projection.v1',
		recommendationId: input.recommendationId,
		title: input.title,
		summary: input.summary,
		status,
		priority: input.priority,
		targetFiles: [...new Set(input.targetFiles)].sort(),
		evidenceRefs: [...new Set(input.evidenceRefs)].sort(),
		acceptanceCriteria: [...input.acceptanceCriteria],
		validationCommands: [...input.validationCommands],
		permissionMode: input.permissionMode,
		humanDecision: 'pending',
		graphifyRevision: input.graphifyRevision,
		featureRevision: input.featureRevision,
		createdAt: input.createdAt ?? new Date().toISOString(),
	});
}

export interface RecordReviewDecisionResultV1 {
	updatedRecommendation: KanbanRecommendationProjectionV1;
	reviewEvent: KanbanReviewEventV1;
	evalTrainingCandidate?: RepairEvalExampleV1;
}

export function recordReviewDecisionV1(
	recommendation: KanbanRecommendationProjectionV1,
	decision: 'approve' | 'reject' | 'request_changes',
	options: {
		reviewerId: string;
		notes?: string;
		timestamp?: string;
	},
): RecordReviewDecisionResultV1 {
	const parsedRec = KanbanRecommendationProjectionV1Schema.parse(recommendation);
	const timestamp = options.timestamp ?? new Date().toISOString();
	const eventId = `rev-${createHash('sha256').update(`${parsedRec.recommendationId}:${decision}:${timestamp}`).digest('hex').slice(0, 16)}`;

	let newStatus: KanbanRecommendationProjectionV1['status'];
	if (decision === 'approve') {
		newStatus = 'approved';
	} else if (decision === 'reject') {
		newStatus = 'rejected';
	} else {
		newStatus = 'review_required';
	}

	const updatedRecommendation: KanbanRecommendationProjectionV1 = {
		...parsedRec,
		status: newStatus,
		humanDecision: decision,
	};

	const reviewEvent: KanbanReviewEventV1 = {
		schema: 'atlas.kanban-review-event.v1',
		eventId,
		recommendationId: parsedRec.recommendationId,
		decision,
		reviewerId: options.reviewerId,
		notes: options.notes,
		timestamp,
		appliedToEval: false,
	};

	return {
		updatedRecommendation,
		reviewEvent,
	};
}

export function deduplicateKanbanRecommendationsV1(
	recommendations: readonly KanbanRecommendationProjectionV1[],
): KanbanRecommendationProjectionV1[] {
	const priorityRank: Record<KanbanRecommendationProjectionV1['priority'], number> = {
		critical: 4,
		high: 3,
		medium: 2,
		low: 1,
	};

	const seenByFingerprint = new Map<string, KanbanRecommendationProjectionV1>();

	for (const rec of recommendations) {
		const parsed = KanbanRecommendationProjectionV1Schema.parse(rec);
		const fingerprint = createHash('sha256')
			.update(`${parsed.graphifyRevision}::${parsed.evidenceRefs.slice().sort().join(',')}`)
			.digest('hex');

		const existing = seenByFingerprint.get(fingerprint);
		if (!existing) {
			seenByFingerprint.set(fingerprint, parsed);
		} else {
			const higherPriority = priorityRank[parsed.priority] > priorityRank[existing.priority] ? parsed.priority : existing.priority;
			const mergedTargets = [...new Set([...existing.targetFiles, ...parsed.targetFiles])].sort();
			const mergedCriteria = [...new Set([...existing.acceptanceCriteria, ...parsed.acceptanceCriteria])];
			const mergedCommands = [...new Set([...existing.validationCommands, ...parsed.validationCommands])];

			const merged: KanbanRecommendationProjectionV1 = {
				...existing,
				priority: higherPriority,
				targetFiles: mergedTargets,
				acceptanceCriteria: mergedCriteria,
				validationCommands: mergedCommands,
			};
			seenByFingerprint.set(fingerprint, merged);
		}
	}

	return Array.from(seenByFingerprint.values());
}
