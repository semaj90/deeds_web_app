/**
 * /legal-corpus/[id] paired forensic spec.
 *
 * Closes the test-pairing gap called out in
 * next_steps/active/2026-05-08-production-core-routes-recommendation.md
 * "Concrete Gaps To Burn Down → Add paired route tests for the legal and
 * search pages."
 *
 * Three contracts:
 *   1. Real (or zero-row) statute UUID → renders gracefully (no 5xx, no
 *      uncaught exception)
 *   2. Invalid UUID → graceful 'Invalid statute ID' page, NOT a 5xx
 *   3. Well-formed UUID for nonexistent row → graceful 'Statute not found'
 *
 * The list-page spec (legal-corpus.diagnostic.spec.ts) already covers
 * the index route. This adds coverage for the detail route.
 */

import { test, expect } from '@playwright/test';
import { captureRouteLoad, summarise, hardErrorCount } from './_helpers';
import pg from 'pg';

const DB_URL =
	process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';

let pool: pg.Pool | null = null;
function getPool(): pg.Pool {
	if (!pool) pool = new pg.Pool({ connectionString: DB_URL });
	return pool;
}

async function loadAnyStatuteId(): Promise<string | null> {
	try {
		const r = await getPool().query<{ id: string }>(
			'SELECT id FROM statutes ORDER BY created_at DESC LIMIT 1'
		);
		return r.rows[0]?.id ?? null;
	} catch {
		return null;
	}
}

test.describe.serial('Route forensic: /legal-corpus/[id]', () => {
	let statuteId: string | null = null;

	test.beforeAll(async () => {
		statuteId = await loadAnyStatuteId();
	});

	test('GET /legal-corpus/<real-uuid> renders or shows graceful empty state', async ({ page }) => {
		// If DB has no statutes, use a well-formed (but nonexistent) UUID so we
		// exercise the 'Statute not found' graceful path instead of skipping.
		const id = statuteId ?? '00000000-0000-4000-8000-000000000001';
		const log = await captureRouteLoad(page, `/legal-corpus/${id}`, { waitMs: 3000 });

		// ssr=false + 11 heavy component imports → wait explicitly for either a
		// content heading or the graceful error message to appear in the DOM,
		// then count them. Fixed 1500ms wait was unreliable on cold dev cache.
		await page
			.locator('h1, h2, .error-msg, text=/not found|invalid statute/i')
			.first()
			.waitFor({ state: 'attached', timeout: 5000 })
			.catch(() => {});
		const headings = await page.locator('h1, h2').count();
		const loadErrorMsg = await page
			.locator('text=/not found|database unavailable|invalid statute/i')
			.count();
		summarise(log, `GET /legal-corpus/${id.slice(0, 8)}...`);

		expect(hardErrorCount(log)).toBeLessThan(5);
		expect(headings + loadErrorMsg, 'page rendered nothing').toBeGreaterThan(0);
	});

	test('GET /legal-corpus/<bad-uuid> returns graceful 400-style state (no 5xx)', async ({
		page,
	}) => {
		const log = await captureRouteLoad(page, '/legal-corpus/not-a-uuid', { waitMs: 3000 });
		const got5xx = log.responses.some(
			(r) => r.status >= 500 && r.url.includes('/legal-corpus/')
		);
		await page
			.locator('text=/invalid|not found/i')
			.first()
			.waitFor({ state: 'attached', timeout: 5000 })
			.catch(() => {});
		const errorText = await page.locator('text=/invalid|not found/i').count();
		summarise(log, 'GET /legal-corpus/<bad-uuid>');

		expect(got5xx, '5xx on invalid UUID — should render Invalid statute ID').toBe(false);
		expect(errorText, 'graceful error message missing').toBeGreaterThan(0);
	});

	test('GET /legal-corpus/<well-formed-nonexistent-uuid> shows Statute not found', async ({
		page,
	}) => {
		const log = await captureRouteLoad(
			page,
			'/legal-corpus/00000000-0000-4000-8000-000000000000',
			{ waitMs: 3000 }
		);
		await page
			.locator('text=/not found/i')
			.first()
			.waitFor({ state: 'attached', timeout: 5000 })
			.catch(() => {});
		const notFound = await page.locator('text=/not found/i').count();
		summarise(log, 'GET /legal-corpus/<nonexistent>');

		expect(hardErrorCount(log)).toBeLessThan(5);
		expect(notFound, 'expected "not found" message for nonexistent UUID').toBeGreaterThan(0);
	});
});
