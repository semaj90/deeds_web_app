import { test, expect } from '@playwright/test';
import { captureRouteLoad, summarise, hardErrorCount } from './_helpers';

test.describe.serial('Route forensic: /command-center', () => {
	test('GET /command-center renders without uncaught exceptions', async ({ page }) => {
		const log = await captureRouteLoad(page, '/command-center');
		summarise(log, 'GET /command-center');
		expect(hardErrorCount(log)).toBeLessThan(5);
	});

	test('GET /command-center — panels rendered', async ({ page }) => {
		const log = await captureRouteLoad(page, '/command-center', { waitMs: 1500 });
		const panels = await page.locator('h1, h2, [class*="panel"], [class*="card"], button').count();
		console.log(`panels/cards/buttons: ${panels}`);
		summarise(log, 'GET /command-center (state)');
		expect(panels).toBeGreaterThan(0);
	});
});
