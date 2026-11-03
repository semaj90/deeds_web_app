import { expect, test, type Page } from '@playwright/test';

const png = Buffer.from(
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=',
	'base64',
);

async function openImageRelief(page: Page, visionUnavailable = false) {
	const diagnostics = { console: [] as string[], page: [] as string[], requests: [] as string[], failed: [] as string[], responses: [] as string[] };
	let upscaleFixtureHits = 0;
	let activeCaseId = '';
	page.on('console', (message) => {
		if (message.type() === 'error') diagnostics.console.push(message.text());
	});
	page.on('pageerror', (error) => diagnostics.page.push(error.message));
	page.on('request', (request) => diagnostics.requests.push(`${request.method()} ${request.url()}`));
	page.on('requestfailed', (request) => diagnostics.failed.push(`${request.method()} ${request.url()}: ${request.failure()?.errorText}`));
	page.on('response', (response) => diagnostics.responses.push(`${response.status()} ${response.request().method()} ${response.url()}`));
	await page.route(/\/api\/evidence\/[^/]+$/, (route) => {
		if (route.request().method() !== 'GET') return route.continue();
		const evidenceId = new URL(route.request().url()).pathname.split('/').at(-1);
		return route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify({
				id: evidenceId,
				caseId: activeCaseId,
				title: 'Fixture image evidence',
				fileName: 'fixture.png',
				fileType: 'image/png',
				mimeType: 'image/png',
				hash: `sha256:${'a'.repeat(64)}`,
				aiAnalysis: { depthAnalysis: { sourceRevision: `sha256:${'a'.repeat(64)}`, depthMapUrl: 'seaweed://fixture/evidence/sample-depth.png' } },
			}),
		});
	});

	await page.route(/\/api\/evidence\/[^/]+\/download(?:\?|$)/, (route) => route.fulfill({
		status: 200,
		contentType: 'image/png',
		body: png,
	}));
	await page.route(/\/api\/evidence\/[^/]+\/depth-map$/, (route) => route.fulfill({
		status: 200,
		contentType: 'image/png',
		body: png,
	}));
	await page.route(/\/api\/evidence\/[^/]+\/vlm-analyze$/, (route) => route.fulfill(visionUnavailable
		? {
			status: 503,
			contentType: 'application/json',
			body: JSON.stringify({ error: 'VLM not in VISION mode', hint: 'Switch to VISION' }),
		}
		: {
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify({ success: true, analysis: { summary: 'Fixture-only visual proposal.' } }),
		}));
	await page.route(/\/api\/evidence\/[^/]+\/upscale(?:\?.*)?$/, (route) => {
		upscaleFixtureHits++;
		return route.fulfill({
			status: 200,
			contentType: 'image/png',
			headers: { 'X-Upscale-Size': '2x2', 'X-Upscale-Method': 'lanczos3' },
			body: png,
		});
	});

	await page.goto('/cases');
	const caseLink = page.locator('a[href^="/cases/"]').filter({ hasNot: page.locator('[href$="/new"]') }).first();
	await expect(caseLink, 'a readable case is required').toBeVisible({ timeout: 30_000 });
	const caseId = ((await caseLink.getAttribute('href')) ?? '').split('/').filter(Boolean)[1];
	activeCaseId = caseId;
	await page.goto(`/cases/${caseId}/board`);
	const imageBadge = page.locator('.file-type-badge').filter({ hasText: /^(png|jpe?g|webp|gif|tiff?|bmp)$/i });
	const imageCard = page.locator('.evidence-card').filter({ has: imageBadge }).first();
	await expect(imageCard, 'the selected case must contain an image exhibit').toBeVisible({ timeout: 30_000 });
	await imageCard.click();
	await page.getByRole('button', { name: '3D Relief View' }).click();
	const dialog = page.getByRole('dialog');
	await expect(dialog).toBeVisible();
	return { dialog, diagnostics, getUpscaleFixtureHits: () => upscaleFixtureHits };
}

test.describe('evidence relief modal diagnostic (fixture responses; no model/storage writes)', () => {
	test('opens, places a temporary marker, analyzes, and previews 2x/4x', async ({ page }, info) => {
		const { dialog, diagnostics, getUpscaleFixtureHits } = await openImageRelief(page);
		await expect(page.getByRole('dialog')).toHaveCount(1);
		await expect(dialog.getByRole('group', { name: 'Evidence view mode' })).toBeVisible();
		await dialog.getByRole('button', { name: 'Original' }).click();
		await expect(dialog.locator('.preview-img')).toBeVisible();
		await dialog.getByRole('button', { name: '3D relief' }).click();
		await expect(dialog.locator('.e3d-stage canvas')).toBeVisible();
		await expect(dialog.locator('.e3d-stage')).toHaveAttribute('data-status', 'ready');
		await expect(dialog.getByRole('toolbar', { name: 'Image annotation tools' })).toBeVisible();
		await dialog.getByRole('button', { name: 'Place marker' }).click();
		const stage = dialog.locator('.e3d-stage');
		const bounds = await stage.boundingBox();
		if (!bounds) throw new Error('Relief stage has no visible bounds');
		await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
		const markerPin = dialog.getByRole('button', { name: 'Select Marker 1' });
		await expect(markerPin).toBeVisible();
		await expect(dialog.getByLabel('Marker label')).toHaveValue('Marker 1');
		const initialMarkerPosition = await markerPin.getAttribute('style');
		const pinBounds = await markerPin.boundingBox();
		if (!pinBounds) throw new Error('Marker pin has no visible bounds');
		await page.mouse.move(pinBounds.x + pinBounds.width / 2, pinBounds.y + pinBounds.height / 2);
		await page.mouse.down();
		await page.mouse.move(pinBounds.x + pinBounds.width / 2 + 36, pinBounds.y + pinBounds.height / 2 + 10, { steps: 5 });
		await page.mouse.up();
		await expect.poll(() => markerPin.getAttribute('style')).not.toBe(initialMarkerPosition);

		await dialog.getByTestId('e3d-analyze').click();
		await expect(dialog.getByTestId('e3d-analysis')).toContainText('AI suggestion · review required · not a finding.');
		await dialog.getByTestId('e3d-upscale-2').click();
		await expect.poll(() => getUpscaleFixtureHits(), {
			message: `upscale requests: ${diagnostics.requests.filter((entry) => entry.includes('/upscale')).join('\n')}`
		}).toBe(1);
		await expect(dialog.getByTestId('e3d-upscale-info')).toContainText('2x2 (Lanczos resampling, no added detail)');
		await dialog.getByTestId('e3d-upscale-4').click();
		await expect(dialog.getByTestId('e3d-upscale-info')).toBeVisible();
		await page.screenshot({ path: info.outputPath('evidence-relief-modal.png') });

		expect(diagnostics.page, diagnostics.page.join('\n')).toEqual([]);
		expect(diagnostics.console, diagnostics.console.join('\n')).toEqual([]);
		const navigationAborts = diagnostics.failed.filter((entry) => entry.includes('net::ERR_ABORTED'));
		const unexpectedRequestFailures = diagnostics.failed.filter((entry) => !entry.includes('net::ERR_ABORTED'));
		expect(unexpectedRequestFailures, unexpectedRequestFailures.join('\n')).toEqual([]);
		expect(diagnostics.requests.some((entry) => entry.includes('POST') && entry.includes('/vlm-analyze'))).toBe(true);
		expect(diagnostics.requests.some((entry) => entry.includes('POST') && entry.includes('/upscale'))).toBe(true);
		expect(diagnostics.responses.some((entry) => entry.includes('POST') && entry.includes('/vlm-analyze'))).toBe(true);
		expect(diagnostics.responses.some((entry) => entry.includes('POST') && entry.includes('/upscale'))).toBe(true);
	});

	test('shows a safe message when the vision service is unavailable', async ({ page }) => {
		const { dialog } = await openImageRelief(page, true);
		await dialog.getByTestId('e3d-analyze').click();
		await expect(dialog.getByTestId('e3d-error')).toContainText('Vision model is not in VISION mode');
	});
});
