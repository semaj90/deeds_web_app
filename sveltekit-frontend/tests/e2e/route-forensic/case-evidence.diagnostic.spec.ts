import { test, expect } from '@playwright/test';
import { captureRouteLoad, summarise, hardErrorCount, loadAnyCaseId } from './_helpers';

test.describe.serial('Route forensic: /cases/[id]/evidence', () => {
	let caseId: string | null = null;

	test.beforeAll(async () => {
		caseId = await loadAnyCaseId();
	});

	test('GET /cases/[id]/evidence renders without uncaught exceptions', async ({ page }) => {
		if (!caseId) test.skip();
		const log = await captureRouteLoad(page, `/cases/${caseId}/evidence`);
		summarise(log, `GET /cases/${caseId!.slice(0, 8)}.../evidence`);
		expect(hardErrorCount(log)).toBeLessThan(5);
	});

	test('GET /cases/[id]/evidence — list or empty state', async ({ page }) => {
		if (!caseId) test.skip();
		const log = await captureRouteLoad(page, `/cases/${caseId}/evidence`, { waitMs: 1500 });
		const rows = await page.locator('[data-testid*="evidence"], li, table tr').count();
		const uploadCTA = await page
			.locator('a[href*="/evidence/upload"]').or(page.locator('button').filter({ hasText: /upload/i }))
			.count();
		console.log(`evidence rows: ${rows}, upload CTA: ${uploadCTA}`);
		summarise(log, 'GET /cases/[id]/evidence (state)');
		expect(rows + uploadCTA).toBeGreaterThan(0);
	});
});
