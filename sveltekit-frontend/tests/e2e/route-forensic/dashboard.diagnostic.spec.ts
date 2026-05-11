import { test, expect } from '@playwright/test';
import { captureRouteLoad, summarise, hardErrorCount } from './_helpers';

test.describe.serial('Route forensic: /dashboard', () => {
	test('GET /dashboard renders without uncaught exceptions', async ({ page }) => {
		const log = await captureRouteLoad(page, '/dashboard');
		summarise(log, 'GET /dashboard');
		expect(hardErrorCount(log)).toBeLessThan(5);
	});

	test('GET /dashboard — primary panels rendered', async ({ page }) => {
		const log = await captureRouteLoad(page, '/dashboard', { waitMs: 1500 });
		const panels = await page.locator('h1, h2, [class*="panel"], [class*="card"], [data-testid*="panel"]').count();
		console.log(`panels/cards: ${panels}`);
		summarise(log, 'GET /dashboard (panels)');
		expect(panels).toBeGreaterThan(0);
	});
});
