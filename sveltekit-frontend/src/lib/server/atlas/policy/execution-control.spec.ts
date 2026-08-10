import { describe, expect, it } from 'vitest';
import { budgetFor } from './execution-budget';
import { executorLimitsFromBudget } from './execution-control';

describe('executorLimitsFromBudget', () => {
	it('keeps the GPU and LLM baseline at one lane each', () => {
		const budget = budgetFor('DEEP', 'TRACE');
		const limits = executorLimitsFromBudget(budget);

		expect(limits.maxParallelToolCalls).toBe(3);
		expect(limits.perResource.GPU_HEAVY).toBe(1);
		expect(limits.perResource.LLM).toBe(1);
		expect(limits.perResource.CPU_HEAVY).toBe(1);
	});

	it('scales light lanes conservatively from the budget', () => {
		const small = executorLimitsFromBudget(budgetFor('SMALL', 'VALIDATE'));
		const deep = executorLimitsFromBudget(budgetFor('DEEP', 'RECOVER'));

		expect(small.perResource.IO).toBeLessThanOrEqual(deep.perResource.IO);
		expect(small.perResource.GPU_LIGHT).toBeLessThanOrEqual(deep.perResource.GPU_LIGHT);
		expect(small.maxParallelToolCalls).toBe(2);
		expect(deep.maxParallelToolCalls).toBe(3);
	});
});
