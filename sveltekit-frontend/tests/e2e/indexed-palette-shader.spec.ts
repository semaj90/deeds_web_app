import { test, expect } from '@playwright/test';

// Browser proof for the packed indexed-palette shader preview (openspec 11.45).
// Synthetic PNG generated in-page; no evidence bytes, no writes, no network dependency.

test.use({
	serviceWorkers: 'block',
	viewport: { width: 1280, height: 720 },
});

test('pre-case image relief can toggle the packed indexed-palette preview on and off without page errors', async ({ page }, testInfo) => {
	const pageErrors: string[] = [];
	const shaderConsoleErrors: string[] = [];
	page.on('pageerror', (error) => pageErrors.push(error.message));
	page.on('console', (message) => {
		if (message.type() !== 'error') return;
		const text = message.text();
		if (/shader|compile|THREE|WebGL|WebGPU/i.test(text)) shaderConsoleErrors.push(text);
	});

	// Image relief is only offered in the pre-case preflight mode (see the page's preCaseMode guard).
	await page.goto('/demos/spz-renderer?mode=preflight');

	// 64x64 synthetic PNG with a colour gradient so the 4-bit palette has real work to do.
	const pngBase64 = await page.evaluate(() => {
		const canvas = document.createElement('canvas');
		canvas.width = 64;
		canvas.height = 64;
		const ctx = canvas.getContext('2d');
		if (!ctx) throw new Error('2d canvas unavailable');
		const gradient = ctx.createLinearGradient(0, 0, 64, 64);
		gradient.addColorStop(0, '#c08040');
		gradient.addColorStop(0.5, '#40a0e0');
		gradient.addColorStop(1, '#203020');
		ctx.fillStyle = gradient;
		ctx.fillRect(0, 0, 64, 64);
		return canvas.toDataURL('image/png').split(',')[1];
	});

	const imageInput = page.getByTestId('local-image-file-input');
	await imageInput.setInputFiles({
		name: 'synthetic-gradient.png',
		mimeType: 'image/png',
		buffer: Buffer.from(pngBase64, 'base64'),
	});

	const toggle = page.getByTestId('indexed-image-preview-toggle');
	const status = page.getByTestId('indexed-image-preview-status');
	await expect(toggle).toBeEnabled({ timeout: 60_000 });
	await expect(toggle).toHaveAttribute('aria-pressed', 'false');

	await toggle.click();
	await expect(toggle).toHaveAttribute('aria-pressed', 'true', { timeout: 30_000 });
	// WebGL2 reports the packed shader path; WebGPU reports the expanded RGBA fallback.
	await expect(status).toHaveText(/packed 4bpp (GLSL|TSL) shader|expanded RGBA fallback/);
	const onStatus = (await status.textContent()) ?? '';
	await page.screenshot({ path: testInfo.outputPath('indexed-palette-preview-on.png'), fullPage: true });

	await toggle.click();
	await expect(toggle).toHaveAttribute('aria-pressed', 'false', { timeout: 30_000 });
	await expect(status).toHaveText(/source texture restored/);

	testInfo.annotations.push({ type: 'preview-status-on', description: onStatus });
	expect(pageErrors, 'uncaught page errors').toEqual([]);
	expect(shaderConsoleErrors, 'shader/renderer console errors').toEqual([]);
});
