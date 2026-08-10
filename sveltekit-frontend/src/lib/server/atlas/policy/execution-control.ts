import type { ExecutionBudget } from './execution-budget';
import type { ExecutorLimits, ResourceClass } from './bounded-executor';

export const DEFAULT_RESOURCE_LIMITS: Record<ResourceClass, number> = {
	IO: 3,
	CPU_LIGHT: 3,
	CPU_HEAVY: 1,
	GPU_LIGHT: 2,
	GPU_HEAVY: 1,
	LLM: 1,
};

export interface ExecutionControlPolicy {
	revision: string;
	maxParallelToolCalls: number;
	perResource: Record<ResourceClass, number>;
}

export const DEFAULT_EXECUTION_CONTROL_POLICY: ExecutionControlPolicy = {
	revision: 'parent-atlas.execution-control.v1',
	maxParallelToolCalls: 3,
	perResource: DEFAULT_RESOURCE_LIMITS,
};

export function executorLimitsFromBudget(
	budget: ExecutionBudget,
	policy: ExecutionControlPolicy = DEFAULT_EXECUTION_CONTROL_POLICY,
): ExecutorLimits {
	return {
		maxParallelToolCalls: Math.min(policy.maxParallelToolCalls, budget.maxParallelToolCalls),
		perResource: {
			IO: Math.min(policy.perResource.IO, budget.maxActiveLanes),
			CPU_LIGHT: Math.min(policy.perResource.CPU_LIGHT, budget.maxActiveLanes),
			CPU_HEAVY: Math.min(policy.perResource.CPU_HEAVY, budget.maxActiveLanes),
			GPU_LIGHT: Math.min(policy.perResource.GPU_LIGHT, budget.maxActiveLanes > 3 ? 2 : 1),
			GPU_HEAVY: 1,
			LLM: 1,
		},
	};
}

