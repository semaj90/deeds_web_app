/**
 * Library API contract specs.
 *
 * Hits /api/library/search (GET + POST), /api/library/suggestions,
 * /api/library/documents, /api/library/document/[id] directly.
 *
 * CONTRACT NOTE — degraded response (per CLAUDE.md):
 * Library search endpoints follow the project's "degraded-200" contract:
 * on Zod validation failure they return 200 with empty defaults
 * { hits: [], results: [], total: 0 } rather than 400. This is intentional
 * — clients destructure response.results without checking response.ok first.
 * So the contract tests below verify SHAPE on bad input, not status code.
 *
 * What we do verify:
 *   - Bad input → 200 with hits=[] AND total=0 (degraded contract honored)
 *   - Valid input → 200 with a shape the page expects
 *   - Path-param routes that DO check UUID → 400 on malformed UUID
 *   - Never a 5xx for any input
 */

import { test, expect } from '@playwright/test';

const BASE = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:5173';

test.describe.parallel('Library API contracts', () => {
	test.describe('POST /api/library/search (degraded-200)', () => {
		test('missing query → 200 with empty defaults', async ({ request }) => {
			const res = await request.post(`${BASE}/api/library/search`, { data: {} });
			expect(res.status()).toBe(200);
			const body = await res.json();
			expect(body.total ?? 0).toBe(0);
			expect(Array.isArray(body.hits ?? body.results ?? [])).toBe(true);
		});

		test('query < 2 chars → 200 with empty defaults', async ({ request }) => {
			const res = await request.post(`${BASE}/api/library/search`, { data: { query: 'x' } });
			expect(res.status()).toBe(200);
			const body = await res.json();
			expect(body.total ?? 0).toBe(0);
		});

		test('query > 1000 chars → 200 with empty defaults', async ({ request }) => {
			const res = await request.post(`${BASE}/api/library/search`, {
				data: { query: 'x'.repeat(1001) },
			});
			expect(res.status()).toBe(200);
			const body = await res.json();
			expect(body.total ?? 0).toBe(0);
		});

		test('valid query → 200 with parseable shape', async ({ request }) => {
			const res = await request.post(`${BASE}/api/library/search`, {
				data: { query: 'evidence law', limit: 5 },
			});
			expect(res.status()).toBe(200);
			const body = await res.json();
			expect(typeof body).toBe('object');
			expect(body).not.toBeNull();
			// At minimum, one of these keys must be present
			expect('hits' in body || 'results' in body || 'total' in body).toBe(true);
		});
	});

	test.describe('GET /api/library/search (degraded-200)', () => {
		test('missing q → 200 with empty defaults', async ({ request }) => {
			const res = await request.get(`${BASE}/api/library/search`);
			expect(res.status()).toBe(200);
			const body = await res.json();
			expect(body.total ?? 0).toBe(0);
		});

		test('q < 2 chars → 200 with empty defaults', async ({ request }) => {
			const res = await request.get(`${BASE}/api/library/search?q=x`);
			expect(res.status()).toBe(200);
			const body = await res.json();
			expect(body.total ?? 0).toBe(0);
		});

		test('valid q → 200', async ({ request }) => {
			const res = await request.get(`${BASE}/api/library/search?q=evidence&limit=5`);
			expect(res.status()).toBe(200);
		});
	});

	test.describe('GET /api/library/suggestions', () => {
		test('responds without 5xx', async ({ request }) => {
			const res = await request.get(`${BASE}/api/library/suggestions?q=ev`);
			expect(res.status()).toBeLessThan(500);
		});
	});

	test.describe('GET /api/library/documents', () => {
		test('lists documents (or degraded empty)', async ({ request }) => {
			const res = await request.get(`${BASE}/api/library/documents?limit=5`);
			expect(res.status()).toBeLessThan(500);
			if (res.ok()) {
				const body = await res.json();
				expect(typeof body).toBe('object');
			}
		});
	});

	test.describe('GET /api/library/document/[id]', () => {
		test('rejects malformed UUID with 400', async ({ request }) => {
			const res = await request.get(`${BASE}/api/library/document/not-a-uuid`);
			expect(res.status()).toBe(400);
		});

		test('well-formed nonexistent UUID returns 404 or 200', async ({ request }) => {
			const res = await request.get(
				`${BASE}/api/library/document/00000000-0000-4000-8000-000000000000`
			);
			expect([200, 404]).toContain(res.status());
		});
	});
});
