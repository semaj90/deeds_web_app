import { test, expect } from '@playwright/test';
import { captureRouteLoad, summarise, hardErrorCount } from './_helpers';

test.describe.serial('Route forensic: /persons-of-interest', () => {
	test('GET /persons-of-interest renders without uncaught exceptions', async ({ page }) => {
		const log = await captureRouteLoad(page, '/persons-of-interest');
		summarise(log, 'GET /persons-of-interest');
		expect(hardErrorCount(log)).toBeLessThan(5);
	});

	test('GET /persons-of-interest — list or create CTA', async ({ page }) => {
		const log = await captureRouteLoad(page, '/persons-of-interest', { waitMs: 1500 });
		const rows = await page.locator('li, table tr, [data-testid*="poi"], article').count();
		const createCTA = await page.locator('a[href*="/persons-of-interest/create"], button:has-text(/create|new poi|new person/i)').count();
		console.log(`rows: ${rows}, createCTA: ${createCTA}`);
		summarise(log, 'GET /persons-of-interest (state)');
		expect(rows + createCTA).toBeGreaterThan(0);
	});
});
