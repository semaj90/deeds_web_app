import { describe, expect, it } from 'vitest';
import {
	scoreRepairEvalV1,
	buildFrozenRepairDatasetV1,
	aggregateEvalMetricsV1,
	type RepairEvalExampleV1,
	type RepairEvalObservationV1,
} from './repair-eval-contract.js';

describe('repair-eval-contract', () => {
	it('scores successful verified repairs near one', () => {
		const result = scoreRepairEvalV1({
			retrievalRecallAt5: 1,
			localizationRecallAt5: 1,
			exactEvidenceCoverage: 1,
			targetedTestsPassed: true,
			typecheckPassed: true,
			regressionFree: true,
			patchMinimality: 1,
			falseEditRate: 0,
			latencyBudgetScore: 1,
			cacheReuseRate: 1,
		});
		expect(result.score).toBe(1);
		expect(result.feedback).toMatch(/hard repair gates passed/i);
	});

	it('emits explicit feedback for failed hard gates', () => {
		const result = scoreRepairEvalV1({
			retrievalRecallAt5: 0.8,
			localizationRecallAt5: 0.4,
			exactEvidenceCoverage: 0.5,
			targetedTestsPassed: false,
			typecheckPassed: false,
			regressionFree: true,
			patchMinimality: 0.8,
			falseEditRate: 0.2,
			latencyBudgetScore: 0.5,
			cacheReuseRate: 0.5,
		});
		expect(result.score).toBeLessThan(0.7);
		expect(result.feedback).toContain('TARGETED_TESTS_FAILED');
		expect(result.feedback).toContain('TYPECHECK_FAILED');
	});

	const sampleExamples: RepairEvalExampleV1[] = [
		{
			schema: 'atlas.repair-eval-example.v1',
			exampleId: 'ex-train-1',
			workspaceRevision: 'sha256:work1111111111111111111111111111111111111111111111111111111111111111',
			failureFingerprint: 'auth_token_null_pointer',
			repairEpisodeId: 'episode-auth-1',
			sourceAncestryGroupIds: ['source-ancestry-auth-1', 'source-parent-auth-1'],
			patchAncestryGroupIds: ['patch-ancestry-auth-1', 'patch-parent-auth-1'],
			queryText: 'fix null token exception in auth middleware',
			goldPacketKeys: ['packet:auth.ts'],
			goldSourceRefs: ['src/lib/auth.ts#L42'],
			validationCommands: ['npm run test -- auth.spec.ts'],
			acceptanceCriteria: ['Auth tokens handle null gracefully'],
			humanReviewRequired: false,
			split: 'train',
		},
		{
			schema: 'atlas.repair-eval-example.v1',
			exampleId: 'ex-val-1',
			workspaceRevision: 'sha256:work1111111111111111111111111111111111111111111111111111111111111111',
			failureFingerprint: 'cache_ttl_underflow',
			repairEpisodeId: 'episode-cache-1',
			sourceAncestryGroupIds: ['source-ancestry-cache-1'],
			patchAncestryGroupIds: ['patch-ancestry-cache-1'],
			queryText: 'prevent negative ttl values in cache set',
			goldPacketKeys: ['packet:cache.ts'],
			goldSourceRefs: ['src/lib/cache.ts#L18'],
			validationCommands: ['npm run test -- cache.spec.ts'],
			acceptanceCriteria: ['Cache rejects negative ttl values'],
			humanReviewRequired: false,
			split: 'validation',
		},
		{
			schema: 'atlas.repair-eval-example.v1',
			exampleId: 'ex-test-1',
			workspaceRevision: 'sha256:work1111111111111111111111111111111111111111111111111111111111111111',
			failureFingerprint: 'database_pool_exhaustion',
			repairEpisodeId: 'episode-db-1',
			sourceAncestryGroupIds: ['source-ancestry-db-1'],
			patchAncestryGroupIds: ['patch-ancestry-db-1'],
			queryText: 'release connections on query timeout',
			goldPacketKeys: ['packet:db.ts'],
			goldSourceRefs: ['src/lib/db.ts#L99'],
			validationCommands: ['npm run test -- db.spec.ts'],
			acceptanceCriteria: ['Pool count decrements on timeout'],
			humanReviewRequired: false,
			split: 'test',
		},
	];

	it('builds a frozen repair dataset with deterministic checksum and split counts', () => {
		const dataset1 = buildFrozenRepairDatasetV1({
			datasetId: 'ds-repair-eval-v1',
			datasetRevision: 'rev-20261024',
			examples: sampleExamples,
		});

		expect(dataset1.schema).toBe('atlas.frozen-repair-dataset.v1');
		expect(dataset1.summary.trainCount).toBe(1);
		expect(dataset1.summary.validationCount).toBe(1);
		expect(dataset1.summary.testCount).toBe(1);
		expect(dataset1.summary.checksumSha256).toMatch(/^sha256:[a-f0-9]{64}$/);

		// Determinism check: identical examples generate identical checksum
		const dataset2 = buildFrozenRepairDatasetV1({
			datasetId: 'ds-repair-eval-v1',
			datasetRevision: 'rev-20261024',
			examples: [...sampleExamples].reverse().map((example) => ({
				...example,
				sourceAncestryGroupIds: [...example.sourceAncestryGroupIds].reverse(),
				patchAncestryGroupIds: [...example.patchAncestryGroupIds].reverse(),
			})),
		});
		expect(dataset2.summary.checksumSha256).toBe(dataset1.summary.checksumSha256);
	});

	it('strictly fails closed on split leakage', () => {
		const leakingExamples: RepairEvalExampleV1[] = [
			...sampleExamples,
			{
				...sampleExamples[0],
				split: 'test', // ex-train-1 now exists as both train and test
			},
		];

		expect(() => buildFrozenRepairDatasetV1({
			datasetId: 'ds-leaking',
			datasetRevision: 'rev-1',
			examples: leakingExamples,
		})).toThrow(/DATASET_SPLIT_LEAKAGE/);
	});

	it.each(['failureFingerprint', 'repairEpisodeId', 'sourceAncestryGroupIds', 'patchAncestryGroupIds'] as const)(
		'rejects related examples split across partitions by %s',
		(group) => {
			const linked: RepairEvalExampleV1 = {
				...sampleExamples[0],
				exampleId: `linked-${group}`,
				failureFingerprint: 'separate-fingerprint',
				repairEpisodeId: 'separate-episode',
				sourceAncestryGroupIds: ['separate-source-ancestry'],
				patchAncestryGroupIds: ['separate-patch-ancestry'],
				split: 'test',
			};
			if (group === 'failureFingerprint') linked.failureFingerprint = sampleExamples[0].failureFingerprint;
			if (group === 'repairEpisodeId') linked.repairEpisodeId = sampleExamples[0].repairEpisodeId;
			if (group === 'sourceAncestryGroupIds') linked.sourceAncestryGroupIds = sampleExamples[0].sourceAncestryGroupIds;
			if (group === 'patchAncestryGroupIds') linked.patchAncestryGroupIds = sampleExamples[0].patchAncestryGroupIds;

			expect(() => buildFrozenRepairDatasetV1({
				datasetId: `ds-leaking-${group}`,
				datasetRevision: 'rev-1',
				examples: [...sampleExamples, linked],
			})).toThrow(/DATASET_SPLIT_LEAKAGE/);
		},
	);

	it('rejects duplicate example IDs and binds all example content into the checksum', () => {
		const baseline = buildFrozenRepairDatasetV1({
			datasetId: 'ds-repair-eval-v1',
			datasetRevision: 'rev-20261024',
			examples: sampleExamples,
			createdAt: '2026-10-24T00:00:00.000Z',
		});
		const edited = buildFrozenRepairDatasetV1({
			datasetId: 'ds-repair-eval-v1',
			datasetRevision: 'rev-20261024',
			examples: sampleExamples.map((example, index) => index === 0
				? { ...example, queryText: `${example.queryText} changed` }
				: example),
			createdAt: '2026-10-24T00:00:00.000Z',
		});
		expect(edited.summary.checksumSha256).not.toBe(baseline.summary.checksumSha256);
		expect(() => buildFrozenRepairDatasetV1({
			datasetId: 'ds-duplicate-id',
			datasetRevision: 'rev-1',
			examples: [...sampleExamples, sampleExamples[0]],
		})).toThrow(/DATASET_DUPLICATE_EXAMPLE_ID/);
	});

	it('aggregates evaluation metrics across multiple examples', () => {
		const obs1: RepairEvalObservationV1 = {
			retrievalRecallAt5: 1.0,
			localizationRecallAt5: 1.0,
			exactEvidenceCoverage: 1.0,
			targetedTestsPassed: true,
			typecheckPassed: true,
			regressionFree: true,
			patchMinimality: 1.0,
			falseEditRate: 0.0,
			latencyBudgetScore: 1.0,
			cacheReuseRate: 1.0,
		};

		const obs2: RepairEvalObservationV1 = {
			retrievalRecallAt5: 0.8,
			localizationRecallAt5: 0.6,
			exactEvidenceCoverage: 0.7,
			targetedTestsPassed: true,
			typecheckPassed: true,
			regressionFree: true,
			patchMinimality: 0.9,
			falseEditRate: 0.1,
			latencyBudgetScore: 0.8,
			cacheReuseRate: 0.6,
		};

		const agg = aggregateEvalMetricsV1([obs1, obs2]);
		expect(agg.sampleCount).toBe(2);
		expect(agg.meanRetrievalRecallAt5).toBe(0.9);
		expect(agg.meanLocalizationRecallAt5).toBe(0.8);
		expect(agg.meanExactEvidenceCoverage).toBe(0.85);
		expect(agg.repairSuccessRate).toBe(1.0);
		expect(agg.hardGateFailureRate).toBe(0.0);
	});
});
