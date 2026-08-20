import { z } from 'zod';
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
