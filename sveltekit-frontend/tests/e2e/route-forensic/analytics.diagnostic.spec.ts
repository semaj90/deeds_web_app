import { test, expect } from '@playwright/test';
import { captureRouteLoad, summarise, hardErrorCount } from './_helpers';

test.describe.serial('Route forensic: /analytics', () => {
	test('GET /analytics renders without uncaught exceptions', async ({ page }) => {
		const log = await captureRouteLoad(page, '/analytics');
		summarise(log, 'GET /analytics');
		expect(hardErrorCount(log)).toBeLessThan(5);
	});

	test('GET /analytics — charts/panels rendered', async ({ page }) => {
		const log = await captureRouteLoad(page, '/analytics', { waitMs: 1500 });
		const panels = await page.locator('svg, canvas, [class*="chart"], [class*="panel"], h1, h2').count();
		console.log(`chart/panel-like elements: ${panels}`);
		summarise(log, 'GET /analytics (panels)');
		expect(panels).toBeGreaterThan(0);
	});
});
