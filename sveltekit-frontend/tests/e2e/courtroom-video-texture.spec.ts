import { test, expect } from '@playwright/test';

// Slice 1 (video texture): a local video uploaded in the browser becomes a Three.js VideoTexture
// on a plane in the courtroom scene. Client-side only: no server upload, no evidence write.

test.use({
	serviceWorkers: 'block',
	viewport: { width: 1440, height: 900 },
});

async function makeSyntheticWebm(page: import('@playwright/test').Page): Promise<number[]> {
	return page.evaluate(async () => {
		const canvas = document.createElement('canvas');
		canvas.width = 160;
		canvas.height = 120;
		const ctx = canvas.getContext('2d');
		if (!ctx) throw new Error('2d canvas unavailable');
		const stream = canvas.captureStream(15);
		const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
		const chunks: Blob[] = [];
		recorder.ondataavailable = (event) => { if (event.data.size > 0) chunks.push(event.data); };
		const stopped = new Promise<void>((resolve) => { recorder.onstop = () => resolve(); });
		recorder.start(100);
		let frame = 0;
		const timer = setInterval(() => {
			ctx.fillStyle = `hsl(${(frame * 25) % 360} 80% 50%)`;
			ctx.fillRect(0, 0, canvas.width, canvas.height);
			frame += 1;
		}, 66);
		await new Promise((resolve) => setTimeout(resolve, 1500));
		clearInterval(timer);
		recorder.stop();
		await stopped;
		const bytes = new Uint8Array(await new Blob(chunks, { type: 'video/webm' }).arrayBuffer());
		return Array.from(bytes);
	});
}

test('uploaded video becomes a live texture in the courtroom scene and is not black', async ({ page }, testInfo) => {
	const pageErrors: string[] = [];
	page.on('pageerror', (error) => pageErrors.push(error.message));

	await page.goto('/demos/courtroom-palette-chat');
	await expect(page.getByTestId('palette-chat-object-status')).toContainText('OBJ groups', { timeout: 90_000 });

	const clip = await makeSyntheticWebm(page);
	await page.getByTestId('video-texture-file-input').setInputFiles({
		name: 'synthetic-clip.webm',
		mimeType: 'video/webm',
		buffer: Buffer.from(clip),
	});

	const status = page.getByTestId('video-texture-status');
	await expect(status).toContainText('texture live', { timeout: 60_000 });
	await expect(page.getByTestId('video-texture-toggle')).toBeEnabled();
	await page.getByTestId('video-texture-toggle').click();
	await expect(page.getByTestId('video-texture-toggle')).toHaveText('Pause video', { timeout: 15_000 });
	await page.waitForTimeout(800);

	// Pixel check: the scene (OBJ plus the video plane) must be brighter than the 17-luminance background.
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
	testInfo.annotations.push({ type: 'video-scene-bright-fraction', description: String(meanLuminance) });
	expect(meanLuminance).toBeGreaterThan(0.02);

	await page.getByTestId('video-texture-toggle').click();
	expect(pageErrors, 'uncaught page errors').toEqual([]);
});

test('a non-video file is rejected without touching the scene', async ({ page }) => {
	await page.goto('/demos/courtroom-palette-chat');
	await expect(page.getByTestId('palette-chat-object-status')).toContainText('OBJ groups', { timeout: 90_000 });
	await page.getByTestId('video-texture-file-input').setInputFiles({
		name: 'notes.txt',
		mimeType: 'text/plain',
		buffer: Buffer.from('not a video'),
	});
	await expect(page.getByTestId('video-texture-status')).toContainText('Choose a video file');
	await expect(page.getByTestId('video-texture-toggle')).toBeDisabled();
});
