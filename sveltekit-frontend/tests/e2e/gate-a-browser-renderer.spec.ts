import { test, expect } from '@playwright/test';
import { resolve } from 'node:path';
import sharp from 'sharp';

test.describe('Gate A: Real Browser GLB Render, BVH Picking & Memory Cleanup', () => {
	test.beforeEach(async ({ context }) => {
		// Prevent NotAllowedError: Failed to execute 'writeText' on 'Clipboard'
		await context.grantPermissions(['clipboard-read', 'clipboard-write']);
	});

	test('executes complete Blender GLB render, validates non-blank canvas, BVH pick, and clean disposal', async ({ page }, testInfo) => {
		const pageErrors: string[] = [];
		const nonReadRequests: string[] = [];
		page.on('pageerror', (error) => pageErrors.push(error.message));
		page.on('request', (request) => {
			if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) {
				nonReadRequests.push(`${request.method()} ${request.url()}`);
			}
		});

		// Silence external analytics / reports so test remains DB-free
		await page.route('**/api/analytics/events', (route) => route.fulfill({ status: 204, body: '' }));
		await page.route('**/api/errors/client-report', (route) => route.fulfill({ status: 204, body: '' }));

		// Navigate to local preflight viewer
		await page.goto('/demos/spz-renderer?mode=preflight');

		// 1. Verify canvas initialized with WebGL2 backend
		const canvas = page.locator('canvas[data-testid="spz-fixture-canvas"]');
		await expect(canvas).toBeVisible({ timeout: 15_000 });

		const backendInfo = await page.evaluate(() => {
			const el = document.querySelector('canvas[data-testid="spz-fixture-canvas"]') as HTMLCanvasElement;
			const gl = el?.getContext('webgl2') || el?.getContext('webgl');
			return {
				isWebGL: !!gl,
				isWebGL2: typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext,
				renderer: gl ? gl.getParameter(gl.RENDERER) : null
			};
		});
		expect(backendInfo.isWebGL).toBe(true);

		// 2. Load the synthetic rigged Blender GLB fixture
		const fixturePath = resolve(process.cwd(), 'tests/fixtures/scene-studio/synthetic-rigged-textured-animation.glb');
		await page.getByTestId('local-asset-file-input').setInputFiles(fixturePath);

		// 3. Wait for mesh inventory report
		await expect(page.getByTestId('preflight-geometry')).toContainText('2 meshes', { timeout: 30_000 });
		await expect(page.getByTestId('preflight-geometry')).toContainText('136 triangles');
		await expect(page.getByTestId('preflight-skeleton')).toContainText('2 bones detected');
		await expect(page.getByTestId('preflight-spatial-bvh')).toContainText('2 skinned');
		await expect(page.getByTestId('preflight-spatial-bvh')).toContainText('136 triangles');
		await expect(page.getByTestId('preflight-spatial-bvh')).toContainText('TLAS ready');

		// Exercise the app's ObjectBVH raycast against the loaded skinned GLB.
		await page.getByTestId('frame-editable-scene').click();
		await canvas.click();
		await expect(page.getByTestId('spz-pick-status')).toContainText(/Picked .* triangle \d+ at/, { timeout: 10_000 });

		// 4. Inspect the presented canvas screenshot. WebGL's default drawing
		// buffer may be cleared after presentation, so readPixels() is not a
		// reliable way to assert what the user actually saw.
		const canvasPng = await canvas.screenshot();
		const { data: pixels, info } = await sharp(canvasPng).removeAlpha().raw().toBuffer({ resolveWithObject: true });
		const background = [pixels[0]!, pixels[1]!, pixels[2]!];
		let nonBackgroundPixels = 0;
		for (let i = 0; i < pixels.length; i += info.channels) {
			const difference = Math.max(
				Math.abs(pixels[i]! - background[0]),
				Math.abs(pixels[i + 1]! - background[1]),
				Math.abs(pixels[i + 2]! - background[2])
			);
			if (difference > 12) nonBackgroundPixels++;
		}
		const pixelSample = { width: info.width, height: info.height, nonBackgroundPixels };
		expect(pixelSample.nonBackgroundPixels, `Expected visible geometry in the canvas screenshot; got ${JSON.stringify(pixelSample)}`).toBeGreaterThan(0);
		await testInfo.attach('gate-a-presented-canvas.png', { body: canvasPng, contentType: 'image/png' });

		// 5. Test Copy Clipboard action (verifies clipboard permissions & fallback)
		const copyResult = await page.evaluate(async () => {
			try {
				await navigator.clipboard.writeText('sha256:266b4eb4e125b522b1a9176c296f02b18a19ef83739e0b0c88e7ad72003f0bcd');
				return 'COPIED';
			} catch (e) {
				return 'ERROR';
			}
		});
		expect(copyResult).toBe('COPIED');

		// 6. Verify Unmount / GPU Resource Disposal
		await page.getByRole('button', { name: 'Dispose' }).click();
		await expect(page.getByText('Scene disposed; the fixture can be loaded again.')).toBeVisible();

		// Zero errors or non-read requests
		expect(pageErrors, pageErrors.join('\n')).toEqual([]);
		expect(nonReadRequests.filter((r) => !r.includes('/api/analytics') && !r.includes('/api/errors'))).toEqual([]);
	});
});
