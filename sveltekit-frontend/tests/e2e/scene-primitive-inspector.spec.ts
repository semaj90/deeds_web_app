import { expect, test } from '@playwright/test';

test('Detective Mode local marker placement updates the scene inspector without case writes', async ({ page }, testInfo) => {
	const pageErrors: string[] = [];
	const nonReadRequests: string[] = [];
	page.on('pageerror', (error) => pageErrors.push(error.message));
	page.on('request', (request) => {
		if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) {
			nonReadRequests.push(`${request.method()} ${request.url()}`);
		}
	});
	await page.route('**/api/analytics/events', (route) => route.fulfill({ status: 204, body: '' }));
	await page.route('**/api/errors/client-report', (route) => route.fulfill({ status: 204, body: '' }));

	await page.goto('/demos/detective-mode');
	await page.getByRole('button', { name: '3D LiDAR', exact: true }).click();
	await page.getByRole('button', { name: /3D CRIME SCENE/ }).click();
	const canvas = page.locator('canvas.three-crime-canvas');
	await expect(canvas).toBeVisible({ timeout: 30_000 });
	const markerTool = page.getByTitle('Place Evidence Marker Tent (Click Ground)');
	await markerTool.click({ noWaitAfter: true });
	const bounds = await canvas.boundingBox();
	if (!bounds) throw new Error('Detective Mode 3D canvas has no rendered bounds.');
	await page.mouse.click(bounds.x + bounds.width * 0.65, bounds.y + bounds.height * 0.7);

	const inspector = page.getByTestId('scene-primitive-inspector');
	await expect(inspector).toBeVisible();
	await expect(inspector).toContainText('MARKER_04');
	await expect(inspector).toContainText('DEMONSTRATIVE · UNCALIBRATED');
	await expect(inspector).toContainText('Evidence Tent #4');
	const positionRow = inspector.locator('.tc-row').filter({ hasText: 'Position' });
	// Clear the selected-object inspector, then prove the viewer can raycast-pick
	// the existing marker rather than only selecting newly placed markers.
	await page.getByTitle('Show E-002 Crime Scene Evidence').click();
	await expect(page.getByTestId('scene-primitive-inspector')).toHaveCount(0);
	await page.getByTitle('Translate (Move)').click();
	const startX = bounds.x + bounds.width * 0.65;
	const startY = bounds.y + bounds.height * 0.7;
	await page.mouse.click(startX, startY);
	await expect(inspector).toContainText('MARKER_04');
	await expect(canvas).toHaveAttribute('data-pick-backend', 'bvh');
	const positionBeforeDrag = await positionRow.innerText();
	await page.mouse.move(startX, startY);
	await page.mouse.down();
	await page.mouse.move(startX + 28, startY, { steps: 4 });
	await page.mouse.up();
	await expect.poll(() => positionRow.innerText()).not.toBe(positionBeforeDrag);
	await testInfo.attach('detective-mode-marker-inspector.png', { body: await page.screenshot(), contentType: 'image/png' });

	expect(nonReadRequests.filter((request) => !request.includes('/api/analytics/events') && !request.includes('/api/errors/client-report'))).toEqual([]);
	expect(pageErrors, pageErrors.join('\n')).toEqual([]);
});
