import { describe, expect, it } from 'vitest';
import { createRlmRuntime } from './rlm-runtime.js';
import type { RlmBudget } from './rlm-contract.js';

const budget = (overrides: Partial<RlmBudget> = {}): RlmBudget => ({
	maxDepth: 2, maxSubcalls: 2, maxSearchCalls: 1, maxGraphExpansions: 1, maxProcessLookups: 1,
	maxPacketHydrations: 1, maxSourceReads: 1, maxPacketsHydrated: 1, maxTokens: 1000, deadlineMs: 1000, ...overrides,
});
function runtime(overrides: Partial<RlmBudget> = {}) {
	return createRlmRuntime({ requestId: 'req-1', workspaceRevision: 'workspace-r1', policyRevision: 'policy-r1', budget: budget(overrides),
		tools: { packet: async (key) => ({ packetKey: key }), source: async (ref) => ({ sourceRef: ref }), graph: async (id) => ({ canonicalId: id }), process: async (id) => ({ processId: id }) },
		search: async () => ({ response: { packets: [], topPacketKeys: ['packet-1'], metadata: {} as never, provenance: {} as never }, trace: { requestId: 'req-1', workspaceRevision: 'workspace-r1', policyRevision: 'policy-r1', depthReached: 0, subcalls: 1, steps: [], status: 'COMPLETED' } }), });
}
describe('bounded RLM runtime', () => {
	it('enforces search limits and preserves partial evidence', async () => {
		const rlm = runtime(); await rlm.search({ query: 'one' }); await expect(rlm.search({ query: 'two' })).resolves.toBeNull();
		const receipt = rlm.receipt(); expect(receipt.termination).toBe('BUDGET_EXHAUSTED'); expect(receipt.selectedCanonicalIds).toEqual(['packet-1']);
	});
	it('enforces recursive depth before issuing work', async () => {
		const rlm = runtime({ maxDepth: 1 });
		const result = await rlm.recurse(2, async () => 'must-not-run');
		expect(result).toBeNull();
		expect(rlm.receipt().termination).toBe('BUDGET_EXHAUSTED');
	});
	it('suppresses duplicates but distinguishes filters', () => {
		const rlm = runtime(); expect(rlm.visitSubproblem('GRAPH', 'Find callers', 'filters-a')).toBe(true); expect(rlm.visitSubproblem('GRAPH', ' find   callers ', 'filters-a')).toBe(false); expect(rlm.visitSubproblem('GRAPH', 'Find callers', 'filters-b')).toBe(true);
	});
	it('uses bounded owner inspection tools', async () => {
		const rlm = runtime(); await expect(rlm.inspectGraph('symbol-1', 1)).resolves.toEqual({ canonicalId: 'symbol-1' }); await expect(rlm.inspectProcess('process-1')).resolves.toEqual({ processId: 'process-1' }); expect(rlm.receipt().observed.graphCalls).toBe(1); expect(rlm.receipt().observed.processCalls).toBe(1);
	});
	it('fails closed when the recursive/search program throws', async () => {
		const rlm = createRlmRuntime({ ...runtimeOptions(), search: async () => { throw new Error('program failure'); } });
		await expect(rlm.search({ query: 'failure' })).resolves.toBeNull();
		expect(rlm.receipt().termination).toBe('FAILED');
		expect(rlm.receipt().failureCode).toBe('RLM_PROGRAM_FAILED');
	});
});

function runtimeOptions() {
	return { requestId: 'req-1', workspaceRevision: 'workspace-r1', policyRevision: 'policy-r1', budget: budget(),
		tools: { packet: async (key: string) => ({ packetKey: key }), source: async (ref: string) => ({ sourceRef: ref }), graph: async (id: string) => ({ canonicalId: id }), process: async (id: string) => ({ processId: id }) } };
}
