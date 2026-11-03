import { test, expect, type Page } from '@playwright/test';

/**
 * Diagnostic for the board 3D Relief modal (EVIDENCE-3D-UNIFY-01, P0):
 *  - the header states what depth is (never claims stored depth for a brightness guess)
 *  - targeted Remove deletes the SELECTED marker, not the last one
 *  - relief slider (re-displacing the surface and re-seating pins) keeps pins/markers valid
 *  - close/reopen resets cleanly and renders again; no unexpected console/page errors
 * Marker-on-surface geometry is proven in relief-grid.spec.ts (raycast z == surface height at several scales).
 * Markers here are temporary in-modal state; nothing is saved.
 */
const KNOWN = /ERR_UNKNOWN_URL_SCHEME @ minio:\/\/|\[board-persistence\] IndexedDB save failed/;

async function openModal(page: Page) {
	await page.goto('/cases');
	const link = page.locator('a[href^="/cases/"]').filter({ hasNot: page.locator('[href$="/new"]') }).first();
	await expect(link).toBeVisible({ timeout: 30_000 });
	const id = ((await link.getAttribute('href')) ?? '').split('/').filter(Boolean)[1];
	await page.goto(`/cases/${id}/board`);
	const card = page.locator('.evidence-card').filter({ hasText: /\.png|\.jpe?g|screenshot|fugitivedex/i }).first();
	await expect(card, 'needs an image evidence card on the board').toBeVisible({ timeout: 30_000 });
	await card.click();
	await page.getByRole('button', { name: /3D Relief View/i }).click();
	const dialog = page.locator('.e3d-content');
	await expect(dialog).toBeVisible({ timeout: 30_000 });
	await expect(dialog.locator('.e3d-stage canvas')).toBeVisible({ timeout: 30_000 });
	// The canvas exists before the image/depth finish loading. The footer note is set in the same synchronous step
	// that builds the surface and registers the marker listener, so waiting for it means the viewer is ready.
	await expect(dialog.locator('.e3d-note')).toBeVisible({ timeout: 30_000 });
	await expect(dialog.locator('.e3d-msg')).toHaveCount(0);
	return dialog;
}

test('3D relief modal: honest depth label, targeted marker delete, slider, close/reopen', async ({ page }) => {
	const errors: string[] = [];
	page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
	page.on('console', (m) => { if (m.type() === 'error') errors.push(`console.error: ${m.text()} @ ${m.location().url}`); });

	const dialog = await openModal(page);

	// Header must name the depth source; the old text claimed brightness even for stored depth.
	const sub = dialog.locator('.e3d-sub');
	await expect(sub).toHaveText(/Preview only: depth is guessed from image brightness|stored monocular depth|Depth unavailable/i);
	console.log('DEPTH LABEL:', (await sub.innerText()).slice(0, 90));

	// Place three markers at different positions on the surface.
	await dialog.getByRole('button', { name: 'Place marker' }).click();
	const canvas = dialog.locator('.e3d-stage canvas');
	const box = (await canvas.boundingBox())!;
	for (const fx of [0.35, 0.5, 0.65]) {
		await page.mouse.click(box.x + box.width * fx, box.y + box.height * 0.5);
	}
	const pins = dialog.locator('.e3d-pin-label');
	await expect(pins).toHaveCount(3, { timeout: 15_000 });
	await expect(pins).toHaveText(['1', '2', '3']);

	// Select marker 2 and Remove: must delete marker 2, leaving 1 and 3 (not 1 and 2).
	await dialog.getByRole('button', { name: 'Orbit image' }).click();
	await pins.filter({ hasText: /^2$/ }).click();
	await expect(dialog.getByTestId('e3d-remove-marker')).toBeVisible();
	await dialog.getByTestId('e3d-remove-marker').click();
	await expect(pins).toHaveCount(2);
	await expect(pins).toHaveText(['1', '3']);

	// Re-displace the surface; pins must stay present and positioned (re-seated, not dropped).
	const before = await pins.first().boundingBox();
	await dialog.locator('.e3d-foot input[type="range"]').fill('0.8');
	await expect(pins).toHaveCount(2);
	const after = await pins.first().boundingBox();
	expect(before && after, 'pin lost its screen position after relief change').toBeTruthy();

	// Close then reopen: state resets and the viewer renders again.
	await page.keyboard.press('Escape');
	await expect(dialog).toBeHidden();
	await page.getByRole('button', { name: /3D Relief View/i }).click();
	const reopened = page.locator('.e3d-content');
	await expect(reopened.locator('.e3d-stage canvas')).toBeVisible({ timeout: 30_000 });
	await expect(reopened.locator('.e3d-pin-label')).toHaveCount(0);

	const unexpected = errors.filter((e) => !KNOWN.test(e) && !/^\s+at /.test(e));
	expect(unexpected, unexpected.join('\n')).toEqual([]);
});
