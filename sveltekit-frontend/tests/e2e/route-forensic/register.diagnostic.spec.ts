import { test, expect } from '@playwright/test';
import { captureRouteLoad, summarise, hardErrorCount } from './_helpers';

test.describe.serial('Route forensic: /register', () => {
	test('GET /register renders without uncaught exceptions', async ({ page }) => {
		const log = await captureRouteLoad(page, '/register');
		summarise(log, 'GET /register');
		expect(hardErrorCount(log)).toBeLessThan(5);
	});

	test('GET /register — form inputs visible', async ({ page }) => {
		const log = await captureRouteLoad(page, '/register', { waitMs: 1500 });
		const inputs = await page.locator('input').count();
		const submit = await page.locator('button[type="submit"]').count();
		console.log(`inputs: ${inputs}, submit: ${submit}`);
		summarise(log, 'GET /register (form)');
		expect(inputs).toBeGreaterThan(1); // at least email + password + (maybe name/confirm)
	});
});