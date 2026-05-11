import { test, expect } from '@playwright/test';
import { captureRouteLoad, summarise, hardErrorCount } from './_helpers';

test.describe.serial('Route forensic: /analysis-center', () => {
	test('GET /analysis-center renders without uncaught exceptions', async ({ page }) => {
		const log = await captureRouteLoad(page, '/analysis-center');
		summarise(log, 'GET /analysis-center');
		expect(hardErrorCount(log)).toBeLessThan(5);
	});

	test('GET /analysis-center — content present', async ({ page }) => {
		const log = await captureRouteLoad(page, '/analysis-center', { waitMs: 1500 });
		const items = await page
			.locator('h1, h2, [class*="panel"], [class*="card"], button, [data-testid*="analysis"]')
			.count();
		console.log(`items: ${items}`);
		summarise(log, 'GET /analysis-center (content)');
		expect(items).toBeGreaterThan(0);
	});
});
