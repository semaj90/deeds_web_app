import { expect, test, type Download } from '@playwright/test';
import { resolve } from 'node:path';

test.setTimeout(300_000);

async function downloadBytes(download: Download): Promise<Buffer> {
	const stream = await download.createReadStream();
	if (!stream) throw new Error('Frame capture did not produce a readable download.');
	const chunks: Buffer[] = [];
	for await (const chunk of stream) chunks.push(Buffer.from(chunk));
	return Buffer.concat(chunks);
}

test('frame captures are deterministic and the preview preserves the project frame count', async ({ page }) => {
	const pageErrors: string[] = [];
	page.on('pageerror', (error) => pageErrors.push(error.message));
	await page.goto('/demos/courtroom-studio', { waitUntil: 'domcontentloaded', timeout: 240_000 });
	await expect(page.getByRole('button', { name: 'Download exact PNG frame' })).toBeEnabled({ timeout: 180_000 });
	await expect(page.getByText('SYNTHETIC RECONSTRUCTION — HYPOTHESIS — NOT ORIGINAL EVIDENCE')).toBeVisible();

	const capture = async () => {
		const pendingDownload = page.waitForEvent('download');
		await page.getByRole('button', { name: 'Download exact PNG frame' }).click({ timeout: 180_000 });
		const download = await pendingDownload;
		return { name: download.suggestedFilename(), bytes: await downloadBytes(download) };
	};
	const setFrame = async (frame: number) => {
		await page.getByLabel('Timeline frame').evaluate((element, value) => {
			const input = element as HTMLInputElement;
			input.value = String(value);
			input.dispatchEvent(new Event('input', { bubbles: true }));
		}, frame);
	};
	const first = await capture();
	const second = await capture();
	expect(first.name).toBe('courtroom-frame-000.png');
	expect(first.bytes.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
	expect(first.bytes.byteLength).toBeGreaterThan(10_000);
	expect(second.bytes).toEqual(first.bytes);
	await setFrame(1);
	const frame1 = await capture();
	expect(frame1.name).toBe('courtroom-frame-001.png');
	expect(frame1.bytes).not.toEqual(first.bytes);
	for (const frame of [59, 60, 119, 120, 179, 180, 238, 239]) {
		await setFrame(frame);
		const sample = await capture();
		expect(sample.name).toBe(`courtroom-frame-${String(frame).padStart(3, '0')}.png`);
		expect(sample.bytes.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
		expect(sample.bytes.byteLength).toBeGreaterThan(10_000);
	}

	const previewDownloadPromise = page.waitForEvent('download', { timeout: 180_000 });
	await page.getByRole('button', { name: 'Record preview' }).click();
	const previewDownload = await previewDownloadPromise;
	const previewBytes = await downloadBytes(previewDownload);
	await previewDownload.saveAs(resolve(process.cwd(), '../.tmp/courtroom-studio-browser-proof/current-studio-preview.webm'));
	expect(previewDownload.suggestedFilename()).toBe('courtroom-reconstruction-preview.webm');
	expect(previewBytes.subarray(0, 4)).toEqual(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
	expect(previewBytes.byteLength).toBeGreaterThan(20_000);
	const decoded = await page.evaluate(async (base64) => {
		const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
		const url = URL.createObjectURL(new Blob([bytes], { type: 'video/webm' }));
		const video = document.createElement('video');
		video.muted = true;
		video.src = url;
		await new Promise<void>((resolve, reject) => {
			video.onloadedmetadata = () => resolve();
			video.onerror = () => reject(new Error('Recorded WebM could not be decoded.'));
		});
		let decodedFrames = 0;
		let disclosureSamples: Array<{ time: number; yellowPixels: number }> = [];
		await new Promise<void>((resolve, reject) => {
			const timeout = setTimeout(() => reject(new Error('Recorded WebM playback did not finish.')), 60_000);
			video.onended = () => { clearTimeout(timeout); resolve(); };
			const nextFrame = () => video.requestVideoFrameCallback(() => {
				decodedFrames += 1;
				if (!video.ended) nextFrame();
			});
			nextFrame();
			void video.play();
		});
		const canvas = document.createElement('canvas');
		canvas.width = video.videoWidth;
		canvas.height = video.videoHeight;
		const context = canvas.getContext('2d', { willReadFrequently: true });
		if (!context || video.videoWidth !== 1280 || video.videoHeight !== 720) {
			throw new Error('Recorded preview has no readable 1280x720 video frames.');
		}
		for (const frame of [0, 59, 60, 119, 120, 179, 180, 239]) {
			const time = frame / 30;
			const seeked = new Promise<void>((resolve, reject) => {
				const timeout = setTimeout(() => reject(new Error(`Could not seek to disclosure sample frame ${frame}.`)), 10_000);
				video.onseeked = () => { clearTimeout(timeout); resolve(); };
			});
			video.currentTime = time;
			await seeked;
			context.drawImage(video, 0, 0, canvas.width, canvas.height);
			const pixels = context.getImageData(18, 670, canvas.width - 36, 50).data;
			let yellowPixels = 0;
			for (let index = 0; index < pixels.length; index += 4) {
				if (pixels[index] > 170 && pixels[index + 1] > 115 && pixels[index + 2] < 170) yellowPixels += 1;
			}
			disclosureSamples.push({ time, yellowPixels });
		}
		URL.revokeObjectURL(url);
		return { decodedFrames, duration: video.duration, disclosureSamples };
	}, previewBytes.toString('base64'));
	expect(decoded.decodedFrames).toBe(240);
	expect(decoded.duration).toBeGreaterThan(0);
	expect(decoded.disclosureSamples).toHaveLength(8);
	for (const sample of decoded.disclosureSamples) expect(sample.yellowPixels).toBeGreaterThan(100);
	expect(pageErrors).toEqual([]);
});
