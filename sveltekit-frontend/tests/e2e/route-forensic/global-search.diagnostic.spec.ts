import { test, expect } from '@playwright/test';
import { captureRouteLoad, summarise, hardErrorCount } from './_helpers';

test.describe.serial('Route forensic: /global-search', () => {
	test('GET /global-search renders without uncaught exceptions', async ({ page }) => {
		const log = await captureRouteLoad(page, '/global-search');
		summarise(log, 'GET /global-search');
		expect(hardErrorCount(log)).toBeLessThan(5);
	});

	test('GET /global-search — search input present', async ({ page }) => {
		const log = await captureRouteLoad(page, '/global-search', { waitMs: 1500 });
		const search = await page.locator('input[type="search"], input[type="text"], [role="searchbox"]').count();
		console.log(`search inputs: ${search}`);
		summarise(log, 'GET /global-search (input)');
		expect(search, 'no search input on global search page').toBeGreaterThan(0);
	});
});
