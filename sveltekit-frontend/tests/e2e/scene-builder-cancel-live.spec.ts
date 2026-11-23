import { expect, test } from '@playwright/test';

const DEMO_URL = '/demos/curfew-beach-scene?plan-builder=1';

test.use({ serviceWorkers: 'block', viewport: { width: 1360, height: 900 } });

test('a pending scene preview request can be canceled in the live builder (CASE-SCENE-LIVE-02)', async ({ page }) => {
	// Hold every scene-reconstruction request open so the cancel path runs while the request is in flight.
	await page.route('**/api/cases/*/scene-reconstruction/**', async () => {
		await new Promise(() => {});
	});

	await page.goto(DEMO_URL);
	await expect(page.getByRole('button', { name: 'Prepare scene proposal' })).toBeVisible({ timeout: 15_000 });

	await page.getByRole('button', { name: 'Prepare scene proposal' }).click();
	const cancel = page.getByRole('button', { name: 'Cancel preview preparation' });
	await expect(cancel).toBeVisible();
	await cancel.click();

	await expect(page.getByText('Preview preparation canceled.')).toBeVisible();
	await expect(page.getByText(/Proposal validated/)).toHaveCount(0);
	await expect(page.getByRole('button', { name: 'Prepare scene proposal' })).toBeEnabled();
});
