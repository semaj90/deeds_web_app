import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { expect, request as playwrightRequest, test } from '@playwright/test';

test('unmocked evidence readback and relief editing use authorized PostgreSQL/SeaweedFS data', async ({ page }) => {
	const caseId = process.env.RELIEF_LIVE_CASE_ID;
	const evidenceId = process.env.RELIEF_LIVE_EVIDENCE_ID;
	const forbiddenCaseId = process.env.RELIEF_LIVE_FORBIDDEN_CASE_ID;
	const forbiddenEvidenceId = process.env.RELIEF_LIVE_FORBIDDEN_EVIDENCE_ID;
	const pdfEvidenceId = process.env.RELIEF_LIVE_PDF_EVIDENCE_ID;
	const storageState = process.env.RELIEF_LIVE_STORAGE_STATE;
	test.skip(!caseId || !evidenceId || !forbiddenCaseId || !forbiddenEvidenceId || !pdfEvidenceId || !storageState, 'Set authorized image/PDF IDs, a forbidden case/evidence pair, and RELIEF_LIVE_STORAGE_STATE to a gitignored auth state file');

	const diagnostics = { console: [] as string[], page: [] as string[], requests: [] as string[], responses: [] as string[], failed: [] as string[] };
	page.on('console', (message) => {
		if (message.type() === 'error') diagnostics.console.push(message.text());
	});
	page.on('pageerror', (error) => diagnostics.page.push(error.message));
	page.on('request', (request) => diagnostics.requests.push(`${request.method()} ${request.url()}`));
	page.on('response', (response) => diagnostics.responses.push(`${response.status()} ${response.request().method()} ${response.url()}`));
	page.on('requestfailed', (request) => diagnostics.failed.push(`${request.method()} ${request.url()}: ${request.failure()?.errorText}`));
	const baseUrl = new URL(test.info().project.use.baseURL as string);
	const anonymousApi = await playwrightRequest.newContext({ baseURL: baseUrl.origin });
	try {
		for (const path of [
			`/api/evidence/${evidenceId}`,
			`/api/evidence/${evidenceId}/download?inline=1&caseId=${encodeURIComponent(caseId!)}`,
			`/api/evidence/${evidenceId}/depth-map`,
		]) {
			const response = await anonymousApi.get(path);
			expect(response.status(), `anonymous request should be denied: ${path}`).toBe(401);
		}
	} finally {
		await anonymousApi.dispose();
	}

	for (const path of [
		`/api/evidence/${forbiddenEvidenceId}`,
		`/api/evidence/${forbiddenEvidenceId}/download?inline=1&caseId=${encodeURIComponent(forbiddenCaseId!)}`,
		`/api/evidence/${forbiddenEvidenceId}/depth-map`,
	]) {
		const response = await page.request.get(path);
		expect(response.status(), `authorized user must not read foreign evidence: ${path}`).toBe(404);
	}
	const pdfUpscaleResponse = await page.request.post(`/api/evidence/${pdfEvidenceId}/upscale`, { data: { scale: 2 } });
	expect(pdfUpscaleResponse.status()).toBe(415);
	expect(await pdfUpscaleResponse.json()).toEqual({ error: 'Evidence is not an image' });

	await page.goto(`/cases/${caseId}/board`, { waitUntil: 'domcontentloaded' });
	const imageCard = page.locator(`.evidence-card[data-evidence-id="${evidenceId}"]`);
	await expect(imageCard, 'the live case must contain the selected image evidence').toBeVisible({ timeout: 30_000 });
	await expect(imageCard.locator('.file-type-badge')).toHaveText(/^(png|jpe?g|webp|gif|tiff?|bmp)$/i);
	const metadataResponse = await page.request.get(`/api/evidence/${evidenceId}`);
	expect(metadataResponse.status()).toBe(200);
	const evidence = await metadataResponse.json();
	expect(evidence._degraded).not.toBe(true);
	expect(evidence.id).toBe(evidenceId);
	expect(evidence.caseId).toBe(caseId);
	expect(evidence.hash).toMatch(/^(sha256:)?[a-f0-9]{64}$/i);
	const sourceResponse = await page.request.get(`/api/evidence/${evidenceId}/download?inline=1&caseId=${encodeURIComponent(caseId!)}`);
	expect(sourceResponse.status()).toBe(200);
	const sourceBytes = await sourceResponse.body();
	const sourceSha256 = createHash('sha256').update(sourceBytes).digest('hex');
	expect(sourceSha256).toBe(evidence.hash.replace(/^sha256:/i, '').toLowerCase());
	const sourceImageMetadata = await sharp(sourceBytes).metadata();
	expect(['jpeg', 'png', 'webp', 'gif', 'tiff', 'bmp']).toContain(sourceImageMetadata.format);
	expect(sourceImageMetadata.width).toBeGreaterThan(0);
	expect(sourceImageMetadata.height).toBeGreaterThan(0);
	const depthResponse = await page.request.get(`/api/evidence/${evidenceId}/depth-map`);
	let expectedDepthSource: 'stored' | 'preview';
	if (depthResponse.status() === 200) {
		expectedDepthSource = 'stored';
		expect(depthResponse.headers()['x-depth-verification']).toBe('sha256-verified');
		expect(depthResponse.headers()['content-type']).toContain('image/png');
		const depthBytes = await depthResponse.body();
		const depth = evidence.aiAnalysis?.depthAnalysis;
		expect(depth?.sourceRevision).toBe(`sha256:${sourceSha256}`);
		expect(createHash('sha256').update(depthBytes).digest('hex')).toBe(depth?.depthSha256);
		const depthImageMetadata = await sharp(depthBytes).metadata();
		expect(depthImageMetadata.format).toBe('png');
		expect(depthImageMetadata.width).toBe(depth?.width);
		expect(depthImageMetadata.height).toBe(depth?.height);
		expect(depthImageMetadata.width).toBe(sourceImageMetadata.width);
		expect(depthImageMetadata.height).toBe(sourceImageMetadata.height);
	} else {
		expectedDepthSource = 'preview';
		expect(depthResponse.status()).toBe(404);
		expect(await depthResponse.json()).toHaveProperty('error', 'No source-revision-bound depth map is available');
	}
	await imageCard.click();
	await page.getByRole('button', { name: '3D Relief View' }).click();

	const dialog = page.getByRole('dialog');
	await expect(dialog).toBeVisible();
	await dialog.getByRole('button', { name: 'Original' }).click();
	const sourceImage = dialog.locator('.preview-img');
	await expect(sourceImage).toBeVisible();
	const sourceSize = await sourceImage.evaluate((image) => ({
		width: (image as HTMLImageElement).naturalWidth,
		height: (image as HTMLImageElement).naturalHeight,
	}));
	expect(sourceSize.width).toBeGreaterThan(0);
	expect(sourceSize.height).toBeGreaterThan(0);
	await dialog.getByRole('button', { name: '3D relief' }).click();
	await expect(dialog.locator('.e3d-stage canvas')).toBeVisible({ timeout: 30_000 });
	await expect(dialog.locator('.e3d-stage')).toHaveAttribute('data-status', 'ready', { timeout: 30_000 });
	const viewer = dialog.locator('[data-testid="depth-relief"]');
	await expect(viewer).toHaveAttribute('data-backend', /^(WebGPU|WebGL2)$/);
	const renderer = await viewer.getAttribute('data-backend');
	const initialLod = await viewer.getAttribute('data-lod');
	console.info(`[live-relief] renderer=${renderer} tier=${await viewer.getAttribute('data-tier')} lod=${initialLod}`);
	await expect(dialog.locator('.e3d-sub')).toContainText(expectedDepthSource === 'stored' ? 'stored monocular depth estimate bound to this source file' : 'Preview only: depth is guessed from image brightness');
	const depthLabel = dialog.locator('.e3d-sub');
	await expect(depthLabel).toBeVisible();
	const depthDescription = await depthLabel.innerText();
	expect(depthDescription).toMatch(/stored monocular depth estimate bound to this source file|Preview only: depth is guessed from image brightness|Depth unavailable; the image is shown flat/i);
	const toolbar = dialog.getByRole('toolbar', { name: 'Image annotation tools' });
	await expect(toolbar).toBeVisible();
	expect(await toolbar.evaluate((element) => element.nextElementSibling?.classList.contains('e3d-stage'))).toBe(true);

	const canvas = dialog.locator('.e3d-stage canvas');
	const bounds = await canvas.boundingBox();
	if (!bounds) throw new Error('Live relief canvas has no visible bounds');
	await dialog.getByRole('button', { name: 'Place marker' }).click();
	await page.mouse.click(bounds.x + bounds.width * 0.46, bounds.y + bounds.height * 0.48);
	await expect(dialog.getByRole('button', { name: 'Select Marker 1' })).toBeVisible();
	await expect(dialog.locator('.e3d-marker-count')).toContainText('1 marker');
	const markerPin = dialog.getByRole('button', { name: 'Select Marker 1' });
	const originalPinStyle = await markerPin.getAttribute('style');
	const markerBounds = await markerPin.boundingBox();
	if (!markerBounds) throw new Error('Placed marker has no visible bounds');
	await page.mouse.move(markerBounds.x + markerBounds.width / 2, markerBounds.y + markerBounds.height / 2);
	await page.mouse.down();
	await page.mouse.move(markerBounds.x + markerBounds.width / 2 + 28, markerBounds.y + markerBounds.height / 2 + 8, { steps: 4 });
	await page.mouse.up();
	await expect.poll(() => markerPin.getAttribute('style')).not.toBe(originalPinStyle);
	await dialog.getByRole('button', { name: 'Orbit' }).click();
	await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
	await page.mouse.wheel(0, -900);
	await expect.poll(() => viewer.getAttribute('data-lod'), { timeout: 10_000 }).not.toBe(initialLod);
	await expect(markerPin).toBeVisible();
	const reliefStrength = dialog.locator('.e3d-foot input[type="range"]');
	await reliefStrength.evaluate((element) => {
		const input = element as HTMLInputElement;
		input.value = '0.62';
		input.dispatchEvent(new Event('input', { bubbles: true }));
	});
	await expect(markerPin).toBeVisible();
	const livePinBounds = await markerPin.boundingBox();
	if (!livePinBounds) throw new Error('Marker was lost after relief/LOD changes');
	const stageBounds = await dialog.locator('.e3d-stage').boundingBox();
	if (!stageBounds) throw new Error('Relief stage has no bounds');
	expect(livePinBounds.x + livePinBounds.width / 2).toBeGreaterThanOrEqual(stageBounds.x);
	expect(livePinBounds.x + livePinBounds.width / 2).toBeLessThanOrEqual(stageBounds.x + stageBounds.width);

	const upscale2 = page.waitForResponse((response) => response.request().method() === 'POST' && /\/api\/evidence\/[^/]+\/upscale$/.test(response.url()));
	await dialog.getByTestId('e3d-upscale-2').click();
	const upscale2Response = await upscale2;
	expect(upscale2Response.status()).toBe(200);
	const upscale2Size = upscale2Response.headers()['x-upscale-size'].match(/^(\d+)x(\d+)$/);
	expect(upscale2Size).not.toBeNull();
	expect(Number(upscale2Size?.[1])).toBe(sourceSize.width * 2);
	expect(Number(upscale2Size?.[2])).toBe(sourceSize.height * 2);
	await expect(dialog.getByTestId('e3d-upscale-info')).toContainText(upscale2Response.headers()['x-upscale-size']);
	const upscale4 = page.waitForResponse((response) => response.request().method() === 'POST' && /\/api\/evidence\/[^/]+\/upscale$/.test(response.url()));
	await dialog.getByTestId('e3d-upscale-4').click();
	const upscale4Response = await upscale4;
	expect(upscale4Response.status()).toBe(200);
	const upscale4Size = upscale4Response.headers()['x-upscale-size'].match(/^(\d+)x(\d+)$/);
	expect(upscale4Size).not.toBeNull();
	expect(Number(upscale4Size?.[1])).toBe(sourceSize.width * 4);
	expect(Number(upscale4Size?.[2])).toBe(sourceSize.height * 4);
	await expect(dialog.getByTestId('e3d-upscale-info')).toContainText(upscale4Response.headers()['x-upscale-size']);

	const canvasScreenshotPath = test.info().outputPath('evidence-relief-live-canvas.png');
	await canvas.screenshot({ path: canvasScreenshotPath });
	const canvasImageStats = await sharp(canvasScreenshotPath).stats();
	expect(canvasImageStats.channels.slice(0, 3).some((channel) => channel.stdev > 3), 'rendered canvas should contain visible image detail').toBe(true);
	const initialCanvasBounds = await canvas.boundingBox();
	expect(initialCanvasBounds?.width).toBeGreaterThan(0);
	await page.setViewportSize({ width: 1024, height: 768 });
	const resized = await canvas.boundingBox();
	expect(resized?.width).toBeGreaterThan(0);
	expect(resized?.width).toBeLessThan(initialCanvasBounds!.width);
	await expect(dialog.getByRole('button', { name: 'Select Marker 1' })).toBeVisible();
	await dialog.getByRole('button', { name: 'Close' }).click();
	await expect(dialog).toBeHidden();
	await imageCard.click();
	await page.getByRole('button', { name: '3D Relief View' }).click();
	await expect(dialog.locator('.e3d-stage')).toHaveAttribute('data-status', 'ready', { timeout: 30_000 });
	await expect(dialog.locator('.e3d-marker-count')).toContainText('0 markers');

	expect(diagnostics.page, diagnostics.page.join('\n')).toEqual([]);
	expect(diagnostics.console, diagnostics.console.join('\n')).toEqual([]);
	expect(diagnostics.failed.filter((entry) => !entry.includes('net::ERR_ABORTED'))).toEqual([]);
	expect(diagnostics.requests.filter((entry) => entry.includes('/api/evidence/') && entry.includes('/upscale'))).toHaveLength(2);
	expect(diagnostics.requests.filter((entry) => entry.includes('/api/evidence/') && entry.includes('/vlm-analyze'))).toHaveLength(0);
	const depthResponses = diagnostics.responses.filter((entry) => entry.includes('/depth-map'));
	expect(depthResponses.length).toBeGreaterThan(0);
	for (const response of depthResponses) {
		expect(response).toMatch(/^(200|404) GET .*\/depth-map/);
	}
	expect(diagnostics.responses.filter((entry) => entry.startsWith('5') && !entry.includes('/depth-map'))).toEqual([]);
	await page.screenshot({ path: test.info().outputPath('evidence-relief-live-full.png'), fullPage: true });
});
