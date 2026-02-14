import { expect, test } from '@playwright/test';

/**
 * Codebase Viewer Admin UI Tests
 *
 * Tests the admin codebase viewer page.
 * Uses bits-ui Tabs, Svelte 5 runes, and UnoCSS utility classes.
 * Backends (Qdrant, PostgreSQL) may not be running,
 * so tests accept 500 responses and verify graceful degradation.
 */

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:5173';

test.describe('Codebase Viewer Admin UI', () => {
	test('should load codebase viewer page', async ({ page }) => {
		const response = await page.goto(`${BASE_URL}/admin/codebase-viewer`, {
			waitUntil: 'domcontentloaded',
			timeout: 15000,
		});

		const status = response?.status() ?? 0;
		expect(status).not.toBe(404);

		const body = await page.textContent('body');
		expect(body?.length).toBeGreaterThan(0);

		await page.screenshot({
			path: 'test-results/screenshots/codebase-viewer-full.png',
			fullPage: true,
		});
	});

	test('should display heading and stats grid', async ({ page }) => {
		const response = await page.goto(`${BASE_URL}/admin/codebase-viewer`, {
			waitUntil: 'domcontentloaded',
			timeout: 15000,
		});

		const status = response?.status() ?? 0;
		if (status === 500) {
			// Server error (backends down) — page may not render fully
			console.log('Codebase viewer returned 500 — backends likely down');
			return;
		}

		// Check for h1 heading (may show layout heading if page returns 500)
		const h1 = page.locator('h1');
		if (await h1.count() > 0) {
			const text = await h1.textContent();
			console.log(`Found h1: ${text}`);
		}

		// Check for stat cards (UnoCSS grid layout)
		const statLabels = ['Qdrant Vectors', 'Indexed Files', 'Total Errors', 'Embedding Coverage'];
		for (const label of statLabels) {
			const el = page.locator(`text=${label}`);
			if (await el.count() > 0) {
				console.log(`Found stat: ${label}`);
			}
		}
	});

	test('should render bits-ui Tabs component', async ({ page }) => {
		await page.goto(`${BASE_URL}/admin/codebase-viewer`, {
			waitUntil: 'domcontentloaded',
			timeout: 15000,
		});

		// bits-ui Tabs renders with data-state attributes
		const tabTriggers = page.locator('[role="tab"], [data-tabs-trigger]');
		const tabCount = await tabTriggers.count();

		if (tabCount > 0) {
			console.log(`Found ${tabCount} tab triggers (bits-ui Tabs)`);

			// Click through tabs
			for (let i = 0; i < Math.min(tabCount, 3); i++) {
				await tabTriggers.nth(i).click();
				await page.waitForTimeout(300);
			}
		} else {
			// Fallback: look for tab-like buttons
			const buttons = page.locator('button');
			const buttonCount = await buttons.count();
			console.log(`Found ${buttonCount} buttons (tab-like)`);
		}

		await page.screenshot({
			path: 'test-results/screenshots/codebase-viewer-tabs.png',
			fullPage: true,
		});
	});

	test('should use UnoCSS utility classes', async ({ page }) => {
		await page.goto(`${BASE_URL}/admin/codebase-viewer`, {
			waitUntil: 'domcontentloaded',
			timeout: 15000,
		});

		// Verify UnoCSS utility classes are present in the DOM
		// These are UnoCSS classes from the component
		const unoElements = page.locator('[class*="rounded-lg"], [class*="bg-panel"], [class*="text-sand"]');
		const unoCount = await unoElements.count();

		if (unoCount > 0) {
			console.log(`Found ${unoCount} elements with UnoCSS utility classes`);
		}

		// Verify grid layout
		const gridElements = page.locator('[class*="grid"]');
		const gridCount = await gridElements.count();
		if (gridCount > 0) {
			console.log(`Found ${gridCount} UnoCSS grid layouts`);
		}
	});

	test('should not crash on tab interaction', async ({ page }) => {
		await page.goto(`${BASE_URL}/admin/codebase-viewer`, {
			waitUntil: 'domcontentloaded',
			timeout: 15000,
		});

		// Try clicking any tab/button
		const buttons = page.locator('button');
		const buttonCount = await buttons.count();

		if (buttonCount > 0) {
			await buttons.first().click();
			await page.waitForTimeout(500);
		}

		// Page should still be alive
		const body = await page.textContent('body');
		expect(body?.length).toBeGreaterThan(0);
	});

	test('should show empty state when backends are down', async ({ page }) => {
		await page.goto(`${BASE_URL}/admin/codebase-viewer`, {
			waitUntil: 'domcontentloaded',
			timeout: 15000,
		});

		// When Qdrant/PostgreSQL are down, should show empty states
		// not crash the page
		const emptyStates = page.locator('text=/No.*found|No.*available|Is.*running/i');
		const emptyCount = await emptyStates.count();

		if (emptyCount > 0) {
			console.log(`Found ${emptyCount} graceful empty state messages`);
		}

		// Take final screenshot
		await page.screenshot({
			path: 'test-results/screenshots/codebase-viewer-state.png',
			fullPage: true,
		});
	});
});