import { test, expect, type Page } from '@playwright/test';

/**
 * Diagnostic for /demos/depth-relief: the viewer must build the synthetic image+depth surface, report the active
 * backend (WebGPU or WebGL2), honour a forced WebGL2 choice, and never fall to the flat-image error path
 * when WebGL2 is available. Captures console/page errors so a blank viewer is reported.
 */
const SHOT = process.env.DEPTH_SHOT_DIR ?? '';

function collect(page: Page) {
	const errors: string[] = [];
	page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
	page.on('console', (m) => {
		if (m.type() === 'error') errors.push(`console.error: ${m.text()} @ ${m.location().url}`);
	});
	return errors;
}

async function waitForRelief(page: Page) {
	const viewer = page.getByTestId('depth-relief');
	await expect(viewer).toBeVisible({ timeout: 30_000 });
	await expect(viewer).not.toHaveAttribute('data-backend', 'none', { timeout: 30_000 });
	await expect(page.getByTestId('depth-relief-error')).toHaveCount(0);
	// A collapsed panel still reports a backend, so assert it actually has room to draw.
	const box = await viewer.boundingBox();
	expect(box?.width ?? 0, 'viewer collapsed horizontally').toBeGreaterThan(400);
	expect(box?.height ?? 0, 'viewer collapsed vertically').toBeGreaterThan(300);
	return viewer;
}

test.describe('Depth relief demo', () => {
	test('auto backend renders and reports status', async ({ page }) => {
		const errors = collect(page);
		await page.goto('/demos/depth-relief');
		const viewer = await waitForRelief(page);
		const backend = await viewer.getAttribute('data-backend');
		const tier = await viewer.getAttribute('data-tier');
		console.log('AUTO BACKEND:', backend, 'TIER:', tier, 'STATUS:', await page.getByTestId('relief-status').innerText());
		expect(['WebGPU', 'WebGL2']).toContain(backend);
		expect(['high', 'medium', 'low']).toContain(tier);
		if (SHOT) await page.screenshot({ path: `${SHOT}/relief-auto.png` });
		expect(errors, errors.join('\n')).toEqual([]);
	});

	test('forced WebGL2 and forced low quality are honoured', async ({ page }) => {
		const errors = collect(page);
		await page.goto('/demos/depth-relief');
		await waitForRelief(page);
		await page.getByTestId('sel-backend').selectOption('webgl');
		await page.getByTestId('sel-quality').selectOption('low');
		const viewer = await waitForRelief(page);
		await expect(viewer).toHaveAttribute('data-backend', 'WebGL2', { timeout: 30_000 });
		await expect(viewer).toHaveAttribute('data-tier', 'low');
		if (SHOT) await page.screenshot({ path: `${SHOT}/relief-webgl-low.png` });
		expect(errors, errors.join('\n')).toEqual([]);
	});
});
