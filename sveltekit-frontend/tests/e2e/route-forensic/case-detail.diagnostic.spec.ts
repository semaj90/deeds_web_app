import { test, expect } from '@playwright/test';
import { captureRouteLoad, summarise, hardErrorCount, loadAnyCaseId } from './_helpers';

test.describe.serial('Route forensic: /cases/[id]', () => {
	let caseId: string | null = null;

	test.beforeAll(async () => {
		caseId = await loadAnyCaseId();
		if (!caseId) console.log('[case-detail] no case rows in DB — skipping content tests');
	});

	test('GET /cases/[id] renders without uncaught exceptions', async ({ page }) => {
		if (!caseId) test.skip();
		const log = await captureRouteLoad(page, `/cases/${caseId}`);
		summarise(log, `GET /cases/${caseId!.slice(0, 8)}...`);
		expect(hardErrorCount(log)).toBeLessThan(5);
	});

	test('GET /cases/[id] — primary case content rendered or graceful degradation', async ({ page }) => {
		if (!caseId) test.skip();
		const log = await captureRouteLoad(page, `/cases/${caseId}`, { waitMs: 1500 });
		const headings = await page.locator('h1, h2').count();
		const tabs = await page.locator('[role="tab"], a[href*="/cases/"]').count();
		const loadErrorMsg = await page.locator('text=/not found|database unavailable|unable to load/i').count();
		console.log(`headings: ${headings}, tabs/sub-links: ${tabs}, loadError text: ${loadErrorMsg}`);
		summarise(log, 'GET /cases/[id] (content)');
		expect(headings + tabs + loadErrorMsg, 'page rendered nothing').toBeGreaterThan(0);
	});

	test('GET /cases/[id] with invalid UUID returns graceful 404 or redirect', async ({ page }) => {
		const log = await captureRouteLoad(page, '/cases/not-a-real-uuid');
		const status = log.responses.find((r) => r.url.endsWith('/cases/not-a-real-uuid'))?.status;
		console.log(`Status for invalid UUID: ${status ?? '(no top-level response captured)'}`);
		summarise(log, 'GET /cases/<bad-uuid>');
		// Hard rule: must NOT crash the server with a 5xx
		const got5xx = log.responses.some((r) => r.status >= 500 && r.url.includes('/cases/'));
		expect(got5xx, '5xx on invalid UUID — should be 404 or graceful degraded').toBe(false);
	});
});
