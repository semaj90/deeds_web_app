import { expect, test } from '@playwright/test';
import { resolve } from 'node:path';

test('minimized sidebar reveals Bits UI tactical tooltip cards on hover', async ({ page }) => {
	const pageErrors: string[] = [];
	const consoleErrors: string[] = [];
	page.on('pageerror', (e) => pageErrors.push(e.message));
	page.on('console', (msg) => {
		if (msg.type() === 'error') consoleErrors.push(msg.text());
	});

	// Navigate to dashboard and wait for hydration
	await page.goto('/dashboard', { waitUntil: 'networkidle', timeout: 120_000 });

	const sidebar = page.locator('[data-testid="yorha-sidebar"]');
	await expect(sidebar).toBeVisible({ timeout: 60_000 });

	// Wait for client-side hydration to mount event listeners
	const collapseBtn = sidebar.locator('.collapse-btn');
	await expect(collapseBtn).toBeVisible();

	// Click to collapse
	const wasCollapsed = await sidebar.evaluate((el) => el.classList.contains('collapsed'));
	if (!wasCollapsed) {
		await collapseBtn.click();
	}
	await expect(sidebar).toHaveClass(/collapsed/, { timeout: 10_000 });

	// Locate the first few navigation icons
	const navItems = sidebar.locator('.sidebar-nav .nav-item');
	const count = await navItems.count();
	expect(count).toBeGreaterThan(5);

	// Hover over a prominent legal item (e.g. Evidence Intake or Persons of Interest or Legal Corpus)
	const evidenceItem = sidebar.locator('a.nav-item[href*="/evidence"]').first();
	await expect(evidenceItem).toBeVisible();
	await evidenceItem.hover();

	// Verify Bits UI Tooltip content appears
	const tooltip = page.locator('.yorha-tooltip-content').first();
	await expect(tooltip).toBeVisible({ timeout: 5000 });
	await expect(tooltip).toContainText('EVIDENCE');
	await expect(tooltip).toContainText('INGEST');

	// Save screenshot receipt of the tactical card
	await page.screenshot({
		path: resolve(process.cwd(), '../.tmp/atlas/sidebar-hover-tactical-tooltip.png'),
		fullPage: false,
	});

	// Hover over another item to verify smooth provider transition
	const casesItem = sidebar.locator('a.nav-item[href*="/cases"]').first();
	await casesItem.hover();
	await expect(tooltip).toBeVisible({ timeout: 5000 });
	await expect(tooltip).toContainText('ALL CASES');

	expect(pageErrors).toEqual([]);
	expect(consoleErrors).toEqual([]);
});
