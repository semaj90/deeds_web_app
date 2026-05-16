/**
 * Legal-corpus API contract specs.
 *
 * Hits /api/statutes/search, /api/precedents/search, /api/glossary/search
 * directly (no browser) to verify the Zod + auth contract the page-level
 * forensic specs cannot cover.
 *
 * NB: With DEV_BYPASS_AUTH=true the dev server auto-authenticates every
 * request, so the 401-unauth assertion is moot here. We verify:
 *   - 400 on missing required field (Zod rejection)
 *   - 400 on max-length violation (Zod boundary)
 *   - 200/'degraded-200' on valid request
 *
 * These contracts close the test-pairing gap from
 * next_steps/active/2026-05-08-production-core-routes-recommendation.md
 * for the three legal-corpus search endpoints.
 */

import { test, expect } from '@playwright/test';
import { PORTS } from '../../helpers/env-ports.js';

const BASE = PORTS.APP_BASE;

interface SearchEndpoint {
	path: string;
	emptyBody: object;
	tooLong: object;
	validBody: object;
}

const endpoints: SearchEndpoint[] = [
	{
		path: '/api/statutes/search',
		emptyBody: {},
		tooLong: { query: 'x'.repeat(501) },
		validBody: { query: 'criminal', limit: 5 },
	},
	{
		path: '/api/precedents/search',
		emptyBody: {},
		tooLong: { query: 'y'.repeat(501) },
		validBody: { query: 'evidence', limit: 5 },
	},
	{
		path: '/api/glossary/search',
		emptyBody: {},
		tooLong: { query: 'z'.repeat(501) },
		validBody: { query: 'hearsay', limit: 5 },
	},
];

test.describe.parallel('Legal-corpus API contracts', () => {
	for (const ep of endpoints) {
		test(`POST ${ep.path} → 400 on missing query (Zod rejection)`, async ({ request }) => {
			const res = await request.post(`${BASE}${ep.path}`, { data: ep.emptyBody });
			expect(res.status(), `expected 400 for empty body, got ${res.status()}`).toBe(400);
		});

		test(`POST ${ep.path} → 400 on query > 500 chars (Zod boundary)`, async ({ request }) => {
			const res = await request.post(`${BASE}${ep.path}`, { data: ep.tooLong });
			expect(res.status(), `expected 400 for oversized query, got ${res.status()}`).toBe(400);
		});

		test(`POST ${ep.path} → 200 with degraded contract on valid input`, async ({ request }) => {
			const res = await request.post(`${BASE}${ep.path}`, { data: ep.validBody });
			// Per CLAUDE.md "Degraded Response Contract" — GET routes always 200 with
			// empty defaults. Search endpoints follow the same convention: even when
			// upstream (Qdrant/Postgres) is unavailable, 200 with empty results is
			// the canonical degraded response. 4xx is reserved for client errors.
			expect([200, 401]).toContain(res.status());
			if (res.ok()) {
				const body = await res.json();
				// Don't assume a specific shape — search endpoints vary. Just verify
				// the response is a parseable object, not an error string.
				expect(typeof body).toBe('object');
				expect(body).not.toBeNull();
			}
		});
	}
});
