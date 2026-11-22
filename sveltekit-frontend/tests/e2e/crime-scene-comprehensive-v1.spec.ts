import { expect, test } from '@playwright/test';

const DEMO_URL = '/demos/curfew-beach-scene?v2=1';

test.describe('Parent Atlas Comprehensive Crime Scene Reconstruction E2E (v1)', () => {
	test('renders WebGL2 scene with zero runtime errors, switches camera presets, and scrubs source time deterministically', async ({
		page
	}) => {
		const pageErrors: string[] = [];
		page.on('pageerror', (err) => pageErrors.push(err.message));

		await page.goto(DEMO_URL);
		const canvas = page.getByLabel('Illustrative 3D scene preview');
		await expect(canvas).toBeVisible();
		await expect(page.getByText(/Illustrative preview ·/)).toBeVisible({ timeout: 15_000 });

		// Switch camera presets
		await page.getByRole('button', { name: 'Top down' }).click();
		await page.getByRole('button', { name: 'Isometric' }).click();
		await page.getByRole('button', { name: 'Perspective' }).click();

		// Toggle Follow camera cues
		const follow = page.getByLabel('Follow camera cues');
		await expect(follow).not.toBeChecked();
		await follow.check();
		await expect(follow).toBeChecked();

		// Random-access deterministic scrub: 0 -> 3500 -> 1500 -> 3500
		const slider = page.getByLabel('Source time in milliseconds');
		for (const ms of [3500, 1500, 3500]) {
			await slider.evaluate((el: HTMLInputElement, val: number) => {
				el.value = String(val);
				el.dispatchEvent(new Event('input', { bubbles: true }));
				el.dispatchEvent(new Event('change', { bubbles: true }));
			}, ms);
			await expect(page.getByText(`Source time · ${ms} ms`)).toBeVisible();
		}

		expect(pageErrors).toEqual([]);
	});

	test('verifies Character LOD & Material/UV Inspector and preview JSON export', async ({
		page
	}) => {
		const pageErrors: string[] = [];
		page.on('pageerror', (err) => pageErrors.push(err.message));

		await page.goto(DEMO_URL);
		await expect(page.getByText(/Illustrative preview ·/)).toBeVisible({ timeout: 15_000 });

		const inspector = page.getByTestId('pa-v2-material-inspector');
		await expect(inspector).toBeVisible();
		await expect(inspector).toContainText('Loaded retro GLB (368 tris)', { timeout: 15_000 });

		// Switch LOD to Balanced and back to Retro
		const lodSelect = page.getByLabel('Actor geometry quality tier');
		await lodSelect.selectOption('balanced');
		await expect(inspector).toContainText('Loaded balanced GLB (768 tris)', { timeout: 15_000 });
		await lodSelect.selectOption('retro');
		await expect(inspector).toContainText('Loaded retro GLB (368 tris)', { timeout: 15_000 });

		// ENG-04 soft deformation brush (PADF) & CASE-SCENE-E2E-13 GOAP what-if (SIMULATION_HYPOTHESIS)
		await page.getByTestId('eng04-brush-preview-btn').click();
		await expect(page.getByTestId('eng04-brush-receipt')).toContainText(/PADF \d+ verts/);
		await page.getByTestId('goap-whatif-preview-btn').click();
		await expect(page.getByTestId('goap-whatif-receipt')).toContainText('SIMULATION_HYPOTHESIS · PLANNED · cost 2 · [open_door -> verify_sightline]');

		// Export preview report JSON download
		const downloadPromise = page.waitForEvent('download');
		await page.getByRole('button', { name: 'Export preview report (JSON)' }).click();
		const download = await downloadPromise;
		expect(download.suggestedFilename()).toMatch(/\.json$/i);

		expect(pageErrors).toEqual([]);
	});

	test('timeline seek drives the canvas source time without page errors', async ({ page }) => {
		const pageErrors: string[] = [];
		page.on('pageerror', (err) => pageErrors.push(err.message));

		await page.goto(DEMO_URL);
		await expect(page.getByText(/Illustrative preview ·/)).toBeVisible({ timeout: 15_000 });

		// The dual-clock timeline seeks in seconds; the canvas must reflect the same time in milliseconds.
		const timeline = page.getByLabel('Scrub timeline seconds');
		await expect(timeline).toBeVisible();
		await timeline.evaluate((el: HTMLInputElement) => {
			el.value = '2';
			el.dispatchEvent(new Event('input', { bubbles: true }));
			el.dispatchEvent(new Event('change', { bubbles: true }));
		});
		await expect(page.getByText('Source time · 2000 ms')).toBeVisible();

		expect(pageErrors).toEqual([]);
	});
});
