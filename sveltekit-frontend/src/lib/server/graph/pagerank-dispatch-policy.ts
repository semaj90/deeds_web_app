import { getGraphDispatcherRegistryEntry } from './graph-dispatcher-registry.js';
import type { PageRankExecutionPlanV1 } from './pagerank-execution-contract.js';
import { PAGE_RANK_EXECUTOR_CAPABILITIES } from './pagerank-execution-contract.js';

export function assertPageRankDispatchable(plan: PageRankExecutionPlanV1): void {
	const dispatcher = getGraphDispatcherRegistryEntry(plan.algorithm);
	if (dispatcher.proofState !== 'wired' || dispatcher.dispatchKind === 'fail-closed') {
		throw new Error(
			`graph algorithm '${plan.algorithm}' is not dispatchable: ${dispatcher.skipReason ?? dispatcher.proofState}`,
		);
	}
	const capabilities = PAGE_RANK_EXECUTOR_CAPABILITIES[plan.executor.executorId];
	if (plan.executor.role === 'CANONICAL_EXECUTOR' && !capabilities.canonicalEligible) {
		throw new Error(`${plan.executor.executorId} is not canonical-eligible`);
	}
	if (plan.executor.executorId === 'NON_AUTHORITATIVE_SIMULATION') {
		throw new Error('NON_AUTHORITATIVE_SIMULATION cannot be dispatched as a PageRank computation');
	}
	if (plan.executor.executorId === 'PYTORCH_DENSE_REFERENCE' && capabilities.productionGraphSize !== 'SMALL_ONLY') {
		throw new Error('PYTORCH_DENSE_REFERENCE must remain SMALL_ONLY');
	}
}
