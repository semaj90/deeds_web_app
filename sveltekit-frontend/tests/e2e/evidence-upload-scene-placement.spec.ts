import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';

const caseId = process.env.SCENE_PLACEMENT_TEST_CASE_ID;
const evidenceId = process.env.SCENE_PLACEMENT_TEST_EVIDENCE_ID;

test.use({ serviceWorkers: 'block', viewport: { width: 1680, height: 1050 } });
test.skip(!caseId || !evidenceId, 'Set the case and exhibit IDs for an authorized test fixture');

test('an accepted upload keeps its exhibit link and reaches explicit scene placement', async ({ page }, testInfo) => {
	const boardPath = `/cases/${caseId}/board`;
	const markerPath = `/api/cases/${caseId}/scenes/main-scene/markers`;
	const pageErrors: string[] = [];
	const shaderErrors: string[] = [];
	page.on('pageerror', (error) => pageErrors.push(error.message));
	page.on('console', (message) => {
		if (message.type() === 'error' && /THREE\.WebGLProgram|shader error/i.test(message.text())) {
			shaderErrors.push(message.text());
		}
	});
	await page.route('**/*', (route) =>
		['GET', 'HEAD', 'OPTIONS'].includes(route.request().method())
			? route.fallback()
			: route.fulfill({ status: 204 })
	);

	const firstJob = randomUUID();
	const secondJob = randomUUID();
	const firstExhibit = randomUUID();
	let uploads = 0;
	await page.route('**/api/evidence/upload', (route) => {
		uploads++;
		const first = uploads === 1;
		return route.fulfill({
			status: 201,
			json: { id: first ? firstExhibit : evidenceId, jobId: first ? firstJob : secondJob }
		});
	});

	const sendProgress = (jobId: string, exhibitId: string, status: 'completed' | 'running', progress: number) =>
		`id: 1\nevent: analysis-progress\ndata: ${JSON.stringify({
			eventId: randomUUID(), caseId, evidenceId: exhibitId, jobId,
			stage: status === 'completed' ? 'complete' : 'transcribing',
			status, progress, sourceRevision: `sha256:${'a'.repeat(64)}`
		})}\n\n`;
	await page.route(`**/jobs/${firstJob}/events`, (route) => route.fulfill({
		contentType: 'text/event-stream',
		body: sendProgress(firstJob, firstExhibit, 'completed', 100)
	}));
	const releaseSecondEvent = Promise.withResolvers<void>();
	await page.route(`**/jobs/${secondJob}/events`, async (route) => {
		await releaseSecondEvent.promise;
		return route.fulfill({
			contentType: 'text/event-stream',
			body: sendProgress(secondJob, evidenceId!, 'running', 72)
		});
	});

	await page.goto(`/cases/${caseId}/evidence/upload`);
	const file = { name: 'fixture.png', mimeType: 'image/png', buffer: Buffer.from('upload response fixture') };
	const picker = page.getByLabel('Browse Files');
	await expect(picker).toBeEnabled();
	await picker.setInputFiles([file, file]);
	const links = page.getByRole('link', { name: 'Place in scene: fixture.png' });
	await expect(links).toHaveCount(2);
	await page.getByRole('button', { name: 'Clear Completed' }).click();
	releaseSecondEvent.resolve();
	await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '72');
	await expect(links).toHaveAttribute('href', `${boardPath}?view=detective&evidenceId=${evidenceId}`);
	await links.click();
	await expect(page).toHaveURL(new RegExp(`view=detective&evidenceId=${evidenceId}`));
	await page.locator('.modal-close[aria-label="Close"]').click();

	const placement = page.getByRole('region', { name: 'Place evidence marker' });
	await expect(placement.getByLabel('Exhibit')).toHaveValue(evidenceId!);
	const save = placement.getByRole('button', { name: 'Save marker' });
	await expect(save).toBeDisabled();
	const canvas = page.locator('canvas.three-crime-canvas');
	await expect(canvas).toBeVisible();
	const handle = placement.getByRole('button', { name: 'Choose position on floor' });
	const bounds = await canvas.boundingBox();
	if (!bounds) throw new Error('Scene canvas has no layout bounds');
	await handle.dragTo(canvas, { targetPosition: { x: bounds.width * 0.65, y: bounds.height * 0.7 } });
	await expect(placement.getByRole('status')).toContainText('Position selected');
	await testInfo.attach('case-marker-placement.png', { body: await page.screenshot(), contentType: 'image/png' });

	let writes = 0;
	await page.route(`**${markerPath}`, async (route) => {
		const { evidenceId: linkedId, markerId, position } = route.request().postDataJSON();
		expect(route.request().method()).toBe('POST');
		expect(linkedId).toBe(evidenceId);
		expect(Object.values(position).every(Number.isFinite)).toBe(true);
		writes++;
		return route.fulfill({ status: 201, json: { data: { markerId, revision: 1, position } } });
	});
	await save.click();
	await expect(placement.getByRole('status')).toContainText('Marker saved');
	expect(writes).toBe(1);
	const exhibitTitle = await placement.getByLabel('Exhibit').locator('option:checked').textContent();
	await placement.getByRole('button', { name: 'Ask assistant' }).click();
	const assistant = page.getByRole('complementary', { name: 'AI assistant' });
	await expect(assistant.getByText(/Exhibit context/)).toContainText(exhibitTitle!.trim());
	await assistant.getByRole('button', { name: 'Close assistant' }).click();
	const inspectorToggle = page.getByRole('button', { name: 'Inspector', exact: true });
	const initialCanvas = await canvas.boundingBox();
	await inspectorToggle.click();
	await expect(placement).toHaveCount(0);
	await expect.poll(async () => (await canvas.boundingBox())?.width ?? 0).toBeGreaterThan(initialCanvas!.width);
	await page.getByText('Layers', { exact: true }).click();
	const indexedFloor = page.getByRole('checkbox', { name: 'Indexed floor texture' });
	await indexedFloor.press('Space');
	await expect(indexedFloor).toBeChecked();
	await page.getByText('Layers', { exact: true }).click();
	await testInfo.attach('detective-dossier-indexed-floor.png', { body: await page.screenshot(), contentType: 'image/png' });
	expect(shaderErrors).toEqual([]);

	// A forged exhibit URL cannot select an exhibit or enable the case assistant.
	await page.setViewportSize({ width: 820, height: 980 });
	await page.goto(`${boardPath}?view=detective&evidenceId=${firstExhibit}`);
	await expect(placement.getByLabel('Exhibit')).toHaveValue('');
	await expect(placement.getByRole('button', { name: 'Ask assistant' })).toHaveCount(0);
	await expect(canvas).toBeVisible();
	expect((await canvas.boundingBox())!.width).toBeGreaterThan(600);
	expect(pageErrors).toEqual([]);
});
