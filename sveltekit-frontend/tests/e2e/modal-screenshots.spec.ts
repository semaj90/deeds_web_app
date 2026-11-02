import { test, expect } from '@playwright/test';

test('capture screenshots of Canonical Modal and Large Layout Modal', async ({ page }) => {
	await page.goto('http://localhost:5173/demos/modals', { waitUntil: 'domcontentloaded' });
	await page.waitForLoadState('networkidle').catch(() => {});

	// 1. Open Canonical Modal
	await page.getByRole('button', { name: /Canonical Modal/i }).click();
	const dialog = page.locator('[role="dialog"]');
	await expect(dialog).toBeVisible();
	await page.screenshot({ path: '.tmp/atlas/canonical-bits-ui-modal.png' });

	// Close
	await page.keyboard.press('Escape');
	await expect(dialog).not.toBeVisible();
	await page.waitForTimeout(350);

	// 2. Open Large Layout Modal
	await page.getByRole('button', { name: /Large Layout Modal/i }).click();
	await expect(dialog).toBeVisible();
	await page.screenshot({ path: '.tmp/atlas/large-layout-modal.png' });
});
