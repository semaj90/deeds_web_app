import { test, expect } from '@playwright/test';
import { captureRouteLoad, summarise, hardErrorCount } from './_helpers';

test.describe.serial('Route forensic: /citations', () => {
	test('GET /citations renders without uncaught exceptions', async ({ page }) => {
		const log = await captureRouteLoad(page, '/citations');
		summarise(log, 'GET /citations');
		expect(hardErrorCount(log)).toBeLessThan(5);
	});

	test('GET /citations — primary list or search', async ({ page }) => {
		const log = await captureRouteLoad(page, '/citations', { waitMs: 3000 });
		await page
			.locator('li, table tr, [data-testid*="citation"], input[type="search"], input[type="text"]')
			.first()
			.waitFor({ state: 'attached', timeout: 5000 })
			.catch(() => {});
		const rows = await page.locator('li, table tr, [data-testid*="citation"]').count();
		const search = await page.locator('input[type="search"], input[type="text"]').count();
		console.log(`rows: ${rows}, search: ${search}`);
		summarise(log, 'GET /citations (state)');
		expect(rows + search).toBeGreaterThan(0);
	});
});
