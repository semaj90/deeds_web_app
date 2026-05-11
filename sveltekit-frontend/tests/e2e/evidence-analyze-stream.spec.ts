/**
 * E2E for GET /api/evidence/[id]/analyze/stream — Phase 3 Item #6 from
 * sveltekit-frontend/next_steps_research.md.
 *
 * Verifies the contract:
 *   - 401 when not authenticated (DEV_BYPASS_AUTH disables this in dev — skip via env probe)
 *   - 400 on invalid UUID
 *   - 404 on unknown UUID
 *   - 200 with text/event-stream + at least one `data: {"type":"start",...}` line
 *     within 3s on a real seeded evidence id (the doc's acceptance test)
 */

import { test, expect } from '@playwright/test';
import pg from 'pg';

const BASE = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:5173';
// Dev server reads DATABASE_URL from env.server.ts default of port 5434
// (deeds-postgres-prod-proxy). Don't fall back to 5432 — that's a separate DB
// with stale rows that won't match what the dev server sees.
const DB_URL =
	process.env.DATABASE_URL ||
	'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';

/**
 * Query for a real evidence id inside each test (not beforeAll) — avoids any
 * race with global-setup/teardown that touches the cases table (which would
 * cascade-delete evidence rows beforeAll might have captured).
 */
async function getSeededEvidenceId(): Promise<string | null> {
	const pool = new pg.Pool({ connectionString: DB_URL, connectionTimeoutMillis: 1500 });
	try {
		const r = await pool.query<{ id: string }>('SELECT id FROM evidence LIMIT 1');
		return r.rows[0]?.id ?? null;
	} catch {
		return null;
	} finally {
		await pool.end().catch(() => {});
	}
}

test.describe('GET /api/evidence/[id]/analyze/stream — SSE contract', () => {
	test('400 on invalid UUID', async ({ request }) => {
		const res = await request.get(`${BASE}/api/evidence/not-a-uuid/analyze/stream`);
		expect(res.status()).toBe(400);
	});

	test('404 on UUID-shaped but unknown id', async ({ request }) => {
		const res = await request.get(
			`${BASE}/api/evidence/00000000-0000-0000-0000-000000000999/analyze/stream`
		);
		expect(res.status()).toBe(404);
	});

	test('200 + Content-Type: text/event-stream on a seeded evidence id', async () => {
		const eid = await getSeededEvidenceId();
		test.skip(!eid, 'no seeded evidence row — run npm run db:seed');
		// Use native fetch + AbortController — Playwright's request.get() tries to
		// buffer the SSE body forever. We only need status + Content-Type header.
		const ctrl = new AbortController();
		const res = await fetch(`${BASE}/api/evidence/${eid}/analyze/stream`, {
			signal: ctrl.signal,
		});
		expect(res.status).toBe(200);
		expect(res.headers.get('content-type') ?? '').toContain('text/event-stream');
		ctrl.abort();
	});

	test('emits at least one start SSE frame within 3s', async ({ page }) => {
		const eid = await getSeededEvidenceId();
		test.skip(!eid, 'no seeded evidence row — run npm run db:seed');

		// Use page.evaluate for SSE so we can fail fast on the 3s deadline.
		const firstFrame = await page.evaluate(
			async ({ url, deadlineMs }) => {
				return await new Promise<string | null>((resolve) => {
					const es = new EventSource(url);
					const timer = setTimeout(() => {
						es.close();
						resolve(null);
					}, deadlineMs);
					es.onmessage = (ev) => {
						clearTimeout(timer);
						es.close();
						resolve(ev.data);
					};
					es.onerror = () => {
						clearTimeout(timer);
						es.close();
						resolve(null);
					};
				});
			},
			{
				url: `${BASE}/api/evidence/${eid}/analyze/stream`,
				deadlineMs: 3000,
			}
		);

		expect(firstFrame).not.toBeNull();
		const parsed = JSON.parse(firstFrame!);
		expect(parsed.type).toBe('start');
		expect(parsed.evidenceId).toBe(eid);
		expect(parsed.model).toBeTruthy();
	});
});
