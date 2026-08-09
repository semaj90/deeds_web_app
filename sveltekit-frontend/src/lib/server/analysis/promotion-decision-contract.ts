/**
 * Promotion decision contract.
 *
 * This is the explicit bridge from analysis output into retrieval-facing
 * promotion. It stays separate from execution, parity, and ablation.
 */

import { z } from 'zod';

export const PromotionDecisionSchema = z.enum(['promote', 'reject', 'keep_experimental']);
export type PromotionDecision = z.infer<typeof PromotionDecisionSchema>;

export const AnalysisPromotionDecisionSchema = z
	.object({
		decisionId: z.string().min(1),
		runId: z.string().min(1),
		decision: PromotionDecisionSchema,
		reason: z.string().min(1),
		reviewedAt: z.string().datetime(),
		reviewer: z.string().min(1).nullable().default(null),
		targetFeatureSet: z.array(z.string().min(1)).default([]),
		evidence: z.record(z.string(), z.unknown()).default({}),
	})
	.strict();
export type AnalysisPromotionDecision = z.infer<typeof AnalysisPromotionDecisionSchema>;
