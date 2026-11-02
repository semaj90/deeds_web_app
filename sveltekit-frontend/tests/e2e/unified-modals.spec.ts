import { test, expect } from '@playwright/test';

test.describe('Unified Bits UI v2 Dialog & Tactical HUD Modals', () => {
	test('demos/modals opens Canonical Modal, Modal Alt, YoRHa HUD Modal, and Custom Modal Light with portaled body', async ({ page }) => {
		await page.goto('http://localhost:5173/demos/modals', { waitUntil: 'domcontentloaded' });
		await page.waitForLoadState('networkidle').catch(() => {});

		// 1. Verify page heading
		const heading = page.getByRole('heading', { name: /Bits UI v2 Dialog & HUD Modal/i });
		await expect(heading).toBeVisible();

		// 2. Open Canonical Modal (Bits UI - Dark HUD)
		const canonicalBtn = page.getByRole('button', { name: /Canonical Modal/i });
		await expect(canonicalBtn).toBeVisible();
		await canonicalBtn.click();

		// Verify dialog is portaled directly in body and has role="dialog"
		const dialog = page.locator('[role="dialog"]');
		await expect(dialog).toBeVisible();
		await expect(dialog.locator('.hud-notch-tl')).toBeVisible();
		await expect(dialog).toContainText('Canonical Bits UI Modal');

		// Press Escape to verify accessible dismiss
		await page.keyboard.press('Escape');
		await expect(dialog).not.toBeVisible();
		await page.waitForTimeout(350);

		// 3. Open Custom Modal Light (Parchment Legal Dossier)
		const lightBtn = page.getByRole('button', { name: /Custom Modal Light/i });
		await expect(lightBtn).toBeVisible();
		await lightBtn.click();

		await expect(dialog).toBeVisible();
		await expect(dialog).toContainText('Custom Legal Light Modal');
		await expect(dialog).toContainText('Court Record Specification');
		await expect(dialog.locator('.hud-notch-tl')).toBeVisible();

		// Visual receipt screenshot of Custom Modal Light
		await page.screenshot({ path: 'C:/Users/james/.gemini/antigravity/brain/ba824cbc-894a-4499-859f-d05973d1056c/custom-modal-light-parchment.png' });

		// Close via Accept Precedent button
		const acceptBtn = page.getByRole('button', { name: /Accept Precedent/i });
		await acceptBtn.click();
		await expect(dialog).not.toBeVisible();
		await page.waitForTimeout(350);

		// 4. Open Modal Alt (Re-exported wrapper)
		const altBtn = page.getByRole('button', { name: /Modal Alt/i });
		await expect(altBtn).toBeVisible();
		await altBtn.click();

		await expect(dialog).toBeVisible();
		await expect(dialog).toContainText('Modal Alt (Forwarded Implementation)');

		// Close via close button in footer
		const closeAltBtn = page.getByRole('button', { name: /Close Alt Modal/i });
		await closeAltBtn.click();
		await expect(dialog).not.toBeVisible();
		await page.waitForTimeout(350);

		// 5. Open Phoenix / YoRHa System HUD Modal
		const yorhaBtn = page.getByRole('button', { name: /Phoenix \/ YoRHa System HUD/i });
		await expect(yorhaBtn).toBeVisible();
		await yorhaBtn.click();

		await expect(dialog).toBeVisible();
		await expect(dialog).toContainText('COURT RECORD // EVIDENCE AUDIT');
		await expect(dialog).toContainText('SPIRIT POWER');
		await expect(dialog).toContainText('COURT RECORD');

		// Close via Resume Trial
		const resumeBtn = page.getByRole('button', { name: /Resume Trial/i });
		await resumeBtn.click();
		await expect(dialog).not.toBeVisible();
	});
});
