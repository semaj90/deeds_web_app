import { describe, expect, it } from 'vitest';
import { scoreRepairEvalV1 } from './repair-eval-contract.js';

describe('repair-eval-contract', () => {
	it('scores successful verified repairs near one', () => {
		const result = scoreRepairEvalV1({
			quality: {
				retrievalRecallAt5: 1,
				localizationRecallAt5: 1,
				exactEvidenceCoverage: 1,
				targetedTestsPassed: true,
				typecheckPassed: true,
				regressionFree: true,
				patchMinimality: 1,
				falseEditRate: 0,
			},
			cost: {
				latencyBudgetScore: 1,
				cacheReuseRate: 1,
				toolCallBudgetScore: 1,
				gpuBudgetScore: 1,
			},
		});
		expect(result.score).toBe(1);
		expect(result.hardGatePassed).toBe(true);
		expect(result.feedback).toMatch(/quality gates passed/i);
	});

	it('cannot use cache/latency efficiency to rescue a failed repair', () => {
		const result = scoreRepairEvalV1({
			quality: {
				retrievalRecallAt5: 1,
				localizationRecallAt5: 1,
				exactEvidenceCoverage: 1,
				targetedTestsPassed: false,
				typecheckPassed: true,
				regressionFree: true,
				patchMinimality: 1,
				falseEditRate: 0,
			},
			cost: {
				latencyBudgetScore: 1,
				cacheReuseRate: 1,
				toolCallBudgetScore: 1,
				gpuBudgetScore: 1,
			},
		});
		expect(result.score).toBe(0);
		expect(result.costScore).toBe(1);
		expect(result.feedback).toContain('TARGETED_TESTS_FAILED');
	});
});
