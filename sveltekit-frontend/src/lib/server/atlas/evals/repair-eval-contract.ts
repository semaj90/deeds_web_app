import { z } from 'zod';

const probability = z.number().finite().min(0).max(1);

export const RepairEvalExampleV1Schema = z.object({
	schema: z.literal('atlas.repair-eval-example.v1'),
	exampleId: z.string().min(1),
	workspaceRevision: z.string().min(1),
	failureFingerprint: z.string().min(1),
	queryText: z.string().min(1),
	goldPacketKeys: z.array(z.string().min(1)).min(1),
	goldSourceRefs: z.array(z.string().min(1)).min(1),
	validationCommands: z.array(z.string().min(1)).min(1),
	acceptanceCriteria: z.array(z.string().min(1)).min(1),
	humanReviewRequired: z.boolean(),
	split: z.enum(['train', 'validation', 'test']),
}).strict();

export const RepairQualityObservationV1Schema = z.object({
	retrievalRecallAt5: probability,
	localizationRecallAt5: probability,
	exactEvidenceCoverage: probability,
	targetedTestsPassed: z.boolean(),
	typecheckPassed: z.boolean(),
	regressionFree: z.boolean(),
	patchMinimality: probability,
	falseEditRate: probability,
}).strict();

export const SystemCostObservationV1Schema = z.object({
	latencyBudgetScore: probability,
	cacheReuseRate: probability,
	toolCallBudgetScore: probability.default(1),
	gpuBudgetScore: probability.default(1),
}).strict();

export const RepairEvalObservationV1Schema = z.object({
	quality: RepairQualityObservationV1Schema,
	cost: SystemCostObservationV1Schema,
}).strict();

export type RepairEvalExampleV1 = z.infer<typeof RepairEvalExampleV1Schema>;
export type RepairQualityObservationV1 = z.infer<typeof RepairQualityObservationV1Schema>;
export type SystemCostObservationV1 = z.infer<typeof SystemCostObservationV1Schema>;
export type RepairEvalObservationV1 = z.infer<typeof RepairEvalObservationV1Schema>;

export interface RepairMetricScoreV1 {
	score: number;
	feedback: string;
	hardGatePassed: boolean;
}

/** Correctness/relevance only. No cache or latency signal is allowed here. */
export function scoreRepairQualityV1(observation: RepairQualityObservationV1): RepairMetricScoreV1 {
	const parsed = RepairQualityObservationV1Schema.parse(observation);
	const hardFailures: string[] = [];
	if (!parsed.targetedTestsPassed) hardFailures.push('TARGETED_TESTS_FAILED');
	if (!parsed.typecheckPassed) hardFailures.push('TYPECHECK_FAILED');
	if (!parsed.regressionFree) hardFailures.push('REGRESSION_DETECTED');
	if (parsed.exactEvidenceCoverage < 0.8) hardFailures.push('LOW_EXACT_EVIDENCE_COVERAGE');

	const score =
		0.18 * parsed.retrievalRecallAt5
		+ 0.18 * parsed.localizationRecallAt5
		+ 0.14 * parsed.exactEvidenceCoverage
		+ 0.16 * Number(parsed.targetedTestsPassed)
		+ 0.11 * Number(parsed.typecheckPassed)
		+ 0.11 * Number(parsed.regressionFree)
		+ 0.07 * parsed.patchMinimality
		+ 0.05 * (1 - parsed.falseEditRate);

	return {
		score: Number(score.toFixed(6)),
		feedback: hardFailures.length === 0 ? 'All hard repair quality gates passed.' : hardFailures.join('; '),
		hardGatePassed: hardFailures.length === 0,
	};
}

/** Operational efficiency only. It can never rescue a failed repair. */
export function scoreSystemCostV1(observation: SystemCostObservationV1): number {
	const parsed = SystemCostObservationV1Schema.parse(observation);
	return Number((
		0.40 * parsed.latencyBudgetScore
		+ 0.30 * parsed.cacheReuseRate
		+ 0.15 * parsed.toolCallBudgetScore
		+ 0.15 * parsed.gpuBudgetScore
	).toFixed(6));
}

/**
 * GEPA-facing score: correctness is a hard gate. A fast/cached incorrect result
 * receives zero; efficiency contributes only after quality gates pass.
 */
export function scoreRepairEvalV1(observation: RepairEvalObservationV1): RepairMetricScoreV1 & { qualityScore: number; costScore: number } {
	const parsed = RepairEvalObservationV1Schema.parse(observation);
	const quality = scoreRepairQualityV1(parsed.quality);
	const costScore = scoreSystemCostV1(parsed.cost);
	const combined = quality.hardGatePassed ? 0.9 * quality.score + 0.1 * costScore : 0;

	return {
		score: Number(combined.toFixed(6)),
		qualityScore: quality.score,
		costScore,
		feedback: quality.feedback,
		hardGatePassed: quality.hardGatePassed,
	};
}
