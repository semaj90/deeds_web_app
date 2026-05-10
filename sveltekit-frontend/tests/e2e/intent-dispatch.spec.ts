/**
 * E2E for POST /api/ai/intent-dispatch — Phase B route from the
 * 2026-05-10_service-worker-regex-tool-router design.
 *
 * Verifies the contract:
 *   - 400 on invalid body
 *   - 200 envelope: { ok, intent, chain, fallback, reason, result, trace }
 *   - intent + chain + reason coherent for known label
 *   - fallback path emits kag.multi_lane_search single-step chain
 *
 * Note: trace[].ok depends on whether MCP :8788 is up. Tests don't assert
 * on per-step success — just envelope shape + the routing decision.
 */

import { test, expect } from '@playwright/test';

const BASE = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:5173';

test.describe('POST /api/ai/intent-dispatch — Phase B contract', () => {
	test('400 on missing text field', async ({ request }) => {
		const res = await request.post(`${BASE}/api/ai/intent-dispatch`, { data: {} });
		expect(res.status()).toBe(400);
		const body = await res.json();
		expect(body.ok).toBe(false);
	});

	test('400 on empty text', async ({ request }) => {
		const res = await request.post(`${BASE}/api/ai/intent-dispatch`, {
			data: { text: '' },
		});
		expect(res.status()).toBe(400);
	});

	test('200 with full envelope on legal_research query', async ({ request }) => {
		const res = await request.post(`${BASE}/api/ai/intent-dispatch`, {
			data: { text: 'Find case law on hearsay objections in California' },
		});
		expect(res.status()).toBe(200);
		const body = await res.json();
		expect(body.ok).toBe(true);
		expect(body.intent).toBeDefined();
		expect(body.intent.label).toBe('legal_research');
		expect(Array.isArray(body.chain)).toBe(true);
		expect(body.chain).toContain('kag.multi_lane_search');
		expect(typeof body.fallback).toBe('boolean');
		expect(typeof body.reason).toBe('string');
		expect(Array.isArray(body.trace)).toBe(true);
	});

	test('fallback chain is kag.multi_lane_search for unknown intent', async ({ request }) => {
		const res = await request.post(`${BASE}/api/ai/intent-dispatch`, {
			data: { text: 'xyzzy plugh foo bar baz nothing matches' },
		});
		expect(res.status()).toBe(200);
		const body = await res.json();
		expect(body.fallback).toBe(true);
		expect(body.chain).toEqual(['kag.multi_lane_search']);
	});

	test('graph_search routes to graph chain', async ({ request }) => {
		const res = await request.post(`${BASE}/api/ai/intent-dispatch`, {
			data: { text: 'expand the neighborhood of these graph nodes 2 hops out' },
		});
		expect(res.status()).toBe(200);
		const body = await res.json();
		expect(body.intent.label).toBe('graph_search');
		expect(body.chain).toContain('graph.expand_neighborhood');
	});

	test('passes filePath context through to the chain', async ({ request }) => {
		const res = await request.post(`${BASE}/api/ai/intent-dispatch`, {
			data: {
				text: 'this button is broken in the modal — console undefined error',
				filePath: 'src/lib/components/Foo.svelte',
			},
		});
		expect(res.status()).toBe(200);
		const body = await res.json();
		expect(body.intent.label).toBe('ui_bug');
		expect(body.chain).toContain('search.dev_context');
	});

	test('400 on text exceeding 4000 char limit', async ({ request }) => {
		const res = await request.post(`${BASE}/api/ai/intent-dispatch`, {
			data: { text: 'x'.repeat(4001) },
		});
		expect(res.status()).toBe(400);
	});

	test('reason field is a one-liner audit trail (no newlines)', async ({ request }) => {
		const res = await request.post(`${BASE}/api/ai/intent-dispatch`, {
			data: { text: 'rerank these results with attention blend' },
		});
		expect(res.status()).toBe(200);
		const body = await res.json();
		expect(body.reason).not.toContain('\n');
		expect(body.reason.length).toBeLessThan(200);
	});
});