import { createHash } from 'node:crypto';
import { z } from 'zod';

const probability = z.number().finite().min(0).max(1);

export const RepairEvalExampleV1Schema = z.object({
	schema: z.literal('atlas.repair-eval-example.v1'),
	exampleId: z.string().min(1),
	workspaceRevision: z.string().min(1),
	failureFingerprint: z.string().min(1),
	repairEpisodeId: z.string().min(1),
	sourceAncestryGroupIds: z.array(z.string().min(1)).min(1),
	patchAncestryGroupIds: z.array(z.string().min(1)).min(1),
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

export const FrozenRepairDatasetV1Schema = z.object({
	schema: z.literal('atlas.frozen-repair-dataset.v1'),
	datasetId: z.string().min(1),
	datasetRevision: z.string().min(1),
	createdAt: z.string().datetime(),
	splits: z.object({
		trainIds: z.array(z.string().min(1)),
		validationIds: z.array(z.string().min(1)),
		testIds: z.array(z.string().min(1)),
	}),
	examples: z.array(RepairEvalExampleV1Schema),
	summary: z.object({
		trainCount: z.number().int().nonnegative(),
		validationCount: z.number().int().nonnegative(),
		testCount: z.number().int().nonnegative(),
		checksumSha256: z.string().regex(/^sha256:[a-f0-9]{64}$/),
	}),
}).strict();

export type FrozenRepairDatasetV1 = z.infer<typeof FrozenRepairDatasetV1Schema>;

export function buildFrozenRepairDatasetV1(input: {
	datasetId: string;
	datasetRevision: string;
	examples: readonly RepairEvalExampleV1[];
	createdAt?: string;
}): FrozenRepairDatasetV1 {
	const parsedExamples = input.examples.map((ex) => RepairEvalExampleV1Schema.parse(ex));

	const trainIds: string[] = [];
	const validationIds: string[] = [];
	const testIds: string[] = [];

	for (const ex of parsedExamples) {
		if (ex.split === 'train') trainIds.push(ex.exampleId);
		else if (ex.split === 'validation') validationIds.push(ex.exampleId);
		else if (ex.split === 'test') testIds.push(ex.exampleId);
	}
	const trainSet = new Set(trainIds);
	const valSet = new Set(validationIds);
	const testSet = new Set(testIds);
	const splitByLeakageGroup = new Map<string, string>();
	for (const ex of parsedExamples) {
		const groups = [
			['failureFingerprint', ex.failureFingerprint],
			['repairEpisodeId', ex.repairEpisodeId],
			...ex.sourceAncestryGroupIds.map((id) => ['sourceAncestry', id]),
			...ex.patchAncestryGroupIds.map((id) => ['patchAncestry', id]),
		] as const;
		for (const [kind, id] of groups) {
			const key = `${kind}:${id}`;
			const previousSplit = splitByLeakageGroup.get(key);
			if (previousSplit && previousSplit !== ex.split) {
				throw new Error(`DATASET_SPLIT_LEAKAGE: ${kind} '${id}' spans ${previousSplit} and ${ex.split}`);
			}
			splitByLeakageGroup.set(key, ex.split);
		}
	}

	// Strict disjointness check to prevent data leakage into held-out test split
	for (const id of trainSet) {
		if (valSet.has(id)) throw new Error(`DATASET_SPLIT_LEAKAGE: Example '${id}' present in both train and validation`);
		if (testSet.has(id)) throw new Error(`DATASET_SPLIT_LEAKAGE: Example '${id}' present in both train and test`);
	}
	for (const id of valSet) {
		if (testSet.has(id)) throw new Error(`DATASET_SPLIT_LEAKAGE: Example '${id}' present in both validation and test`);
	}
	if (new Set(parsedExamples.map((ex) => ex.exampleId)).size !== parsedExamples.length) {
		throw new Error('DATASET_DUPLICATE_EXAMPLE_ID');
	}

	const canonicalRepresentation = JSON.stringify({
		datasetId: input.datasetId,
		datasetRevision: input.datasetRevision,
		splits: {
			trainIds: [...trainSet].sort(),
			validationIds: [...valSet].sort(),
			testIds: [...testSet].sort(),
		},
		examples: parsedExamples.map((ex) => ({
			...ex,
			goldPacketKeys: ex.goldPacketKeys.slice().sort(),
			goldSourceRefs: ex.goldSourceRefs.slice().sort(),
			sourceAncestryGroupIds: ex.sourceAncestryGroupIds.slice().sort(),
			patchAncestryGroupIds: ex.patchAncestryGroupIds.slice().sort(),
		})).sort((a, b) => a.exampleId.localeCompare(b.exampleId)),
	});

	const checksumSha256 = `sha256:${createHash('sha256').update(canonicalRepresentation).digest('hex')}`;

	return FrozenRepairDatasetV1Schema.parse({
		schema: 'atlas.frozen-repair-dataset.v1',
		datasetId: input.datasetId,
		datasetRevision: input.datasetRevision,
		createdAt: input.createdAt ?? new Date().toISOString(),
		splits: {
			trainIds: [...trainSet].sort(),
			validationIds: [...valSet].sort(),
			testIds: [...testSet].sort(),
		},
		examples: parsedExamples,
		summary: {
			trainCount: trainSet.size,
			validationCount: valSet.size,
			testCount: testSet.size,
			checksumSha256,
		},
	});
}

export const AggregateEvalMetricsV1Schema = z.object({
	schema: z.literal('atlas.aggregate-eval-metrics.v1'),
	sampleCount: z.number().int().positive(),
	meanScore: probability,
	meanRetrievalRecallAt5: probability,
	meanLocalizationRecallAt5: probability,
	meanExactEvidenceCoverage: probability,
	meanPatchMinimality: probability,
	meanFalseEditRate: probability,
	meanLatencyBudgetScore: probability,
	meanCacheReuseRate: probability,
	repairSuccessRate: probability,
	hardGateFailureRate: probability,
}).strict();

export type AggregateEvalMetricsV1 = z.infer<typeof AggregateEvalMetricsV1Schema>;

export function aggregateEvalMetricsV1(observations: readonly RepairEvalObservationV1[]): AggregateEvalMetricsV1 {
	if (!observations.length) throw new Error('observations list must be non-empty');

	let totalScore = 0;
	let totalRetrieval = 0;
	let totalLocalization = 0;
	let totalEvidence = 0;
	let totalPatchMinimality = 0;
	let totalFalseEditRate = 0;
	let totalLatency = 0;
	let totalCacheReuse = 0;
	let successCount = 0;
	let hardGateFailures = 0;

	for (const obs of observations) {
		const parsed = RepairEvalObservationV1Schema.parse(obs);
		const scored = scoreRepairEvalV1(parsed);

		totalScore += scored.score;
		totalRetrieval += parsed.retrievalRecallAt5;
		totalLocalization += parsed.localizationRecallAt5;
		totalEvidence += parsed.exactEvidenceCoverage;
		totalPatchMinimality += parsed.patchMinimality;
		totalFalseEditRate += parsed.falseEditRate;
		totalLatency += parsed.latencyBudgetScore;
		totalCacheReuse += parsed.cacheReuseRate;

		const passedHard = parsed.targetedTestsPassed && parsed.typecheckPassed && parsed.regressionFree;
		if (passedHard && scored.score >= 0.8) {
			successCount++;
		}
		if (!passedHard) {
			hardGateFailures++;
		}
	}

	const n = observations.length;
	return AggregateEvalMetricsV1Schema.parse({
		schema: 'atlas.aggregate-eval-metrics.v1',
		sampleCount: n,
		meanScore: Number((totalScore / n).toFixed(6)),
		meanRetrievalRecallAt5: Number((totalRetrieval / n).toFixed(6)),
		meanLocalizationRecallAt5: Number((totalLocalization / n).toFixed(6)),
		meanExactEvidenceCoverage: Number((totalEvidence / n).toFixed(6)),
		meanPatchMinimality: Number((totalPatchMinimality / n).toFixed(6)),
		meanFalseEditRate: Number((totalFalseEditRate / n).toFixed(6)),
		meanLatencyBudgetScore: Number((totalLatency / n).toFixed(6)),
		meanCacheReuseRate: Number((totalCacheReuse / n).toFixed(6)),
		repairSuccessRate: Number((successCount / n).toFixed(6)),
		hardGateFailureRate: Number((hardGateFailures / n).toFixed(6)),
	});
}
