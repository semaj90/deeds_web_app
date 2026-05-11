import { test, expect } from '@playwright/test';
import { captureRouteLoad, summarise, hardErrorCount } from './_helpers';

test.describe.serial('Route forensic: /legal-corpus', () => {
	test('GET /legal-corpus renders without uncaught exceptions', async ({ page }) => {
		const log = await captureRouteLoad(page, '/legal-corpus');
		summarise(log, 'GET /legal-corpus');
		expect(hardErrorCount(log)).toBeLessThan(5);
	});

	test('GET /legal-corpus — statutes/glossary list or search input', async ({ page }) => {
		const log = await captureRouteLoad(page, '/legal-corpus', { waitMs: 1500 });
		const items = await page.locator('li, table tr, article, [data-testid*="statute"]').count();
		const search = await page.locator('input[type="search"], input[type="text"]').count();
		console.log(`items: ${items}, search: ${search}`);
		summarise(log, 'GET /legal-corpus (state)');
		expect(items + search).toBeGreaterThan(0);
	});
});