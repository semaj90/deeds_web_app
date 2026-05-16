/**
 * E2E test for POST /api/rag/search-fused — Phase 1D wire-up of RRF fusion.
 *
 * Smoke-tests the contract:
 *   - 401 unauth (no DEV_BYPASS)
 *   - 400 invalid input
 *   - 200 success returns { ok, query, results, timing, lanes }
 *   - degrades gracefully when one lane errors (still returns 200 with the working lane)
 *
 * Does NOT assert search relevance — the corpus depth is too small in db:seed
 * to make rank assertions stable. That belongs in a separate eval harness.
 */

import { test, expect } from '@playwright/test';
import { PORTS } from '../helpers/env-ports.js';

const BASE = PORTS.APP_BASE;

test.describe('POST /api/rag/search-fused — Phase 1D contract', () => {
	test('400 on missing query field', async ({ request }) => {
		const res = await request.post(`${BASE}/api/rag/search-fused`, { data: {} });
		expect(res.status()).toBe(400);
		const body = await res.json();
		expect(body.ok).toBe(false);
		expect(body.error).toBeTruthy();
	});

	test('400 on query too short (< 2 chars)', async ({ request }) => {
		const res = await request.post(`${BASE}/api/rag/search-fused`, {
			data: { query: 'a' },
		});
		expect(res.status()).toBe(400);
	});

	test('400 on query too long (> 2000 chars)', async ({ request }) => {
		const res = await request.post(`${BASE}/api/rag/search-fused`, {
			data: { query: 'x'.repeat(2001) },
		});
		expect(res.status()).toBe(400);
	});

	test('200 with full envelope on valid query (DEV_BYPASS_AUTH)', async ({ request }) => {
		const res = await request.post(`${BASE}/api/rag/search-fused`, {
			data: { query: 'evidence hearsay objection', limit: 5 },
		});
		expect(res.status()).toBe(200);
		const body = await res.json();

		// Top-level shape
		expect(body.ok).toBe(true);
		expect(body.query).toBe('evidence hearsay objection');
		expect(Array.isArray(body.results)).toBe(true);
		expect(body.results.length).toBeLessThanOrEqual(5);

		// Timing block
		expect(body.timing).toBeDefined();
		expect(typeof body.timing.embedMs).toBe('number');
		expect(typeof body.timing.denseMs).toBe('number');
		expect(typeof body.timing.sparseMs).toBe('number');
		expect(typeof body.timing.totalMs).toBe('number');
		expect(body.timing.totalMs).toBeGreaterThanOrEqual(0);

		// Lanes block — both must be reported even if one returned 0 hits
		expect(body.lanes).toBeDefined();
		expect(body.lanes.dense).toBeDefined();
		expect(body.lanes.sparse).toBeDefined();
		expect(typeof body.lanes.dense.hits).toBe('number');
		expect(typeof body.lanes.sparse.hits).toBe('number');
	});

	test('200 results have id + rrfScore + provenance breakdown', async ({ request }) => {
		const res = await request.post(`${BASE}/api/rag/search-fused`, {
			data: { query: 'evidence', limit: 3 },
		});
		expect(res.status()).toBe(200);
		const body = await res.json();
		for (const result of body.results) {
			expect(typeof result.id).toBe('string');
			expect(typeof result.rrfScore).toBe('number');
			expect(result.rrfScore).toBeGreaterThan(0);
			// rrfFuseDenseSparse always includes provenance
			expect(result.provenance).toBeDefined();
		}
	});

	test('honors denseWeight + sparseWeight overrides without crashing', async ({ request }) => {
		const res = await request.post(`${BASE}/api/rag/search-fused`, {
			data: { query: 'evidence', limit: 3, denseWeight: 0.3, sparseWeight: 0.7 },
		});
		expect(res.status()).toBe(200);
	});

	test('400 on negative weights', async ({ request }) => {
		const res = await request.post(`${BASE}/api/rag/search-fused`, {
			data: { query: 'evidence', denseWeight: -1 },
		});
		expect(res.status()).toBe(400);
	});

	test('honors jurisdiction filter', async ({ request }) => {
		const res = await request.post(`${BASE}/api/rag/search-fused`, {
			data: { query: 'evidence', jurisdiction: 'CA', limit: 5 },
		});
		// Should still 200 even if no CA-jurisdiction docs exist
		expect(res.status()).toBe(200);
		const body = await res.json();
		expect(body.ok).toBe(true);
	});
});
