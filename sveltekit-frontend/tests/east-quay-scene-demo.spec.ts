import { test, expect, request } from '@playwright/test';

test.describe('East Quay synthetic scene demo', () => {
	test('loads the typed case scene, GLB, portrait fallback and evidence synopsis', async ({ page }) => {
		const glb = page.waitForResponse((response) => response.url().includes('detective-lowpoly-sample.glb'));
		await page.goto('/demos/scene-intent-2d');
		await expect(page.getByTestId('east-quay-scene-index')).toContainText('8 scenes');
		await expect(page.getByTestId('east-quay-event-inspector')).toBeVisible();
		await expect(page.getByTestId('east-quay-evidence-synopsis')).toContainText('Evidence synopsis');
		await expect(page.getByTestId('east-quay-render-status')).toHaveText('GLB rendered in read-only synthetic scene.', { timeout: 20_000 });
		const glbResponse = await glb;
		expect(glbResponse.ok()).toBeTruthy();
		await expect(page.getByTestId('east-quay-portrait-fallback')).toContainText('derived head anchor', { timeout: 20_000 });
	});

	test('event selection updates the rendered actor/event binding', async ({ page }) => {
		await page.goto('/demos/scene-intent-2d');
		const eventSelect = page.getByTestId('east-quay-event-select');
		await expect(eventSelect.locator('option')).toHaveCount(2);
		await eventSelect.selectOption('EV-006');
		await expect(page.getByTestId('east-quay-event-inspector')).toContainText(/EV-006|alarm|exit/i);
		await expect(page.getByTestId('east-quay-three-preview')).toHaveAttribute('data-event-id', 'EV-006', { timeout: 20_000 });
	});

	test('fixture and unauthorized cross-case asset writes are rejected', async () => {
		const client = await request.newContext();
		try {
			const fixtureWrite = await client.post('/api/cases/PA-DEMO-ROBBERY-001/scenes/SC-01/assets', { data: new Uint8Array([1, 2, 3]), headers: { 'content-type': 'model/gltf-binary' } });
			expect(fixtureWrite.status()).toBe(400);
			const crossCaseWrite = await client.post('/api/cases/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/scenes/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/assets', { data: new Uint8Array([1, 2, 3]), headers: { 'content-type': 'model/gltf-binary' } });
			expect([401, 404]).toContain(crossCaseWrite.status());
		} finally {
			await client.dispose();
		}
	});
});
