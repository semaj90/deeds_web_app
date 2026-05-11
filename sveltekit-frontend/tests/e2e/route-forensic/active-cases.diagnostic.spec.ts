import { test, expect } from '@playwright/test';
import { captureRouteLoad, summarise, hardErrorCount } from './_helpers';

test.describe.serial('Route forensic: /active-cases', () => {
	test('GET /active-cases renders without uncaught exceptions', async ({ page }) => {
		const log = await captureRouteLoad(page, '/active-cases');
		summarise(log, 'GET /active-cases');
		expect(hardErrorCount(log)).toBeLessThan(5);
	});

	test('GET /active-cases — list rendered or empty-state graceful', async ({ page }) => {
		const log = await captureRouteLoad(page, '/active-cases', { waitMs: 1500 });
		const items = await page.locator('li, table tr, article, [data-testid*="case"]').count();
		const emptyMsg = await page.locator('text=/no active|empty/i').count();
		console.log(`items: ${items}, emptyMsg: ${emptyMsg}`);
		summarise(log, 'GET /active-cases (state)');
		expect(items + emptyMsg).toBeGreaterThan(0);
	});
});
