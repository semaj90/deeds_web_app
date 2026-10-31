/**
 * Courtroom simulation, local story preview: layout and no-write contract.
 *
 * Run against the dev server without seeding the database (the preview creates no case or session):
 *   PLAYWRIGHT_SKIP_GLOBAL_SETUP=true npx playwright test tests/e2e/courtroom-sim-local-preview.spec.ts
 * The first page load compiles Babylon and can take minutes on a cold dev server.
 */
import { expect, test } from '@playwright/test';
import { resolve } from 'node:path';

test.setTimeout(300_000);

for (const size of [
	{ width: 1280, height: 720 },
	{ width: 1920, height: 1080 }
]) {
test(`local preview at ${size.width}x${size.height}: scene ready, action bar inside viewport, no writes`, async ({ page }) => {
	await page.setViewportSize(size);
	const pageErrors: string[] = [];
	const consoleErrors: string[] = [];
	const failedAssets: string[] = [];
	const writes: string[] = [];
	page.on('pageerror', (e) => pageErrors.push(e.message));
	page.on('console', (message) => {
		if (message.type() === 'error') consoleErrors.push(message.text());
	});
	page.on('response', (response) => {
		if (response.status() >= 400 && /courtroom|models|\.glb|\.vertex|\.fragment/i.test(response.url())) {
			failedAssets.push(`${response.status()} ${response.url()}`);
		}
	});
	page.on('request', (r) => {
		if (r.method() !== 'GET' && r.method() !== 'HEAD' && !/analytics|telemetry|otel/i.test(r.url())) {
			writes.push(`${r.method()} ${new URL(r.url()).pathname}`);
		}
	});

	await page.goto('/demos/courtroom-sim', { waitUntil: 'domcontentloaded', timeout: 240_000 });
	await page.getByRole('button', { name: 'PLAY LOCAL STORY' }).click({ timeout: 120_000 });
	const canvas = page.locator('canvas.courtroom-canvas');
	await expect(canvas, 'local preview switches from lobby to the Babylon scene').toBeVisible({ timeout: 120_000 });
	await expect(canvas).toHaveAttribute('data-scene-ready', 'true', { timeout: 120_000 });
	await expect(canvas, 'registered models load or procedural fallback settles').toHaveAttribute('data-models-loaded', 'true', { timeout: 120_000 });

	const tutorial = page.getByTestId('courtroom-demo-tutorial');
	await expect(tutorial).toContainText('NO CASE CREATED');
	await tutorial.getByRole('button', { name: 'Continue' }).click();
	await tutorial.getByRole('button', { name: 'Add fictional ledger photo' }).click();
	await tutorial.getByRole('button', { name: 'Continue' }).click();
	await expect(tutorial).toContainText('Story fixture · ledger-photo · local-only');
	await tutorial.getByRole('button', { name: 'Continue' }).click();
	await expect(tutorial).toContainText('Current scene:');
	await tutorial.getByRole('button', { name: 'Close tutorial' }).click();

	const bar = page.getByRole('toolbar', { name: 'Courtroom actions' });
	await expect(bar).toBeVisible({ timeout: 120_000 });
	const box = await bar.boundingBox();
	expect(box, 'action bar has a box').not.toBeNull();
	expect(box!.y + box!.height, 'action bar bottom edge is inside the viewport').toBeLessThanOrEqual(size.height);
	await page.screenshot({
		path: resolve(process.cwd(), `../.tmp/atlas/courtroom-local-preview-${size.width}x${size.height}.png`),
		fullPage: true,
	});
	if (size.width === 1280) {
		const advance = page.getByRole('button', { name: /advance 1 sec/i });
		for (let step = 0; step < 7; step++) await advance.click();
		const movementReceipt = page.getByTestId('movement-receipt');
		await expect(movementReceipt, 'tick-200 movement reaches the witness station').toContainText('WITNESS: FINISHED', { timeout: 120_000 });
		await expect(movementReceipt).toContainText('@', { timeout: 120_000 });
		await page.screenshot({
			path: resolve(process.cwd(), '../.tmp/atlas/courtroom-local-preview-arrived.png'),
			fullPage: true,
		});
	}

	// P toggles the 3D timeline in preview mode; its slider must be reachable by name.
	await page.keyboard.press('p');
	await expect(page.getByRole('slider', { name: 'Timeline position' })).toBeVisible();

	// I opens the cast dialog; the user's own seat is marked.
	await page.keyboard.press('i');
	await expect(page.getByText('In the room')).toBeVisible();
	await expect(page.getByText('YOU')).toBeVisible();
	expect(pageErrors, 'no uncaught page errors').toEqual([]);
	expect(consoleErrors, 'no browser console errors').toEqual([]);
	expect(failedAssets, 'no failed model or shader requests').toEqual([]);
	expect(writes, 'the local preview sends no write requests').toEqual([]);
});
}
