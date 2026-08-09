/**
 * Ablation / parity / comparison contract.
 *
 * Used when one run family is compared against another. This is the bridge
 * layer between execution and promotion, not the promotion decision itself.
 */

import { z } from 'zod';
import { AnalysisRunEnvelopeSchema } from './analysis-run-envelope.js';

export const AblationRunSchema = AnalysisRunEnvelopeSchema.extend({
	algorithm: z.literal('ablation'),
	baselineRunId: z.string().min(1).nullable(),
	candidateRunIds: z.array(z.string().min(1)).default([]),
	metricNames: z.array(z.string().min(1)).default([]),
	passCriteria: z.record(z.string(), z.unknown()).default({}),
	comparisonSummary: z.record(z.string(), z.unknown()).default({}),
}).strict();
export type AblationRun = z.infer<typeof AblationRunSchema>;

export const AblationResultSchema = z
	.object({
		runId: z.string().min(1),
		metricName: z.string().min(1),
		baselineValue: z.number().finite().nullable(),
		candidateValue: z.number().finite().nullable(),
		delta: z.number().finite().nullable(),
		passed: z.boolean(),
		reason: z.string().min(1).nullable(),
		createdAt: z.string().datetime(),
		metadata: z.record(z.string(), z.unknown()).default({}),
	})
	.strict();
export type AblationResult = z.infer<typeof AblationResultSchema>;
