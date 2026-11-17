import { test, expect } from '@playwright/test';

// Courtroom OBJ + indexed palette + contextual chat (openspec 11.44.3 / 11.46).
// Installed Chrome (WebGPU adapter): expects the TSL packed path; strict, no fallback accepted.

test.use({
	channel: 'chrome',
	launchOptions: { args: ['--enable-unsafe-webgpu'] },
	serviceWorkers: 'block',
	viewport: { width: 1440, height: 900 },
});

test('courtroom OBJ accepts the indexed palette on the WebGPU TSL path and restores cleanly', async ({ page }, testInfo) => {
	const pageErrors: string[] = [];
	const shaderConsoleErrors: string[] = [];
	page.on('pageerror', (error) => pageErrors.push(error.message));
	page.on('console', (message) => {
		if (message.type() === 'error' && /shader|WebGL|WebGPU|WGSL|THREE/i.test(message.text())) shaderConsoleErrors.push(message.text());
	});

	await page.goto('/demos/courtroom-palette-chat');
	const objectStatus = page.getByTestId('palette-chat-object-status');
	await expect(objectStatus).toContainText('OBJ groups', { timeout: 90_000 });

	const toggle = page.getByTestId('palette-chat-palette-toggle');
	await expect(toggle).toBeEnabled({ timeout: 30_000 });
	await toggle.click();
	await expect(toggle).toHaveAttribute('aria-pressed', 'true', { timeout: 30_000 });
	const status = page.getByTestId('palette-chat-palette-status');
	await expect(status).toContainText('webgpu-tsl-packed');

	// Pixel check: a black render (the pre-fix TSL failure) has almost no pixels brighter than the background.
	const canvasPng = await page.getByTestId('palette-chat-canvas').screenshot();
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
	}, canvasPng.toString('base64'));
	expect(meanLuminance, 'canvas bright-pixel fraction').toBeGreaterThan(0.02);
	await expect(status).toContainText(/[1-9]\d* meshes packed/);
	testInfo.annotations.push({ type: 'palette-status', description: (await status.textContent()) ?? '' });
	await page.screenshot({ path: testInfo.outputPath('courtroom-palette-on-webgpu.png'), fullPage: false });

	await toggle.click();
	await expect(toggle).toHaveAttribute('aria-pressed', 'false', { timeout: 30_000 });
	await expect(status).toHaveText('Original material');

	expect(pageErrors, 'uncaught page errors').toEqual([]);
	expect(shaderConsoleErrors, 'shader/renderer console errors').toEqual([]);
});
