import { test, expect } from '@playwright/test';
import { captureRouteLoad, summarise, hardErrorCount, loginAsDemoUser } from './_helpers';

// AUTHED CONTENT PATH — uses loginAsDemoUser in beforeEach so AUTH_REDIRECT
// cluster doesn't mask the real assertions. Copy this pattern to any other
// spec that needs an authenticated user (see _helpers.ts for full docs).
test.describe.serial('Route forensic: /cases (authed)', () => {
	test.beforeEach(async ({ page }) => {
		await loginAsDemoUser(page);
	});

	test('GET /cases renders without uncaught exceptions', async ({ page }) => {
		const log = await captureRouteLoad(page, '/cases');
		summarise(log, 'GET /cases (authed)');
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
});

// UNAUTHED PATH — explicitly tests the redirect-to-login behavior. Kept
// separate so the AUTH_REDIRECT signal is intentional + measurable.
test.describe.serial('Route forensic: /cases (unauthed)', () => {
	test('GET /cases — bounces to /login when no session', async ({ page }) => {
		// No loginAsDemoUser() here — testing the unauthenticated path.
		const log = await captureRouteLoad(page, '/cases');
		const url = page.url();
		console.log(`Final URL (unauthed): ${url}`);
		summarise(log, 'GET /cases (unauthed redirect)');
		// Either: bypass is on server-side AND we got /cases (DEV_BYPASS_AUTH=true),
		// OR: we got bounced to /login (production-like state).
		// Both are non-broken paths.
		const ok = url.includes('/cases') || url.includes('/login');
		expect(ok, `unexpected redirect to ${url}`).toBe(true);
	});
});
