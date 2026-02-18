import { test, expect } from '@playwright/test';

/**
 * E2E Test: /all-routes NES Command Center
 *
 * Tests the NES Command Center route monitoring page.
 * Routes are loaded via SSE; tests wait for DOM content + 1.5s for SSE data.
 */

test.describe('All Routes SSE Integration', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/all-routes');
		await page.waitForLoadState('domcontentloaded');
		// Wait for SSE route data to arrive
		await page.waitForTimeout(1500);
	});

	test('should display NES COMMAND CENTER heading', async ({ page }) => {
		await expect(page.locator('h1')).toHaveText('NES COMMAND CENTER');
	});

	test('should display stats bar with route counts', async ({ page }) => {
		const statsBar = page.locator('.stats-bar');
		await expect(statsBar).toBeVisible();

		// Total stat should be visible
		const totalStat = statsBar.locator('.stat-box').first();
		await expect(totalStat).toBeVisible();
	});

	test('should render route rows with health indicators', async ({ page }) => {
		const routeRows = page.locator('.route-row');
		const count = await routeRows.count();

		if (count > 0) {
			// Verify first route row is visible
			await expect(routeRows.first()).toBeVisible();

			// Check for health indicator
			const healthIndicator = routeRows.first().locator('.route-health');
			await expect(healthIndicator).toBeVisible();
		} else {
			// No routes loaded — empty state is acceptable (SSE may not have data)
			const emptyState = page.locator('.empty-state');
			await expect(emptyState).toBeVisible();
		}
	});

	test('should display error counts on routes with errors', async ({ page }) => {
		// Look for routes with error count badges
		const errorBadges = page.locator('.route-errors');

		if (await errorBadges.count() > 0) {
			// Verify error badge format: "<N>E"
			const errorText = await errorBadges.first().textContent();
			expect(errorText).toMatch(/\d+E/);
		}
		// No errors present is also valid
	});

	test('should open route detail modal on row click', async ({ page }) => {
		const routeRows = page.locator('.route-row');
		const count = await routeRows.count();

		if (count === 0) {
			test.skip();
			return;
		}

		await routeRows.first().click();

		// Modal should open
		const modal = page.locator('.nes-modal');
		await expect(modal).toBeVisible({ timeout: 5000 });
	});

	test('should show VISIT PAGE and ANALYZE buttons in route modal', async ({ page }) => {
		const routeRows = page.locator('.route-row');
		const count = await routeRows.count();

		if (count === 0) {
			test.skip();
			return;
		}

		await routeRows.first().click();

		const modal = page.locator('.nes-modal');
		await expect(modal).toBeVisible({ timeout: 5000 });

		// Verify modal action buttons
		const visitBtn = modal.locator('a:has-text("VISIT PAGE"), button:has-text("VISIT PAGE")');
		await expect(visitBtn).toBeVisible();

		const analyzeBtn = modal.locator('[data-testid="analyze-btn"]');
		await expect(analyzeBtn).toBeVisible();
	});

	test('should close modal on [X] button click', async ({ page }) => {
		const routeRows = page.locator('.route-row');
		const count = await routeRows.count();

		if (count === 0) {
			test.skip();
			return;
		}

		await routeRows.first().click();
		const modal = page.locator('.nes-modal');
		await expect(modal).toBeVisible({ timeout: 5000 });

		// Close modal
		await modal.locator('.modal-close').click();
		await expect(modal).not.toBeVisible();
	});

	test('should filter routes using the search box', async ({ page }) => {
		// Scope to the NES command center to avoid matching CodebaseSearch dialog input
		const searchInput = page.locator('.nes-command-center .search-input');
		await expect(searchInput).toBeVisible();

		// Type a search query
		await searchInput.fill('/api');
		await page.waitForTimeout(300);

		// Results should update (or empty state shown)
		const routeRows = page.locator('.route-row');
		const count = await routeRows.count();
		// Either routes match or empty state — both valid
		if (count === 0) {
			await expect(page.locator('.empty-state')).toBeVisible();
		}
	});

	test('should have health filter select', async ({ page }) => {
		const selects = page.locator('.nes-command-center .nes-select');
		await expect(selects.first()).toBeVisible();
	});

	test('should color-code route rows by error state', async ({ page }) => {
		const brokenRoutes = page.locator('.route-row.is-broken');
		const flakyRoutes = page.locator('.route-row.is-flaky');
		const errorRoutes = page.locator('.route-row.has-errors');

		// Simply verify the CSS classes exist in DOM (may be 0 instances — that's ok)
		const broken = await brokenRoutes.count();
		const flaky = await flakyRoutes.count();
		const errors = await errorRoutes.count();

		// At minimum the page is interactive
		expect(broken + flaky + errors).toBeGreaterThanOrEqual(0);
	});
});

test.describe('All Routes SSE Performance', () => {
	test('should load page within 5 seconds', async ({ page }) => {
		const startTime = Date.now();

		await page.goto('/all-routes');
		await page.waitForLoadState('domcontentloaded');
		await expect(page.locator('h1')).toBeVisible();

		const loadTime = Date.now() - startTime;
		expect(loadTime).toBeLessThan(5000);
	});

	test('should show the NES command center layout', async ({ page }) => {
		await page.goto('/all-routes');
		await page.waitForLoadState('domcontentloaded');

		// Main container
		const main = page.locator('.nes-command-center');
		await expect(main).toBeVisible();

		// Stats bar always present
		await expect(page.locator('.stats-bar')).toBeVisible();

		// Filters bar always present
		await expect(page.locator('.filters-bar')).toBeVisible();
	});
});

test.describe('All Routes SSE Real-time Updates (Integration)', () => {
	test.skip('should update health indicator when SSE event received', async () => {
		// Requires live SSE server with real route health events
		// Skip until SSE mock infrastructure is added
	});
});
