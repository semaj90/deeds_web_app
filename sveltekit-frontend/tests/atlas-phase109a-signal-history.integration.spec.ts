// @vitest-environment node
//
// Live (non-mocked) runtime proof for the "Recommendation record / supersession" cluster of
// openspec/changes/parent-atlas-trace-search-joinback-proof/tasks.md's "Repository-first search
// inventory". Proves the phase109a_query_signal_history MCP tool round-trips through
// trace-mcp-server (:8788) -> phase109a-mcp-tools.ts -> Drizzle -> live Postgres, without
// asserting any particular data exists (the underlying `semantic_lifecycle_events` table was
// empty when this was written -- see the task file for that caveat).
//
// Opt-in only via RUN_LIVE_INTEGRATION=1, matching this repo's RUN_DB_INTEGRATION convention
// (temporal-recommendation-outcome-dag.integration.spec.ts et al.) so a normal `vitest run`
// never attempts a live network call.

import { describe, it, expect } from 'vitest';
import { callTraceMcpTool, isTraceMcpReachable } from './trace-mcp-http-client.js';

const RUN_LIVE_INTEGRATION = process.env.RUN_LIVE_INTEGRATION === '1';
const describeIf = RUN_LIVE_INTEGRATION ? describe : describe.skip;

describeIf('phase109a_query_signal_history (live trace-mcp-server)', () => {
	it('is reachable', async () => {
		expect(await isTraceMcpReachable()).toBe(true);
	});

	it('round-trips through Postgres for a non-existent signal_id without throwing', async () => {
		const result = await callTraceMcpTool('phase109a_query_signal_history', {
			signal_id: '00000000-0000-0000-0000-000000000000',
			limit: 5,
		});

		expect(result.isError).not.toBe(true);
		expect(result.content).toHaveLength(1);
		const payload = JSON.parse(result.content[0]!.text) as { events: unknown[]; total_count: string };
		expect(Array.isArray(payload.events)).toBe(true);
		expect(payload).toHaveProperty('total_count');
	});

	it('rejects a malformed signal_id with a structured validation error, not a crash', async () => {
		const result = await callTraceMcpTool('phase109a_query_signal_history', {});
		expect(result.isError).toBe(true);
		expect(result.content[0]!.text).toContain('Invalid arguments');
	});
});
