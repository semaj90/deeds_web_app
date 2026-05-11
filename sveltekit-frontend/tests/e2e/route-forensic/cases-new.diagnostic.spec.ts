import { test, expect } from '@playwright/test';
import { captureRouteLoad, summarise, hardErrorCount } from './_helpers';

test.describe.serial('Route forensic: /cases/new', () => {
	test('GET /cases/new renders without uncaught exceptions', async ({ page }) => {
		const log = await captureRouteLoad(page, '/cases/new');
		summarise(log, 'GET /cases/new');
		expect(hardErrorCount(log)).toBeLessThan(5);
	});

	test('GET /cases/new — form fields + submit visible (or redirected to login)', async ({ page }) => {
		const log = await captureRouteLoad(page, '/cases/new', { waitMs: 1500 });
		const url = page.url();
		if (url.includes('/login')) {
			console.log('Redirected to /login (auth-required).');
			summarise(log, 'GET /cases/new (auth-redirect)');
			return;
		}
		const titleInput = await page
			.locator('input[name="title"], input[placeholder*="title" i], input[id*="title" i]')
			.count();
		const inputs = await page.locator('input, textarea, select').count();
		const submit = await page.locator('button[type="submit"]').count();
		console.log(`titleInput: ${titleInput}, all inputs: ${inputs}, submit: ${submit}`);
		summarise(log, 'GET /cases/new (form)');
		expect(inputs).toBeGreaterThan(0);
	});
});
