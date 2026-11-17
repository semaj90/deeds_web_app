import { test, expect } from '@playwright/test';

// WebGPU path proof for the packed indexed-palette preview (openspec 11.50).
// Launch options are top-level because Playwright forbids launchOptions inside a describe block.
// Skipped when this Chromium build exposes no WebGPU adapter, so the result is never claimed from a fallback.

test.use({
	serviceWorkers: 'block',
	viewport: { width: 1280, height: 720 },
	channel: 'chrome', // installed Chrome exposes a WebGPU adapter headlessly; Playwright's bundled Chromium does not
	launchOptions: {
		args: ['--enable-unsafe-webgpu'],
	},
});

test('WebGPU backend uses the TSL packed path and toggles without page errors', async ({ page }, testInfo) => {
	const pageErrors: string[] = [];
	const shaderConsoleErrors: string[] = [];
	page.on('pageerror', (error) => pageErrors.push(error.message));
	page.on('console', (message) => {
		if (message.type() === 'error' && /shader|compile|WGSL|WebGPU|TSL|node/i.test(message.text())) shaderConsoleErrors.push(message.text());
	});

	await page.goto('/demos/spz-renderer?mode=preflight');
	const adapterAvailable = await page.evaluate(async () => {
		const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
		if (!gpu) return false;
		return Boolean(await gpu.requestAdapter().catch(() => null));
	});
	test.skip(!adapterAvailable, 'No WebGPU adapter in this Chromium build; WebGPU path not exercised.');

	const pngBase64 = await page.evaluate(() => {
		const canvas = document.createElement('canvas');
		canvas.width = 32;
		canvas.height = 32;
		const ctx = canvas.getContext('2d');
		if (!ctx) throw new Error('2d canvas unavailable');
		ctx.fillStyle = '#7a4a2a';
		ctx.fillRect(0, 0, 32, 32);
		ctx.fillStyle = '#2a8ad0';
		ctx.fillRect(16, 0, 16, 32);
		return canvas.toDataURL('image/png').split(',')[1];
	});
	await page.getByTestId('local-image-file-input').setInputFiles({
		name: 'synthetic-blocks.png',
		mimeType: 'image/png',
		buffer: Buffer.from(pngBase64, 'base64'),
	});

	const toggle = page.getByTestId('indexed-image-preview-toggle');
	const status = page.getByTestId('indexed-image-preview-status');
	await expect(toggle).toBeEnabled({ timeout: 60_000 });
	await toggle.click();
	await expect(toggle).toHaveAttribute('aria-pressed', 'true', { timeout: 30_000 });
	// Strict: an adapter exists, so the TSL path must run; a fallback here is a failure.
	await expect(status).toHaveText(/packed 4bpp TSL shader/);
	testInfo.annotations.push({ type: 'webgpu-preview-status', description: (await status.textContent()) ?? '' });
	await toggle.click();
	await expect(toggle).toHaveAttribute('aria-pressed', 'false', { timeout: 30_000 });

	// Pixel check on the viewer canvas: a black TSL render stays near the dark background.
	const viewer = page.locator('canvas').first();
	const viewerPng = await viewer.screenshot();
	const meanLuminance = await page.evaluate(async (base64) => {
		const img = new Image();
		img.src = 'data:image/png;base64,' + base64;
		await img.decode();
		const surface = document.createElement('canvas');
		surface.width = img.width;
		surface.height = img.height;
		const ctx = surface.getContext('2d');
		if (!ctx) throw new Error('2d canvas unavailable');
		ctx.drawImage(img, 0, 0);
		const data = ctx.getImageData(0, 0, surface.width, surface.height).data;
		let bright = 0;
		for (let i = 0; i < data.length; i += 4) if (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2] > 40) bright += 1;
		return bright / (data.length / 4);
	}, viewerPng.toString('base64'));
	testInfo.annotations.push({ type: 'viewer-bright-fraction', description: String(meanLuminance) });
	expect(meanLuminance, 'viewer bright-pixel fraction').toBeGreaterThan(0.02);
	expect(pageErrors, 'uncaught page errors').toEqual([]);
	expect(shaderConsoleErrors, 'WebGPU shader/TSL console errors').toEqual([]);
});
