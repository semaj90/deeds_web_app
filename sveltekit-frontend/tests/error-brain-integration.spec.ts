import { expect, test } from '@playwright/test';

test.describe('ErrorBrainModal Integration Tests', () => {
	test.beforeEach(async ({ page }) => {
		// /all-routes has an SSE connection — use domcontentloaded to avoid networkidle timeout
		await page.goto('/admin/all-routes');
		await page.waitForLoadState('domcontentloaded');
		await page.waitForTimeout(1500);
	});

	test('should load all-routes page with route list', async ({ page }) => {
		// Page has NES Command Center title
		await expect(page.locator('.nes-command-center .nes-header h1')).toContainText(
      'NES COMMAND CENTER'
    );
		// Stats bar is always visible (even with no routes)
		await expect(page.locator('.stats-bar')).toBeVisible();
	});

	test('should open modal when route row is clicked', async ({ page }) => {
		const firstRoute = page.locator('.route-row').first();
		if ((await firstRoute.count()) === 0) return; // no routes (AST graph unavailable)

		await firstRoute.click();
		await expect(page.locator('[role="dialog"]')).toBeVisible();
		await expect(page.locator('.modal-title')).toContainText('ROUTE DETAILS');
	});

	test('should load analysis history from API', async ({ page }) => {
		// Mock the analyses API — return sample history
		await page.route('**/api/routes/*/error-brain-analyses**', async (route) => {
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({
					data: [
						{
							id: 'test-analysis-1',
							phase: 'svelte-check',
							status: 'completed',
							created_at: new Date().toISOString(),
							patches: [{ id: 'p1' }]
						}
					],
					total: 1,
					limit: 5,
					offset: 0
				})
			});
		});

		const firstRoute = page.locator('.route-row').first();
		if ((await firstRoute.count()) === 0) return; // no routes (AST graph unavailable)

		await firstRoute.click();
		await expect(page.locator('[role="dialog"]')).toBeVisible();

		// Click ANALYZE button
		await page.locator('[data-testid="analyze-btn"]').click();

		// Analyze panel should appear with history
		await expect(page.locator('[data-testid="analyze-panel"]')).toBeVisible();
		// Should show the mocked analysis entry
		await expect(page.locator('.analysis-entry')).toBeVisible();
		await expect(page.locator('.analysis-phase')).toContainText('svelte-check');
	});

	test('should show empty state when no analyses exist', async ({ page }) => {
		// Mock the analyses API — return empty
		await page.route('**/api/routes/*/error-brain-analyses**', async (route) => {
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({ data: [], total: 0, limit: 5, offset: 0 })
			});
		});

		const firstRoute = page.locator('.route-row').first();
		if ((await firstRoute.count()) === 0) return;

		await firstRoute.click();
		await page.locator('[data-testid="analyze-btn"]').click();

		await expect(page.locator('[data-testid="analyze-panel"]')).toBeVisible();
		await expect(page.locator('.analyze-empty')).toContainText('NO ANALYSES YET');
	});

	test('should close modal', async ({ page }) => {
		const firstRoute = page.locator('.route-row').first();
		if ((await firstRoute.count()) === 0) return; // no routes (AST graph unavailable)

		await firstRoute.click();
		await expect(page.locator('[role="dialog"]')).toBeVisible();
		// Escape key closes the modal (svelte:window onkeydown handler)
		await page.keyboard.press('Escape');
		await expect(page.locator('[role="dialog"]')).not.toBeVisible();
	});

	test('should go back from analyze mode', async ({ page }) => {
		await page.route('**/api/routes/*/error-brain-analyses**', async (route) => {
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({ data: [], total: 0, limit: 5, offset: 0 })
			});
		});

		const firstRoute = page.locator('.route-row').first();
		if ((await firstRoute.count()) === 0) return;

		await firstRoute.click();
		// Enter analyze mode
		await page.locator('[data-testid="analyze-btn"]').click();
		await expect(page.locator('[data-testid="analyze-panel"]')).toBeVisible();
		// BACK button replaces ANALYZE — go back
		await page.getByRole('button', { name: 'BACK' }).click();
		await expect(page.locator('[data-testid="analyze-panel"]')).not.toBeVisible();
		// ANALYZE button is visible again
		await expect(page.locator('[data-testid="analyze-btn"]')).toBeVisible();
	});

	test('should handle route navigation', async ({ page }) => {
		const firstRoute = page.locator('.route-row').first();
		if ((await firstRoute.count()) === 0) return; // no routes (AST graph unavailable)

		await firstRoute.click();
		await expect(page.locator('[role="dialog"]')).toBeVisible();
		const routePath = await page.locator('.detail-value.path-value').textContent();
		await page.getByRole('button', { name: 'VISIT PAGE' }).click();
		if (routePath?.trim()) {
			await page.waitForURL(`**${routePath.trim()}**`);
		}
	});

	test('should log interactions to API', async ({ page }) => {
		let interactionLogged = false;
		await page.route('**/api/routes/*/interactions', async (route) => {
			interactionLogged = true;
			await route.fulfill({ status: 200, body: '{}' });
		});

		const firstRoute = page.locator('.route-row').first();
		if ((await firstRoute.count()) === 0) return; // no routes (AST graph unavailable)

		// Clicking a route row triggers a 'view' interaction log
		await firstRoute.click();
		await page.waitForTimeout(1000);
		expect(interactionLogged).toBe(true);
	});

	test('should display route health indicators', async ({ page }) => {
		// Stats bar shows HEALTHY / FLAKY / BROKEN counts — always present
		await expect(page.locator('.stats-bar')).toBeVisible();
		const routeRows = page.locator('.route-row');
		if ((await routeRows.count()) > 0) {
			await expect(page.locator('.route-health').first()).toBeVisible();
		}
	});

	test('should handle routes with errors gracefully', async ({ page }) => {
		// Page must render without crashing
		await expect(page.locator('.nes-command-center')).toBeVisible();
		// Broken route rows (conditional — only present if AST graph + DB has broken routes)
		const errorRoutes = page.locator('.route-row.is-broken');
		if ((await errorRoutes.count()) > 0) {
			await errorRoutes.first().click();
			await expect(page.locator('[role="dialog"]')).toBeVisible();
			await expect(page.locator('.modal-title')).toContainText('ROUTE DETAILS');
		}
	});
});
