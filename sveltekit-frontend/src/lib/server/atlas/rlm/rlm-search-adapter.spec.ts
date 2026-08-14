import { describe, expect, it } from 'vitest';
import { createRlmSearchAdapter } from './rlm-search-adapter.js';
import type { RlmSearchRequest } from './rlm-contract.js';

const request: RlmSearchRequest = {
	requestId: 'req-1',
	workspaceRevision: 'workspace-r1',
	policyRevision: 'policy-r1',
	query: 'find retrieval',
	budget: {
		maxDepth: 2, maxSubcalls: 4, maxSearchCalls: 2, maxGraphExpansions: 1,
		maxPacketsHydrated: 10, maxTokens: 1000, deadlineMs: 1000,
	},
};

const response = {
	packets: [],
	 topPacketKeys: ['packet-1'],
	metadata: {} as never,
	provenance: {} as never,
};

describe('RLM SearchRuntime adapter', () => {
	it('delegates search and records a bounded trace', async () => {
		const adapter = createRlmSearchAdapter({ search: async () => response });
		const result = await adapter.search(request);
		expect(result.response.topPacketKeys).toEqual(['packet-1']);
		expect(result.trace.steps[0]?.kind).toBe('SEARCH');
		expect(result.trace.steps[0]?.selectedCanonicalIds).toEqual(['packet-1']);
		expect(result.trace.status).toBe('COMPLETED');
	});

	it('fails open when cache operations fail', async () => {
		const adapter = createRlmSearchAdapter({
			cache: {
				get: async () => { throw new Error('Valkey unavailable'); },
				set: async () => { throw new Error('Valkey unavailable'); },
			},
			search: async () => response,
		});
		await expect(adapter.search(request)).resolves.toMatchObject({ response });
	});

	it('does not reuse a cached result across revisions', async () => {
		const keys: string[] = [];
		const adapter = createRlmSearchAdapter({
			cache: {
				get: async (key) => { keys.push(key); return null; },
				set: async () => undefined,
			},
			search: async () => response,
		});
		await adapter.search(request);
		await adapter.search({ ...request, workspaceRevision: 'workspace-r2' });
		expect(keys[0]).not.toBe(keys[1]);
	});
});
