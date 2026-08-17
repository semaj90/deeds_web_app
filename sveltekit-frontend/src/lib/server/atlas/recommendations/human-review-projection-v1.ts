import { z } from 'zod';
import { TaskPromotionGateSchema } from '../contracts/recommendation.js';

/**
 * Read-only Kanban view. This module does NOT own recommendation status,
 * approval, human decisions, or execution lifecycle. Those remain with the
 * existing RecommendationRecord / TaskPromotionGate / Kanban card owners.
 */
export const KanbanRecommendationViewV1Schema = z.object({
	schema: z.literal('atlas.kanban-recommendation-view.v1'),
	recommendationId: z.string().min(1),
	existingKanbanCardId: z.string().min(1).nullable(),
	title: z.string().min(1),
	summary: z.string().min(1),
	priority: z.enum(['low', 'medium', 'high', 'critical']),
	targetFiles: z.array(z.string().min(1)),
	evidenceRefs: z.array(z.string().min(1)).min(1),
	acceptanceCriteria: z.array(z.string().min(1)).min(1),
	validationCommands: z.array(z.string().min(1)).min(1),
	permissionMode: z.enum(['read_only', 'proposal_only', 'patch_allowed']),
	gateDecision: z.enum(['PROMOTE', 'REVIEW_REQUIRED', 'REJECT']),
	gateFailureReasons: z.array(z.string().min(1)),
	graphifyRevision: z.string().min(1),
	featureRevision: z.string().min(1),
	latestVerificationReceiptRef: z.string().min(1).nullable(),
	projectedAt: z.string().datetime(),
}).strict();

export type KanbanRecommendationViewV1 = z.infer<typeof KanbanRecommendationViewV1Schema>;

export function projectRecommendationToKanbanViewV1(input: {
	recommendationId: string;
	existingKanbanCardId?: string | null;
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
	latestVerificationReceiptRef?: string | null;
	projectedAt?: string;
}): KanbanRecommendationViewV1 {
	const gate = TaskPromotionGateSchema.parse(input.promotionGate);
	if (gate.recommendation_id !== input.recommendationId) {
		throw new Error('promotion gate recommendation_id mismatch');
	}

	return KanbanRecommendationViewV1Schema.parse({
		schema: 'atlas.kanban-recommendation-view.v1',
		recommendationId: input.recommendationId,
		existingKanbanCardId: input.existingKanbanCardId ?? null,
		title: input.title,
		summary: input.summary,
		priority: input.priority,
		targetFiles: [...new Set(input.targetFiles)].sort(),
		evidenceRefs: [...new Set(input.evidenceRefs)].sort(),
		acceptanceCriteria: [...input.acceptanceCriteria],
		validationCommands: [...input.validationCommands],
		permissionMode: input.permissionMode,
		gateDecision: gate.gate_decision,
		gateFailureReasons: [...gate.failure_reasons],
		graphifyRevision: input.graphifyRevision,
		featureRevision: input.featureRevision,
		latestVerificationReceiptRef: input.latestVerificationReceiptRef ?? null,
		projectedAt: input.projectedAt ?? new Date().toISOString(),
	});
}
