import { describe, expect, it } from 'vitest';
import { scoreRepairEvalV1 } from './repair-eval-contract.js';

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
});
