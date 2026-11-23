import { expect, test } from '@playwright/test';

const DEMO_URL = '/demos/curfew-beach-scene?v2=1';

test.use({ viewport: { width: 1360, height: 900 } });

test('captures the scene performance dialog (before the dossier modal change)', async ({ page }, testInfo) => {
	await page.goto(DEMO_URL);
	await expect(page.getByLabel('Illustrative 3D scene preview')).toBeVisible();
	await expect(page.getByText(/Illustrative preview ·/)).toBeVisible({ timeout: 15_000 });

	await page.getByRole('button', { name: 'Performance and memory' }).click();
	const dialog = page.getByRole('dialog', { name: 'Scene performance and memory' });
	await expect(dialog).toBeVisible();

	await dialog.screenshot({ path: 'test-results/ui-screenshots/scene-performance-dialog.png' });
	await page.screenshot({ path: 'test-results/ui-screenshots/scene-performance-dialog-page.png', fullPage: false });
	testInfo.annotations.push({ type: 'screenshot', description: 'test-results/ui-screenshots/' });
});
