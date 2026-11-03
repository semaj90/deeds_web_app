import { test, expect } from '@playwright/test';

/**
 * Diagnostic for /demos/crime-reconstruction: the default view is the solid textured surface, the point cloud is
 * an opt-in diagnostic, and the surface is only shown for a colour+depth pair (sample here; service pairs from one
 * frame). Headless Chromium has no WebGPU adapter, so the page's own point-cloud pipeline may report that; that is
 * the diagnostic view, not the default surface, and is counted, not hidden.
 */
test('solid surface is the default, point cloud is diagnostic, toggling keeps both valid', async ({ page }) => {
	const errors: string[] = [];
	page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
	page.on('console', (m) => { if (m.type() === 'error') errors.push(`console.error: ${m.text()} @ ${m.location().url}`); });

	await page.goto('/demos/crime-reconstruction');
	const solidBtn = page.getByTestId('mode-solid');
	const cloudBtn = page.getByTestId('mode-pointcloud');
	await expect(solidBtn).toBeVisible({ timeout: 30_000 });

	// Default: solid mode, no surface yet, guidance shown instead of particles.
	await expect(solidBtn).toHaveAttribute('aria-pressed', 'true');
	await expect(cloudBtn).toHaveAttribute('aria-pressed', 'false');
	await expect(page.getByTestId('solid-hint')).toBeVisible();
	await expect(page.getByTestId('solid-surface')).toHaveCount(0);

	// Sample pair renders the solid surface with a derived-view label.
	await page.getByTestId('load-sample').click();
	const surface = page.getByTestId('solid-surface');
	await expect(surface).toBeVisible({ timeout: 30_000 });
	const viewer = surface.getByTestId('depth-relief');
	await expect(viewer).not.toHaveAttribute('data-backend', 'none', { timeout: 30_000 });
	await expect(page.getByTestId('depth-relief-error')).toHaveCount(0);
	const box = await viewer.boundingBox();
	expect(box?.width ?? 0, 'solid viewer collapsed horizontally').toBeGreaterThan(400);
	expect(box?.height ?? 0, 'solid viewer collapsed vertically').toBeGreaterThan(300);
	await expect(page.getByTestId('derived-label')).toContainText(/synthetic sample/i);
	await expect(page.getByTestId('derived-label')).toContainText(/not measured/i);
	if (process.env.CRIME_SHOT) await page.screenshot({ path: `${process.env.CRIME_SHOT}/crime-solid.png` });

	// Diagnostic point cloud: surface goes away, toggle state flips.
	await cloudBtn.click();
	await expect(cloudBtn).toHaveAttribute('aria-pressed', 'true');
	await expect(page.getByTestId('solid-surface')).toHaveCount(0);
	if (process.env.CRIME_SHOT) await page.screenshot({ path: `${process.env.CRIME_SHOT}/crime-pointcloud.png` });

	// Back to solid: surface returns and renders again (no leaked/dead viewer).
	await solidBtn.click();
	await expect(page.getByTestId('solid-surface')).toBeVisible();
	await expect(page.getByTestId('solid-surface').getByTestId('depth-relief')).not.toHaveAttribute('data-backend', 'none', { timeout: 30_000 });

	const webgpuNoise = errors.filter((e) => /webgpu|navigator\.gpu|adapter/i.test(e));
	console.log('PAGE WEBGPU-DIAGNOSTIC ERRORS (point-cloud pipeline, headless has no adapter):', webgpuNoise.length);
	const unexpected = errors.filter((e) => !/webgpu|navigator\.gpu|adapter/i.test(e) && !/^\s+at /.test(e));
	expect(unexpected, unexpected.join('\n')).toEqual([]);
});
