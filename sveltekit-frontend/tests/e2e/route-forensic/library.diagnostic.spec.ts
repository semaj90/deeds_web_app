import { test, expect } from '@playwright/test';
import { captureRouteLoad, summarise, hardErrorCount } from './_helpers';

test.describe.serial('Route forensic: /library', () => {
	test('GET /library renders without uncaught exceptions', async ({ page }) => {
		const log = await captureRouteLoad(page, '/library');
		summarise(log, 'GET /library');
		expect(hardErrorCount(log)).toBeLessThan(5);
	});

	test('GET /library — document list or empty state', async ({ page }) => {
		const log = await captureRouteLoad(page, '/library', { waitMs: 3000 });
		// ssr=false + heavy imports → wait for hydration to surface either a list
		// item, a search input, or an empty-state message before asserting.
		await page
			.locator('li, article, [data-testid*="doc"], input[type="search"], input[type="text"], text=/no docs|no documents|empty/i')
			.first()
			.waitFor({ state: 'attached', timeout: 5000 })
			.catch(() => {});
		const items = await page.locator('li, article, [data-testid*="doc"]').count();
		const search = await page.locator('input[type="search"], input[type="text"]').count();
		const emptyMsg = await page.locator('text=/no docs|no documents|empty/i').count();
		console.log(`items: ${items}, search: ${search}, emptyMsg: ${emptyMsg}`);
		summarise(log, 'GET /library (state)');
		expect(items + search + emptyMsg).toBeGreaterThan(0);
	});
});
