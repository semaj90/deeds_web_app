import { expect, test, type Page } from '@playwright/test';

const png = Buffer.from(
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
	'base64',
);

async function openImageRelief(page: Page, visionUnavailable = false) {
	const diagnostics = { console: [] as string[], page: [] as string[], requests: [] as string[], failed: [] as string[], responses: [] as string[] };
	let activeCaseId = '';
	let analysisFixtureHits = 0;
	let upscaleFixtureHits = 0;
	let canvasSaveFixtureHits = 0;
	await page.route(/\/api\/evidence\/[^/]+\/vlm-analyze$/, async (route) => {
		analysisFixtureHits++;
		return route.fulfill({
			status: visionUnavailable ? 503 : 200,
			contentType: 'application/json',
			body: JSON.stringify(visionUnavailable
				? { error: 'VLM not in VISION mode', hint: 'Switch to VISION' }
				: { success: true, analysis: { summary: 'Fixture-only visual proposal.' } }),
		});
	});
	await page.route(/\/api\/evidence\/[^/]+\/upscale$/, async (route) => {
		upscaleFixtureHits++;
		const payload = route.request().postDataJSON() as { scale?: number };
		const factor = payload.scale === 4 ? 4 : 2;
		return route.fulfill({
			status: 200,
			contentType: 'image/png',
			body: png,
			headers: { 'X-Upscale-Size': `${factor}x${factor}`, 'X-Upscale-Method': 'lanczos3' },
		});
	});
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

	await page.route(/\/api\/cases\/[^/]+\/canvas$/, async (route) => {
		if (route.request().method() !== 'POST') return route.continue();
		canvasSaveFixtureHits++;
		return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) });
	});
	await page.route(/\/api\/evidence\/[^/]+\/download(?:\?.*)?$/, (route) => route.fulfill({
		status: 200,
		contentType: 'image/png',
		body: png,
	}));
	await page.route(/\/api\/evidence\/[^/]+\/depth-map$/, (route) => route.fulfill({
		status: 200,
		contentType: 'image/png',
		body: png,
	}));
	let caseId = process.env.RELIEF_TEST_CASE_ID ?? '';
	if (!caseId) {
		await page.goto('/cases');
		const caseLink = page.locator('a[href^="/cases/"]').filter({ hasNot: page.locator('[href$="/new"]') }).first();
		await expect(caseLink, 'a readable case is required').toBeVisible({ timeout: 30_000 });
		caseId = ((await caseLink.getAttribute('href')) ?? '').split('/').filter(Boolean)[1];
	}
	activeCaseId = caseId;
	await page.goto(`/cases/${caseId}/board`);
	const imageBadge = page.locator('.file-type-badge').filter({ hasText: /^(png|jpe?g|webp|gif|tiff?|bmp)$/i });
	const imageCard = page.locator('.evidence-card').filter({ has: imageBadge }).first();
	await expect(imageCard, 'the selected case must contain an image exhibit').toBeVisible({ timeout: 30_000 });
	await imageCard.click();
	await page.getByRole('button', { name: '3D Relief View' }).click();
	const dialog = page.getByRole('dialog');
	await expect(dialog).toBeVisible();
	return {
		dialog,
		imageCard,
		diagnostics,
		getUpscaleFixtureHits: () => upscaleFixtureHits,
		getAnalysisFixtureHits: () => analysisFixtureHits,
		getCanvasSaveFixtureHits: () => canvasSaveFixtureHits,
	};
}

test.describe('evidence relief modal diagnostic (fixture responses; no model/storage writes)', () => {
	test.use({ serviceWorkers: 'block' });

	test('opens, places and drags temporary markers, handles analysis, and previews 2x/4x', async ({ page }, info) => {
		const { dialog, imageCard, diagnostics, getUpscaleFixtureHits, getAnalysisFixtureHits, getCanvasSaveFixtureHits } = await openImageRelief(page);
		await expect(page.getByRole('dialog')).toHaveCount(1);
		await expect(dialog.getByRole('group', { name: 'Evidence view mode' })).toBeVisible();
		await dialog.getByRole('button', { name: 'Original' }).click();
		await expect(dialog.locator('.preview-img')).toBeVisible();
		await dialog.getByRole('button', { name: '3D relief' }).click();
		await expect(dialog.locator('.e3d-stage canvas')).toBeVisible();
		await expect(dialog.locator('.e3d-stage')).toHaveAttribute('data-status', 'ready');
		const annotationToolbar = dialog.getByRole('toolbar', { name: 'Image annotation tools' });
		await expect(annotationToolbar).toBeVisible();
		expect(await annotationToolbar.evaluate((toolbar) => toolbar.nextElementSibling?.classList.contains('e3d-stage'))).toBe(true);
		await dialog.getByRole('button', { name: 'Place marker' }).click();
		const canvas = dialog.locator('.e3d-stage canvas');
		const bounds = await canvas.boundingBox();
		if (!bounds) throw new Error('Relief canvas has no visible bounds');
		const hitTarget = await page.evaluate(({ x, y }) => {
			const target = document.elementFromPoint(x, y);
			return target instanceof HTMLElement ? `${target.tagName}.${target.className}` : String(target);
		}, { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 });
		expect(hitTarget, `canvas center is covered by ${hitTarget}`).toBe('CANVAS.');
		await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
		const markerPin = dialog.getByRole('button', { name: 'Select Marker 1' });
		await expect(markerPin).toBeVisible();
		const pinMotionToggle = dialog.getByRole('button', { name: 'Animate marker pins' });
		await expect(pinMotionToggle).toHaveAttribute('aria-pressed', 'true');
		await pinMotionToggle.click();
		await expect(pinMotionToggle).toHaveAttribute('aria-pressed', 'false');
		await expect(markerPin).toHaveClass(/motion-disabled/);
		await pinMotionToggle.click();
		await expect(markerPin).not.toHaveClass(/motion-disabled/);
		await expect(dialog.getByLabel('Marker label')).toHaveValue('Marker 1');
		const initialMarkerPosition = await markerPin.getAttribute('style');
		const pinBounds = await markerPin.boundingBox();
		if (!pinBounds) throw new Error('Marker pin has no visible bounds');
		await page.mouse.move(pinBounds.x + pinBounds.width / 2, pinBounds.y + pinBounds.height / 2);
		await page.mouse.down();
		await page.mouse.move(pinBounds.x + pinBounds.width / 2 + 36, pinBounds.y + pinBounds.height / 2 + 10, { steps: 5 });
		await page.mouse.up();
		await expect.poll(() => markerPin.getAttribute('style')).not.toBe(initialMarkerPosition);
		await canvas.focus();
		await canvas.press('Enter');
		const secondMarkerPin = dialog.getByRole('button', { name: 'Select Marker 2' });
		await expect(secondMarkerPin).toBeVisible();
		await markerPin.click();
		await dialog.getByTestId('e3d-remove-marker').click();
		await expect(markerPin).toHaveCount(0);
		await expect(secondMarkerPin).toBeVisible();
		await canvas.press('m');
		await expect(dialog.getByRole('button', { name: 'Place marker', exact: true })).toHaveAttribute('aria-pressed', 'true');
		await canvas.press('o');
		await expect(dialog.getByRole('button', { name: 'Orbit', exact: true })).toHaveAttribute('aria-pressed', 'true');

		await dialog.getByTestId('e3d-analyze').click();
		await expect.poll(() => getAnalysisFixtureHits()).toBe(1);
		await expect(dialog.getByTestId('e3d-analysis')).toContainText('AI suggestion · review required · not a finding.');
		await dialog.getByTestId('e3d-upscale-2').click();
		await expect.poll(() => getUpscaleFixtureHits(), {
			message: `upscale requests: ${diagnostics.requests.filter((entry) => entry.includes('/upscale')).join('\n')}`
		}).toBe(1);
		await expect(dialog.getByTestId('e3d-upscale-info')).toContainText('2x2 (Lanczos resampling, no added detail)');
		await dialog.getByTestId('e3d-upscale-4').click();
		await expect.poll(() => getUpscaleFixtureHits()).toBe(2);
		await expect(dialog.getByTestId('e3d-upscale-info')).toBeVisible();
		await page.screenshot({ path: info.outputPath('evidence-relief-modal.png') });

		await page.setViewportSize({ width: 900, height: 700 });
		const resizedCanvas = await canvas.boundingBox();
		expect(resizedCanvas?.width).toBeGreaterThan(0);
		expect(resizedCanvas?.height).toBeGreaterThan(0);
		await dialog.locator('.modal-close').click();
		await expect(dialog).toBeHidden();
		await imageCard.click();
		await page.getByRole('button', { name: '3D Relief View' }).click();
		await expect(dialog.locator('.e3d-stage')).toHaveAttribute('data-status', 'ready');
		await expect(dialog.getByRole('toolbar', { name: 'Image annotation tools' })).toBeVisible();
		await expect(dialog.locator('.e3d-marker-count')).toContainText('0 markers');

		expect(diagnostics.page, diagnostics.page.join('\n')).toEqual([]);
		const unexpectedResponses = diagnostics.responses.filter((entry) => Number(entry.split(' ')[0]) >= 400);
		expect(unexpectedResponses, unexpectedResponses.join('\n')).toEqual([]);
		expect(diagnostics.console, diagnostics.console.join('\n')).toEqual([]);
		expect(diagnostics.requests.filter((entry) => entry.includes('POST ') && entry.includes('/vlm-analyze'))).toHaveLength(1);
		expect(diagnostics.requests.filter((entry) => entry.includes('POST ') && entry.includes('/upscale'))).toHaveLength(2);
		expect(getCanvasSaveFixtureHits()).toBeGreaterThan(0);
		const navigationAborts = diagnostics.failed.filter((entry) => entry.includes('net::ERR_ABORTED'));
		const unexpectedRequestFailures = diagnostics.failed.filter((entry) => !entry.includes('net::ERR_ABORTED'));
		expect(unexpectedRequestFailures, unexpectedRequestFailures.join('\n')).toEqual([]);
	});

	test('shows a safe message when the vision service is unavailable', async ({ page }) => {
		const { dialog, diagnostics, getAnalysisFixtureHits } = await openImageRelief(page, true);
		await dialog.getByTestId('e3d-analyze').click();
		await expect(dialog.getByTestId('e3d-error')).toContainText('Vision model is not in VISION mode');
		await expect.poll(() => getAnalysisFixtureHits()).toBe(1);
		expect(diagnostics.requests.filter((entry) => entry.includes('POST ') && entry.includes('/vlm-analyze'))).toHaveLength(1);
		expect(diagnostics.responses.filter((entry) => entry.startsWith('503 ') && entry.includes('/vlm-analyze'))).toHaveLength(1);
		expect(diagnostics.page, diagnostics.page.join('\n')).toEqual([]);
		// The 503 is the scenario under test and is already asserted above; the browser logs it as a console error.
		const unexpectedConsole = diagnostics.console.filter((entry) => !entry.includes('status of 503'));
		expect(unexpectedConsole, unexpectedConsole.join('\n')).toEqual([]);
		const unexpectedRequestFailures = diagnostics.failed.filter((entry) => !entry.includes('net::ERR_ABORTED'));
		expect(unexpectedRequestFailures, unexpectedRequestFailures.join('\n')).toEqual([]);
	});
});
