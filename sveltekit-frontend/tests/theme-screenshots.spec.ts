import { test, expect } from '@playwright/test';

const pages = [
	{ route: '/agentic-errors', name: 'agentic-errors-dashboard' },
	{ route: '/agentic-errors/analysis', name: 'agentic-errors-analysis' },
	{ route: '/admin/codebase-viewer', name: 'admin-codebase-viewer' },
	{ route: '/admin/dev-tools', name: 'admin-dev-tools' },
	{ route: '/cases', name: 'cases-list' },
	{ route: '/dashboard', name: 'dashboard' },
	{ route: '/active-cases', name: 'active-cases' },
	{ route: '/evidence', name: 'evidence' },
	{ route: '/citations', name: 'citations' },
	{ route: '/persons-of-interest', name: 'persons-of-interest' },
];

test.describe('Theme Screenshots', () => {
	test.beforeEach(async ({ page }) => {
		// Set viewport for consistent screenshots
		await page.setViewportSize({ width: 1920, height: 1080 });
	});

	for (const { route, name } of pages) {
		test(`Screenshot: ${name}`, async ({ page }) => {
			// Navigate to the page
			await page.goto(`http://localhost:5173${route}`, {
				waitUntil: 'networkidle',
				timeout: 10000,
			});

			// Wait a bit for any animations
			await page.waitForTimeout(500);

			// Take screenshot
			await page.screenshot({
				path: `screenshots/${name}.png`,
				fullPage: false,
			});

			// Basic check - page should not have error
			const errorElement = page.locator('text=/error|failed|not found/i').first();
			const hasError = await errorElement.count();
			expect(hasError).toBe(0);
		});
	}
});
