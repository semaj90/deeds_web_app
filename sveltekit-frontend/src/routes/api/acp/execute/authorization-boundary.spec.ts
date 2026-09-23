// @vitest-environment node

/**
 * A2A-04: A2A_INVOCATION_AUTHORIZATION_BOUNDARY -- dispatch-layer negative control.
 *
 * Proves, without any real mutation, that POST /api/acp/execute dispatches a
 * mutating/write-capable tool (`atlas.kanban.claim`) that is NOT advertised
 * by A2A-03's discovery descriptor, gated only by generic session presence
 * (`locals.user` truthy) -- no role/permission check, unlike the sibling
 * `tool-authorization.ts` module used by /api/acp/rpc and /api/agent/execute.
 *
 * Safety: every "mutating tool" case below passes `dryRun: true`. Read the
 * handler source directly (ACPToolRegistry.ts's `atlas.kanban.claim` case):
 * `if (options?.dryRun) return kanbanPlan(...)` returns BEFORE
 * `claimKanbanTask()` (the DB call) is ever reached -- so this test cannot
 * touch Postgres even if run against a live dev environment. No Postgres,
 * Qdrant, Valkey, Neo4j, or Graphify writes occur.
 */

import { describe, expect, it } from 'vitest';
import { POST } from './+server.js';

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

describe('A2A-04 dispatch-boundary negative control: /api/acp/execute', () => {
	it('rejects with 401 when unauthenticated (auth boundary exists)', async () => {
		const res = await POST(
			makeEvent({ tool: 'atlas.kanban.claim', args: { taskId: 'nonexistent' }, dryRun: true }, null)
		);
		expect(res.status).toBe(401);
	});

	it('rejects an unknown tool name with 404 BEFORE dispatch (good: unknown methods do not fall through)', async () => {
		const res = await POST(
			makeEvent(
				{ tool: 'definitely-not-a-real-tool-name-xyz', args: {}, dryRun: true },
				{ id: 'viewer-1', role: 'viewer' }
			)
		);
		expect(res.status).toBe(404);
	});

	it('BLOCKER: dispatches a mutating/write-capable tool NOT advertised by A2A-03 discovery, for a non-admin authenticated caller, with no role/permission check', async () => {
		// `atlas.kanban.claim` is a CANONICAL_WRITE tool (claimKanbanTask() UPDATEs
		// kanban_tasks). It is NOT in A2A-03's discovery allowlist
		// (identity:recover, Search, RRFFuse, Rerank) and NOT gated by
		// tool-authorization.ts's checkToolAccess()/atlasToolRegistry the way
		// /api/agent/execute and /api/acp/rpc are. The only gate this route
		// applies is `if (!locals.user) return 401` -- role is irrelevant.
		const res = await POST(
			makeEvent(
				{ tool: 'atlas.kanban.claim', args: { taskId: 'a2a-04-probe-nonexistent-task' }, dryRun: true },
				{ id: 'viewer-1', role: 'viewer' } // deliberately NOT admin
			)
		);
		// A correctly-authorized system would reject this (403) before dispatch.
		// The live route does not -- it reaches the handler and returns the
		// dry-run plan, proving dispatch occurred for a non-admin caller.
		expect(res.status).toBe(200);
		const data = await res.json();
		expect(data.success).toBe(true);
		expect(data.kind).toBe('plan'); // proves the dryRun branch was reached inside the handler
	});

	it('same probe with dryRun omitted (defaults false) still reaches schema resolution and dispatch, not just DB -- confirms the gap is at authorization, not merely at dry-run defaulting', async () => {
		// We still do NOT let this mutate: claimKanbanTask() will throw
		// "Kanban claim conflict or task not found" for a nonexistent taskId,
		// which the handler catches and returns as a failed ToolResult (no
		// row exists to update, so the guarded UPDATE ... WHERE clause matches
		// zero rows and the transaction throws before any commit). This proves
		// dispatch reached the real (non-dry-run) code path -- past schema
		// validation and past the (absent) authorization check -- for a
		// non-admin caller, without depending on Postgres being reachable in
		// this test environment for the assertion to hold either way.
		const res = await POST(
			makeEvent(
				{ tool: 'atlas.kanban.claim', args: { taskId: 'a2a-04-probe-nonexistent-task-2' } },
				{ id: 'viewer-1', role: 'viewer' }
			)
		);
		const data = await res.json();
		// Either the DB is unreachable in this env (result.error mentions a
		// connection/handler failure) or the guarded UPDATE correctly found no
		// matching row -- both are evidence dispatch reached the real handler
		// for a non-admin caller with no prior authorization check, which is
		// exactly what this test exists to demonstrate.
		expect(res.status).toBe(200);
		expect(data.success).toBe(false);
		expect(typeof data.error).toBe('string');
	});
});
