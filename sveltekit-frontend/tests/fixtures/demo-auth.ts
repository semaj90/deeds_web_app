/**
 * Playwright Auth Fixture
 * Reusable authentication setup for all tests
 *
 * Usage in test files:
 *   import { test } from '../fixtures/demo-auth';
 *   test('my test', async ({ page }) => {
 *     // Already logged in as demo@legal-ai.local
 *   });
 */

import { test as base, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * Extended test fixture that automatically logs in as demo user
 */
export const test = base.extend<{ authenticatedPage: Page }>({
	authenticatedPage: async ({ page }, use) => {
		// Navigate to dev login endpoint and create session
		const response = await page.request.post('http://localhost:5173/api/dev/login-demo');

		if (!response.ok()) {
			throw new Error(
				`Failed to login as demo user. Status: ${response.status()}. ` +
					`Make sure DEV_BYPASS_AUTH=true and db:seed has run.`
			);
		}

		const data = await response.json();
		console.log(`[fixture] Logged in as ${data.user.email} (${data.user.role})`);

		// Navigate to dashboard to verify session
		await page.goto('http://localhost:5173/dashboard');

		// Verify we're logged in (no redirect to /auth/login)
		await expect(page).not.toHaveURL(/\/auth\/login/);

		// Use the authenticated page
		await use(page);
	},
});

export { expect };
