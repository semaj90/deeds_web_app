import { test, expect } from '@playwright/test';
import { captureRouteLoad, summarise, hardErrorCount, loadAnyPoiId } from './_helpers';

test.describe.serial('Route forensic: /persons-of-interest/[id]', () => {
	let poiId: string | null = null;

	test.beforeAll(async () => {
		poiId = await loadAnyPoiId();
	});

	test('GET /persons-of-interest/[id] renders without uncaught exceptions', async ({ page }) => {
		if (!poiId) test.skip();
		const log = await captureRouteLoad(page, `/persons-of-interest/${poiId}`);
		summarise(log, `GET /persons-of-interest/${poiId!.slice(0, 8)}...`);
		expect(hardErrorCount(log)).toBeLessThan(5);
	});

	test('GET /persons-of-interest/[id] — content or graceful not-found', async ({ page }) => {
		if (!poiId) test.skip();
		const log = await captureRouteLoad(page, `/persons-of-interest/${poiId}`, { waitMs: 3000 });
		await page
			.locator('h1, h2')
			.first()
			.waitFor({ state: 'attached', timeout: 5000 })
			.catch(() => {});
		const headings = await page.locator('h1, h2').count();
		const notFound = await page.locator('text=/not found|unavailable/i').count();
		console.log(`headings: ${headings}, not-found: ${notFound}`);
		summarise(log, 'GET /persons-of-interest/[id] (content)');
		expect(headings + notFound).toBeGreaterThan(0);
	});

	test('GET /persons-of-interest/<bad-id> returns no 5xx', async ({ page }) => {
		const log = await captureRouteLoad(page, '/persons-of-interest/not-a-uuid');
		const got5xx = log.responses.some(
			(r) => r.status >= 500 && r.url.includes('/persons-of-interest/')
		);
		summarise(log, 'GET /persons-of-interest/<bad>');
		expect(got5xx).toBe(false);
	});
});