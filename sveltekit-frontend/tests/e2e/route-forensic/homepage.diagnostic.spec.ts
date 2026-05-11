import { test, expect } from '@playwright/test';
import { captureRouteLoad, summarise, hardErrorCount, BASE } from './_helpers';

test.describe.serial('Route forensic: / (homepage)', () => {
	test('GET / renders without uncaught exceptions', async ({ page }) => {
		const log = await captureRouteLoad(page, '/');
		summarise(log, 'GET /');
		expect(hardErrorCount(log)).toBeLessThan(5);
	});

	test('GET / hydrates <main> region', async ({ page }) => {
		const log = await captureRouteLoad(page, '/', { waitMs: 1500 });
		const mainCount = await page.locator('main, [role="main"], body > div').count();
		console.log(`Main-ish containers: ${mainCount}`);
		summarise(log, 'GET / (hydration)');
		expect(mainCount).toBeGreaterThan(0);
	});

	test('GET / — primary nav links present', async ({ page }) => {
		const log = await captureRouteLoad(page, '/');
		const navLinks = await page.locator('a[href^="/"]').count();
		const buttons = await page.locator('button').count();
		console.log(`<a href="/...">: ${navLinks}, <button>: ${buttons}`);
		summarise(log, 'GET / (affordances)');
		expect(navLinks + buttons, 'no nav or buttons rendered').toBeGreaterThan(0);
	});
});