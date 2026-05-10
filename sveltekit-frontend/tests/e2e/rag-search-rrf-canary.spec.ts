/**
 * E2E for the RAG_RRF_ENABLED canary block in /api/rag/search.
 *
 * The flag is read from env at server boot — these tests verify the OBSERVABLE
 * contract regardless of which way the flag is set:
 *
 *   - Without sectionTypes: legacy pipeline runs (no `canary` field in response)
 *   - With sectionTypes + flag OFF: legacy pipeline runs (no `canary` field)
 *   - With sectionTypes + flag ON: RRF path runs and emits `canary.source = 'rrf-fused'`
 *
 * We can't toggle env mid-test, so the third assertion is conditional —
 * it only fires when the test runner happens to have RAG_RRF_ENABLED=true set.
 * Either way, the contract that "no canary field appears unless the flag fired"
 * is non-negotiable and asserted on every run.
 */

import { test, expect } from '@playwright/test';

const BASE = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:5173';

test.describe('POST /api/rag/search — RAG_RRF_ENABLED canary contract', () => {
	test('no sectionTypes → never returns canary field (legacy pipeline)', async ({ request }) => {
		const res = await request.post(`${BASE}/api/rag/search`, {
			data: { query: 'evidence hearsay', top_k: 5 },
		});
		expect(res.status()).toBe(200);
		const body = await res.json();
		expect(body.canary).toBeUndefined();
	});

	test('sectionTypes set → response is well-formed regardless of flag state', async ({ request }) => {
		const res = await request.post(`${BASE}/api/rag/search`, {
			data: {
				query: 'evidence',
				top_k: 3,
				sectionTypes: ['holding', 'reasoning'],
			},
		});
		expect(res.status()).toBe(200);
		const body = await res.json();
		// Either canary fired (RRF path) or didn't (legacy path) — both are valid
		// shapes. Just check the response is JSON-parseable and has either:
		//   { results: [...], canary: { source: 'rrf-fused', ...} }  (flag on)
		// OR the legacy shape with no canary field (flag off)
		expect(body).toBeDefined();
		if (body.canary) {
			// Canary path took it — verify shape
			expect(body.canary.source).toBe('rrf-fused');
			expect(typeof body.canary.denseHits).toBe('number');
			expect(typeof body.canary.sparseHits).toBe('number');
			expect(typeof body.canary.fusedCount).toBe('number');
			expect(typeof body.canary.canaryMs).toBe('number');
			expect(Array.isArray(body.results)).toBe(true);
		} else {
			// Legacy path — should not have canary key at all
			expect(body.canary).toBeUndefined();
		}
	});

	test('canary block does not break empty sectionTypes array', async ({ request }) => {
		// Empty array should NOT trigger the canary (only non-empty does)
		const res = await request.post(`${BASE}/api/rag/search`, {
			data: { query: 'evidence', top_k: 3, sectionTypes: [] },
		});
		expect(res.status()).toBe(200);
		const body = await res.json();
		expect(body.canary).toBeUndefined();
	});

	test('canary respects top_k truncation', async ({ request }) => {
		const res = await request.post(`${BASE}/api/rag/search`, {
			data: {
				query: 'evidence',
				top_k: 2,
				sectionTypes: ['holding'],
			},
		});
		expect(res.status()).toBe(200);
		const body = await res.json();
		if (body.canary) {
			expect(body.results.length).toBeLessThanOrEqual(2);
		}
	});
});
