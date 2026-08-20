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

export const RepairEvalObservationV1Schema = z.object({
	retrievalRecallAt5: probability,
	localizationRecallAt5: probability,
	exactEvidenceCoverage: probability,
	targetedTestsPassed: z.boolean(),
	typecheckPassed: z.boolean(),
	regressionFree: z.boolean(),
	patchMinimality: probability,
	falseEditRate: probability,
	latencyBudgetScore: probability,
	cacheReuseRate: probability,
}).strict();

export type RepairEvalExampleV1 = z.infer<typeof RepairEvalExampleV1Schema>;
export type RepairEvalObservationV1 = z.infer<typeof RepairEvalObservationV1Schema>;

export interface RepairEvalScoreV1 {
	score: number;
	feedback: string;
}

export function scoreRepairEvalV1(observation: RepairEvalObservationV1): RepairEvalScoreV1 {
	const parsed = RepairEvalObservationV1Schema.parse(observation);
	const score =
		0.15 * parsed.retrievalRecallAt5
		+ 0.15 * parsed.localizationRecallAt5
		+ 0.10 * parsed.exactEvidenceCoverage
		+ 0.15 * Number(parsed.targetedTestsPassed)
		+ 0.10 * Number(parsed.typecheckPassed)
		+ 0.10 * Number(parsed.regressionFree)
		+ 0.08 * parsed.patchMinimality
		+ 0.07 * (1 - parsed.falseEditRate)
		+ 0.05 * parsed.latencyBudgetScore
		+ 0.05 * parsed.cacheReuseRate;

	const failures: string[] = [];
	if (!parsed.targetedTestsPassed) failures.push('TARGETED_TESTS_FAILED');
	if (!parsed.typecheckPassed) failures.push('TYPECHECK_FAILED');
	if (!parsed.regressionFree) failures.push('REGRESSION_DETECTED');
	if (parsed.exactEvidenceCoverage < 0.8) failures.push('LOW_EXACT_EVIDENCE_COVERAGE');
	if (parsed.localizationRecallAt5 < 0.8) failures.push('LOW_LOCALIZATION_RECALL');

	return {
		score: Number(score.toFixed(6)),
		feedback: failures.length === 0 ? 'All hard repair gates passed.' : failures.join('; '),
	};
}
