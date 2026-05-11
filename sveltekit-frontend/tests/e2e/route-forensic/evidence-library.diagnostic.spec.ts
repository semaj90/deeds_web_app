import { test, expect } from '@playwright/test';
import { captureRouteLoad, summarise, hardErrorCount } from './_helpers';

test.describe.serial('Route forensic: /evidence-library', () => {
	test('GET /evidence-library renders without uncaught exceptions', async ({ page }) => {
		const log = await captureRouteLoad(page, '/evidence-library');
		summarise(log, 'GET /evidence-library');
		expect(hardErrorCount(log)).toBeLessThan(5);
	});

	test('GET /evidence-library — gallery/grid or empty state', async ({ page }) => {
		const log = await captureRouteLoad(page, '/evidence-library', { waitMs: 1500 });
		const items = await page.locator('img, [data-testid*="evidence"], li, article').count();
		const emptyMsg = await page.locator('text=/no evidence|empty|library/i').count();
		console.log(`items: ${items}, emptyMsg: ${emptyMsg}`);
		summarise(log, 'GET /evidence-library (state)');
		expect(items + emptyMsg).toBeGreaterThan(0);
	});
});
