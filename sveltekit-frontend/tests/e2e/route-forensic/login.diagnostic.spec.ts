import { test, expect } from '@playwright/test';
import { captureRouteLoad, summarise, hardErrorCount } from './_helpers';

test.describe.serial('Route forensic: /login', () => {
	test('GET /login renders without uncaught exceptions', async ({ page }) => {
		const log = await captureRouteLoad(page, '/login');
		summarise(log, 'GET /login');
		expect(hardErrorCount(log)).toBeLessThan(5);
	});

	test('GET /login — email/password inputs + submit button present', async ({ page }) => {
		const log = await captureRouteLoad(page, '/login', { waitMs: 1500 });
		const emailInput = await page.locator('input[type="email"], input[name="email"]').count();
		const passwordInput = await page.locator('input[type="password"], input[name="password"]').count();
		const submit = await page.locator('button[type="submit"]').or(page.locator('button').filter({ hasText: /sign in|login|log in/i })).count();
		console.log(`email: ${emailInput}, password: ${passwordInput}, submit: ${submit}`);
		summarise(log, 'GET /login (form)');
		expect(emailInput).toBeGreaterThan(0);
		expect(passwordInput).toBeGreaterThan(0);
		expect(submit).toBeGreaterThan(0);
	});
});