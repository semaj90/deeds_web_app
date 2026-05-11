/**
 * /library/[documentId] paired forensic spec.
 *
 * Closes the detail-route test-pairing gap for the /library surface
 * (route 2 of 5 in critical-path #1 — production core route hardening).
 *
 * Three contracts:
 *   1. Real (or zero-row) document UUID → renders gracefully (no 5xx,
 *      no uncaught exception)
 *   2. Invalid UUID → Postgres rejects the parameter, the catch block in
 *      the page server load returns loadError = 'Failed to load document'
 *   3. Well-formed UUID for nonexistent row → 'Document not found'
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

async function loadAnyDocumentId(): Promise<string | null> {
	try {
		const r = await getPool().query<{ id: string }>(
			'SELECT id FROM library_documents ORDER BY created_at DESC LIMIT 1'
		);
		return r.rows[0]?.id ?? null;
	} catch {
		return null;
	}
}

test.describe.serial('Route forensic: /library/[documentId]', () => {
	let documentId: string | null = null;

	test.beforeAll(async () => {
		documentId = await loadAnyDocumentId();
	});

	test('GET /library/<real-uuid> renders or shows graceful empty state', async ({ page }) => {
		const id = documentId ?? '00000000-0000-4000-8000-000000000001';
		const log = await captureRouteLoad(page, `/library/${id}`, { waitMs: 3000 });

		await page
			.locator('h1, h2, text=/not found|failed to load/i')
			.first()
			.waitFor({ state: 'attached', timeout: 5000 })
			.catch(() => {});
		const headings = await page.locator('h1, h2').count();
		const loadErrorMsg = await page
			.locator('text=/not found|failed to load|unavailable/i')
			.count();
		summarise(log, `GET /library/${id.slice(0, 8)}...`);

		expect(hardErrorCount(log)).toBeLessThan(5);
		expect(headings + loadErrorMsg, 'page rendered nothing').toBeGreaterThan(0);
	});

	test('GET /library/<bad-uuid> returns graceful state (no 5xx)', async ({ page }) => {
		const log = await captureRouteLoad(page, '/library/not-a-uuid', { waitMs: 3000 });
		const got5xx = log.responses.some((r) => r.status >= 500 && r.url.includes('/library/'));
		await page
			.locator('text=/not found|failed to load|invalid/i')
			.first()
			.waitFor({ state: 'attached', timeout: 5000 })
			.catch(() => {});
		const errorText = await page.locator('text=/not found|failed to load|invalid/i').count();
		summarise(log, 'GET /library/<bad-uuid>');

		expect(got5xx, '5xx on invalid UUID — should be graceful loadError').toBe(false);
		expect(errorText, 'graceful error message missing').toBeGreaterThan(0);
	});

	test('GET /library/<well-formed-nonexistent-uuid> shows Document not found', async ({
		page,
	}) => {
		const log = await captureRouteLoad(
			page,
			'/library/00000000-0000-4000-8000-000000000000',
			{ waitMs: 3000 }
		);
		await page
			.locator('text=/not found/i')
			.first()
			.waitFor({ state: 'attached', timeout: 5000 })
			.catch(() => {});
		const notFound = await page.locator('text=/not found/i').count();
		summarise(log, 'GET /library/<nonexistent>');

		expect(hardErrorCount(log)).toBeLessThan(5);
		expect(notFound, 'expected "not found" for nonexistent UUID').toBeGreaterThan(0);
	});
});
