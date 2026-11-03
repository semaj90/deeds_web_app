import { afterAll, expect, it, vi } from 'vitest';

vi.mock('$lib/server/env.server.js', () => ({
	ENV: {
		NEO4J_URI: 'bolt://127.0.0.1:1',
		NEO4J_USER: 'isolated-failure-fixture',
		NEO4J_PASSWORD: 'isolated-failure-fixture'
	}
}));

import { closeNeo4jDriver } from '$lib/server/neo4j-driver.js';
import { expandAtlasGraph } from './graph-expansion-adapter.js';

afterAll(async () => {
	await closeNeo4jDriver();
});

it('fails closed on an isolated real Bolt connection refusal without fallback', async () => {
	const result = await expandAtlasGraph({
		packetKey: 'fixture:unreachable-neo4j',
		intent: 'neighborhood',
		maxHops: 1
	});

	expect(result.status).toBe('ALGORITHM_UNAVAILABLE');
	expect(result.nodes).toEqual([]);
	expect(result.edges).toEqual([]);
	expect(result.requestedBackend).toBe('neo4j');
	expect(result.effectiveBackend).toBe('neo4j');
	expect(result.executionStatus).toBe('FAILED');
	expect(result.fallbackReason).toBeNull();
	expect(result.reasonCodes.some((reason) => reason.startsWith('EXECUTION_FAILED:'))).toBe(true);
});
