// @vitest-environment node
/**
 * G26-compliant route test for /api/ai/intent-dispatch (Phase B).
 *
 * Covers the 4 baseline cases the design doc requires:
 *   401  unauth        — locals.user missing
 *   400  bad input     — Zod rejects (empty text)
 *   200  happy path    — MCP mocked, chain executes, response shape verified
 *   200  degraded MCP  — partial-trace returned, still 200 (UX promise)
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// vi.hoisted: must be declared before vi.mock so the factory can reference them.
const { mockCallTraceMcp, mockDbInsert } = vi.hoisted(() => ({
	mockCallTraceMcp: vi.fn(),
	mockDbInsert:     vi.fn(() => ({
		values: vi.fn(() => ({ catch: vi.fn(() => Promise.resolve()) })),
	})),
}));

vi.mock('$lib/server/mcp/trace-http', () => ({
	callTraceMcp: mockCallTraceMcp,
}));

vi.mock('$lib/server/db/client', () => ({
	db: { insert: mockDbInsert },
}));

describe('POST /api/ai/intent-dispatch', () => {
	let POST: (evt: {
		request: Request;
		locals:  Record<string, unknown>;
		url:     URL;
		params:  Record<string, string>;
	}) => Promise<Response>;

	beforeEach(async () => {
		vi.resetAllMocks();
		// Re-prime db mock chain post-reset (vi.resetAllMocks wipes the implementations)
		mockDbInsert.mockReturnValue({
			values: vi.fn(() => ({ catch: vi.fn(() => Promise.resolve()) })),
		} as any);
		mockCallTraceMcp.mockResolvedValue({
			data: { hits: [{ id: '1', score: 0.9 }] },
			ms:   5,
			ok:   true,
		});

		// Lazy import inside beforeEach (G26 pattern). Relative path mirrors the
		// auto-generated stub convention.
		const mod = (await import('../../src/routes/api/ai/intent-dispatch/+server.js')) as { POST: typeof POST };
		POST = mod.POST;
	});

	function makeReq(body?: unknown): Request {
		return new Request('http://localhost/api/ai/intent-dispatch', {
			method:  'POST',
			headers: { 'Content-Type': 'application/json' },
			body:    JSON.stringify(body ?? {}),
		});
	}
	const makeUrl = () => new URL('http://localhost/api/ai/intent-dispatch');

	it('401 — Unauthorized when locals.user is missing', async () => {
		const res = await POST({ request: makeReq({ text: 'hi' }), locals: {}, url: makeUrl(), params: {} });
		expect(res.status).toBe(401);
		const body = await res.json();
		expect(body.ok).toBe(false);
	});

	it('400 — Zod rejects empty text', async () => {
		const res = await POST({
			request: makeReq({ text: '' }),
			locals:  { user: { id: '1' } },
			url:     makeUrl(),
			params:  {},
		});
		expect(res.status).toBe(400);
		const body = await res.json();
		expect(body.ok).toBe(false);
		expect(body.error).toBeDefined();
	});

	it('400 — invalid JSON body', async () => {
		const badReq = new Request('http://localhost/api/ai/intent-dispatch', {
			method:  'POST',
			headers: { 'Content-Type': 'application/json' },
			body:    'not json at all',
		});
		const res = await POST({ request: badReq, locals: { user: { id: '1' } }, url: makeUrl(), params: {} });
		expect(res.status).toBe(400);
	});

	it('200 — happy path: legal_research query routes to expected chain', async () => {
		const res = await POST({
			request: makeReq({ text: 'search case law for hearsay precedent' }),
			locals:  { user: { id: '1' } },
			url:     makeUrl(),
			params:  {},
		});
		expect(res.status).toBe(200);

		const body = await res.json();
		expect(body.ok).toBe(true);
		expect(body.intent.label).toBe('legal_research');
		expect(body.chain).toEqual([
			'kag.multi_lane_search',
			'kb.search_summary_tree',
			'kag.feature_lookup',
		]);
		expect(body.fallback).toBe(false);
		expect(body.trace).toHaveLength(3);
		expect(body.trace.every((t: { ok: boolean }) => t.ok)).toBe(true);

		// Each step was called via MCP
		expect(mockCallTraceMcp).toHaveBeenCalledTimes(3);

		// Side-effect: context_timeline write was queued (fire-and-forget)
		expect(mockDbInsert).toHaveBeenCalled();
	});

	it('200 — happy path: ambiguous query falls back to multi_lane_search', async () => {
		const res = await POST({
			request: makeReq({ text: 'hello world how are you' }),
			locals:  { user: { id: '1' } },
			url:     makeUrl(),
			params:  {},
		});
		expect(res.status).toBe(200);

		const body = await res.json();
		expect(body.fallback).toBe(true);
		expect(body.chain).toEqual(['kag.multi_lane_search']);
	});

	it('200 — degraded MCP: partial trace returned, still 200', async () => {
		// Simulate MCP unreachable on every step
		mockCallTraceMcp.mockResolvedValue({
			data:  null,
			ms:    15_000,
			ok:    false,
			error: 'TRACE MCP unreachable: timeout',
		});

		const res = await POST({
			request: makeReq({ text: 'rerank these by attention' }),
			locals:  { user: { id: '1' } },
			url:     makeUrl(),
			params:  {},
		});
		expect(res.status).toBe(200); // UX promise: never 5xx for MCP outage

		const body = await res.json();
		expect(body.ok).toBe(true);
		expect(body.trace[0].ok).toBe(false);
		expect(body.trace[0].error).toContain('unreachable');
		expect(body.result).toBeNull();
	});
});
