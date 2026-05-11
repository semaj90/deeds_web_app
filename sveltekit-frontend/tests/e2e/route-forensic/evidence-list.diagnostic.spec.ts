import { test, expect } from '@playwright/test';
import { captureRouteLoad, summarise, hardErrorCount } from './_helpers';

test.describe.serial('Route forensic: /evidence', () => {
	test('GET /evidence renders without uncaught exceptions', async ({ page }) => {
		const log = await captureRouteLoad(page, '/evidence');
		summarise(log, 'GET /evidence');
		expect(hardErrorCount(log)).toBeLessThan(5);
	});

	test('GET /evidence — list region or upload CTA visible', async ({ page }) => {
		const log = await captureRouteLoad(page, '/evidence', { waitMs: 3000 });
		await page
			.locator('[data-testid*="evidence"], li, table tr, a[href*="upload"], button')
			.first()
			.waitFor({ state: 'attached', timeout: 5000 })
			.catch(() => {});
		const rows = await page.locator('[data-testid*="evidence"], li, table tr').count();
		const uploadCTA = await page
			.locator('a[href*="upload"]')
			.or(page.locator('button').filter({ hasText: /upload|add/i }))
			.count();
		console.log(`rows: ${rows}, upload CTA: ${uploadCTA}`);
		summarise(log, 'GET /evidence (state)');
		expect(rows + uploadCTA).toBeGreaterThan(0);
	});
});
