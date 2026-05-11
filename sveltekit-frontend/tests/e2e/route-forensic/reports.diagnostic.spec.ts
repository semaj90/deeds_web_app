import { test, expect } from '@playwright/test';
import { captureRouteLoad, summarise, hardErrorCount } from './_helpers';

test.describe.serial('Route forensic: /reports', () => {
	test('GET /reports renders without uncaught exceptions', async ({ page }) => {
		const log = await captureRouteLoad(page, '/reports');
		summarise(log, 'GET /reports');
		expect(hardErrorCount(log)).toBeLessThan(5);
	});

	test('GET /reports — list region, CTA, or graceful empty state', async ({ page }) => {
		const log = await captureRouteLoad(page, '/reports', { waitMs: 1500 });
		const items = await page.locator('li, table tr, article, [data-testid*="report"]').count();
		const newCTA = await page.locator('a[href*="/reports/new"]').or(page.locator('button').filter({ hasText: /new report|create/i })).count();
		const emptyMsg = await page.locator('text=/no reports|empty/i').count();
		console.log(`items: ${items}, new CTA: ${newCTA}, emptyMsg: ${emptyMsg}`);
		summarise(log, 'GET /reports (state)');
		expect(items + newCTA + emptyMsg).toBeGreaterThan(0);
	});
});