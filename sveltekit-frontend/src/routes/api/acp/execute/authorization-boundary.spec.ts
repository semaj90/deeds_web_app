// @vitest-environment node

/**
 * A2A-04 POST-FIX regression suite.
 *
 * BEFORE this repair (see docs/reports/a2a-direct-invocation-authorization-v1.json,
 * commits 8092d81933 / 7c75fa7da2): POST /api/acp/execute dispatched any
 * registered ACP tool -- including real CANONICAL_WRITE tools not advertised
 * by A2A-03's discovery descriptor -- gated only by `if (!locals.user)`
 * session presence, with no role/permission check. A non-admin `viewer`
 * caller could dispatch `atlas.kanban.claim`.
 *
 * AFTER this repair: the route now calls toolAuthorizationGuard() (the same
 * existing capability owner /api/acp/rpc and /api/agent/execute already use)
 * plus requiredAcpToolPermission() (acp-tool-permissions.ts, a data-only
 * per-tool permission map, fail-closed for any tool missing an entry) before
 * dispatch. This file proves DENY now happens before the handler runs.
 *
 * Safety: every mutating-tool case below passes `dryRun: true` and/or
 * targets a nonexistent row, so no real Postgres/Qdrant/Valkey/Neo4j write
 * occurs even for the admin positive-control case.
 */

import { describe, expect, it, vi } from 'vitest';
import { POST } from './+server.js';
import { TOOLS } from '$lib/server/services/knowledge-search/ACPToolRegistry.js';

const authCache = vi.hoisted(() => ({
	getGrantFromCache: vi.fn(async () => null),
	setGrantInCache: vi.fn(async () => undefined)
}));

// toolAuthorizationGuard shares the production authorization owner, but its
// cache adapter is mocked here so this route proof cannot write a live Valkey
// permission-grant entry.
vi.mock('$lib/server/auth/tool-authorization-cache.js', () => authCache);

function makeEvent(body: unknown, user: { id: string; role: string } | null) {
	return {
		request: new Request('http://localhost/api/acp/execute', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body),
		}),
		locals: { user },
	} as any;
}

describe('A2A-04 POST-FIX: /api/acp/execute authorization boundary', () => {
	it('unauthenticated: still rejects with 401 (auth boundary unchanged)', async () => {
		const res = await POST(
			makeEvent({ tool: 'atlas.kanban.claim', args: { taskId: 'nonexistent' }, dryRun: true }, null)
		);
		expect(res.status).toBe(401);
	});

	it('unknown tool name: still rejects with 404 BEFORE authorization/dispatch (preserved, not turned into a capability oracle)', async () => {
		const handlerSpies = Object.values(TOOLS).map((tool) => vi.spyOn(tool, 'handler'));
		try {
			const res = await POST(
				makeEvent(
					{ tool: 'definitely-not-a-real-tool-name-xyz', args: {}, dryRun: true },
					{ id: 'viewer-1', role: 'viewer' }
				)
			);
			expect(res.status).toBe(404);
			expect(handlerSpies.every((spy) => spy.mock.calls.length === 0)).toBe(true);
		} finally {
			handlerSpies.forEach((spy) => spy.mockRestore());
		}
	});

	it('FIXED: authenticated non-admin viewer + atlas.kanban.claim -> authorization DENY (403), handler NOT invoked', async () => {
		const spy = vi.spyOn(TOOLS['atlas.kanban.claim'], 'handler');
		try {
			const res = await POST(
				makeEvent(
					{ tool: 'atlas.kanban.claim', args: { taskId: 'a2a-04-postfix-probe' }, dryRun: true },
					{ id: 'viewer-1', role: 'viewer' } // viewer has search:read + workflow:read only
				)
			);
			expect(res.status).toBe(403);
			const data = await res.json();
			expect(typeof data.error).toBe('string');
			expect(data.error).toMatch(/workflow:write/);
			// Required assertion, per audit instruction: not just HTTP status.
			expect(spy.mock.calls.length).toBe(0);
		} finally {
			spy.mockRestore();
		}
	});

	it('FIXED: same DENY holds with dryRun omitted (defaults false) -- the fix gates on tool name, not on dryRun', async () => {
		const spy = vi.spyOn(TOOLS['atlas.kanban.claim'], 'handler');
		try {
			const res = await POST(
				makeEvent({ tool: 'atlas.kanban.claim', args: { taskId: 'a2a-04-postfix-probe-2' } }, { id: 'viewer-1', role: 'viewer' })
			);
			expect(res.status).toBe(403);
			expect(spy.mock.calls.length).toBe(0);
		} finally {
			spy.mockRestore();
		}
	});

	it('FIXED: viewer + a second canonical-write tool atlas.kanban.block is denied before its handler', async () => {
		const tool = 'atlas.kanban.block';
			const spy = vi.spyOn(TOOLS[tool], 'handler');
			try {
				const res = await POST(makeEvent({ tool, args: {}, dryRun: true }, { id: 'viewer-1', role: 'viewer' }));
				expect(res.status).toBe(403);
				expect(spy.mock.calls.length).toBe(0);
			} finally {
				spy.mockRestore();
			}
	});

	it('POSITIVE AUTHORIZED CONTROL: admin caller + atlas.kanban.claim -> authorization ALLOW, dispatch reached, handler invoked (dryRun:true, no real mutation) -- proves the patch has not simply disabled the route', async () => {
		const spy = vi.spyOn(TOOLS['atlas.kanban.claim'], 'handler');
		try {
			const res = await POST(
				makeEvent(
					{ tool: 'atlas.kanban.claim', args: { taskId: 'a2a-04-admin-probe' }, dryRun: true },
					{ id: 'admin-1', role: 'admin' } // admin has workflow:write
				)
			);
			expect(res.status).toBe(200);
			const data = await res.json();
			expect(data.success).toBe(true);
			expect(data.kind).toBe('plan');
			expect(spy.mock.calls.length).toBe(1);
		} finally {
			spy.mockRestore();
		}
	});

	it('POSITIVE READ CONTROL (unchanged behavior): viewer + openspec:workboard_recommend (search:read, which viewer has) -> ALLOW, dispatch reached', async () => {
		const spy = vi.spyOn(TOOLS['openspec:workboard_recommend'], 'handler');
		try {
			const res = await POST(
				makeEvent({ tool: 'openspec:workboard_recommend', args: { limit: 1 } }, { id: 'viewer-1', role: 'viewer' })
			);
			expect(res.status).toBe(200);
			const data = await res.json();
			expect(data.success).toBe(true);
			expect(spy.mock.calls.length).toBe(1);
		} finally {
			spy.mockRestore();
		}
	});

	it('MIRROR-SYNC SPECIFIC CHECK (unchanged): mirror:sync_qdrant / mirror:sync_neo4j remain unresolvable (404) -- never registered in ACPToolRegistry.TOOLS', async () => {
		expect(TOOLS['mirror:sync_qdrant']).toBeUndefined();
		expect(TOOLS['mirror:sync_neo4j']).toBeUndefined();
		for (const tool of ['mirror:sync_qdrant', 'mirror:sync_neo4j']) {
			const res = await POST(makeEvent({ tool, args: {} }, { id: 'viewer-1', role: 'viewer' }));
			expect(res.status).toBe(404);
		}
	});

	it('FAIL-CLOSED CONTRACT: every tool registered in ACPToolRegistry.TOOLS has an explicit entry in the ACP permission map (no silent "absent from map == execute anyway")', async () => {
		const { ACP_TOOL_REQUIRED_PERMISSION } = await import(
			'$lib/server/services/knowledge-search/acp-tool-permissions.js'
		);
		const missing = Object.keys(TOOLS).filter((name) => !(name in ACP_TOOL_REQUIRED_PERMISSION));
		expect(missing).toEqual([]);
	});
});
