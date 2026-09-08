// @vitest-environment node
//
// Live (non-mocked) runtime proof for the hot-tier half of the "Hot / warm / cold storage"
// cluster in openspec/changes/parent-atlas-trace-search-joinback-proof/tasks.md's
// "Repository-first search inventory". Proves engram.ace_packet_inject actually writes to
// Valkey/Redis by round-tripping through the MCP tool AND independently re-reading the raw key
// with a second, separate ioredis client -- so the proof doesn't just trust the tool's own
// "ok:true" response.
//
// Cleans up the key it writes (best-effort DEL in afterEach) so this leaves no persistent
// footprint even though it isn't wrapped in a SQL transaction the way the Postgres-only
// integration specs are.
//
// Opt-in only via RUN_LIVE_INTEGRATION=1.

import { afterEach, describe, expect, it } from 'vitest';
import { callTraceMcpTool, isTraceMcpReachable } from './trace-mcp-http-client.js';

const RUN_LIVE_INTEGRATION = process.env.RUN_LIVE_INTEGRATION === '1';
const describeIf = RUN_LIVE_INTEGRATION ? describe : describe.skip;

describeIf('engram.ace_packet_inject (live trace-mcp-server + Valkey)', () => {
	const writtenKeys: string[] = [];

	afterEach(async () => {
		if (writtenKeys.length === 0) return;
		const { getRedis } = await import('$lib/server/redis.js');
		const redis = getRedis();
		await Promise.all(writtenKeys.splice(0).map((key) => redis.del(key)));
	});

	it('is reachable', async () => {
		expect(await isTraceMcpReachable()).toBe(true);
	});

	it('writes a real Valkey key that is independently readable outside the MCP layer', async () => {
		const runId = `runtime-proof-${Date.now()}`;
		const key = `ace:packet:${runId}`;
		const content = `runtime-proof-content-${Math.random().toString(36).slice(2)}`;

		const result = await callTraceMcpTool('engram.ace_packet_inject', {
			run_id: runId,
			context_blob: content,
			ttl_seconds: 120,
		});
		writtenKeys.push(key);

		expect(result.isError).not.toBe(true);
		const payload = JSON.parse(result.content[0]!.text) as { ok: boolean; key: string; status: string };
		expect(payload.ok).toBe(true);
		expect(payload.key).toBe(key);
		expect(payload.status).toBe('written');

		const { getRedis } = await import('$lib/server/redis.js');
		const redis = getRedis();
		const raw = await redis.get(key);
		expect(raw).toBe(content);
	});
});
