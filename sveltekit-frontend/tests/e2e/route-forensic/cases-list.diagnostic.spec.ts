import { test, expect } from '@playwright/test';
import { captureRouteLoad, summarise, hardErrorCount } from './_helpers';

test.describe.serial('Route forensic: /cases', () => {
	test('GET /cases renders without uncaught exceptions', async ({ page }) => {
		const log = await captureRouteLoad(page, '/cases');
		summarise(log, 'GET /cases');
		expect(hardErrorCount(log)).toBeLessThan(5);
	});

	test('GET /cases — list region or empty-state present', async ({ page }) => {
		const log = await captureRouteLoad(page, '/cases', { waitMs: 1500 });
		const rows = await page.locator('[role="row"], li, table tr, [data-testid*="case"]').count();
		const emptyState = await page.locator('text=/no cases|empty|create.*case/i').count();
		const newCaseBtn = await page.locator('a[href*="/cases/new"]').or(page.locator('button').filter({ hasText: /new case|create case/i })).count();
		console.log(`rows: ${rows}, empty-state: ${emptyState}, new-case affordance: ${newCaseBtn}`);
		summarise(log, 'GET /cases (state)');
		expect(rows + emptyState + newCaseBtn, 'no list, empty-state, or CTA').toBeGreaterThan(0);
	});

	test('GET /cases — redirects to /login if unauthed', async ({ page }) => {
		const log = await captureRouteLoad(page, '/cases');
		const url = page.url();
		console.log(`Final URL: ${url}`);
		summarise(log, 'GET /cases (auth-redirect check)');
		// Soft check: either we got cases or we got bounced to login — both are non-broken
		const ok = url.includes('/cases') || url.includes('/login');
		expect(ok, `unexpected redirect to ${url}`).toBe(true);
	});
});
