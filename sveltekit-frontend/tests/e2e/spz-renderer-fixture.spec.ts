import { test, expect } from '@playwright/test';
import { resolve } from 'node:path';

test.use({
	serviceWorkers: 'block',
	viewport: { width: 1280, height: 720 },
});

test('synthetic SPZ fixture decodes, renders, samples and disposes without writes', async ({ page }, testInfo) => {
	const pageErrors: string[] = [];
	const consoleErrors: string[] = [];
	const nonReadRequests: string[] = [];
	page.on('pageerror', (error) => pageErrors.push(error.message));
	page.on('console', (message) => {
		if (message.type() === 'error') consoleErrors.push(message.text());
	});
	page.on('request', (request) => {
		if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) nonReadRequests.push(`${request.method()} ${request.url()}`);
	});
	// The app shell emits page telemetry globally; keep it local to the test and never
	// send it to the running server while proving this fixture viewer is write-free.
	await page.route('**/api/analytics/events', (route) => route.fulfill({ status: 204, body: '' }));

	await page.goto('/demos/spz-renderer');
	await expect(page.getByText(/Synthetic Niantic SPZ v4 fixture/)).toBeVisible();
	await page.getByRole('button', { name: 'Worker decode + WebGPU' }).click();
	await expect(page.getByText(/Synthetic SPZ v4 loaded/)).toBeVisible({ timeout: 30_000 });
	await expect(page.getByText('Input ArrayBuffer transferred and detached')).toBeVisible();
	await expect(page.getByText('5', { exact: true })).toBeVisible();

	const backend = await page.locator('[data-testid="renderer-backend"]').textContent().catch(() => null);
	const backendLabel = backend ?? (await page.locator('body').innerText()).match(/BACKEND\s+([^\n]+)/)?.[1];
	expect(backendLabel).toMatch(/webgpu|webgl2/i);

	const half = page.getByRole('button', { name: 'Half resolution' });
	await half.click();
	await expect(half).toHaveAttribute('aria-pressed', 'true');
	const retro = page.getByRole('button', { name: 'Retro pixels' });
	await retro.click();
	await expect(retro).toHaveAttribute('aria-pressed', 'true');
	await page.screenshot({ path: testInfo.outputPath('spz-fixture-rendered.png'), fullPage: true });

	await page.getByRole('button', { name: 'Dispose' }).click();
	await expect(page.getByText('Scene disposed; the fixture can be loaded again.')).toBeVisible();
	expect(nonReadRequests.filter((request) => !request.includes('/api/analytics/events')), 'fixture viewer must not issue case/evidence/scene writes').toEqual([]);
	expect(pageErrors, pageErrors.join('\n')).toEqual([]);
	expect(consoleErrors, consoleErrors.join('\n')).toEqual([]);
});

test('Blender MCP transformed GLB imports into Three.js and copy exports', async ({ page }, testInfo) => {
	const pageErrors: string[] = [];
	const nonReadRequests: string[] = [];
	page.on('pageerror', (error) => pageErrors.push(error.message));
	page.on('request', (request) => {
		if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) nonReadRequests.push(`${request.method()} ${request.url()}`);
	});
	await page.route('**/api/analytics/events', (route) => route.fulfill({ status: 204, body: '' }));
	await page.goto('/demos/spz-renderer');
	await page.locator('input[type="file"][accept=".glb,model/gltf-binary"]').setInputFiles(resolve(process.cwd(), '../.tmp/blender-mcp-workspace/smoke/codex-transform-proof.glb'));
	await expect(page.getByText(/Blender-authored GLB loaded into the Three\.js fixture viewer/)).toBeVisible({ timeout: 30_000 });
	const rotate = page.getByRole('button', { name: 'Rotate mesh' });
	await expect(rotate).toBeEnabled();
	const move = page.getByRole('button', { name: 'Move mesh' });
	await move.click();
	await expect(move).toHaveAttribute('aria-pressed', 'true');
	const transformReadout = page.getByTestId('spz-mesh-transform');
	const beforeTransform = await transformReadout.textContent();
	const canvas = await page.getByTestId('spz-fixture-canvas').boundingBox();
	expect(canvas).not.toBeNull();
	if (!canvas) throw new Error('The GLB viewer canvas is missing.');
	const gizmoX = canvas.x + canvas.width * 0.585;
	const gizmoY = canvas.y + canvas.height * 0.5;
	await page.mouse.move(gizmoX + 46, gizmoY);
	await page.mouse.down();
	await page.mouse.move(gizmoX + 96, gizmoY, { steps: 8 });
	await page.mouse.up();
	await expect.poll(() => transformReadout.textContent()).not.toBe(beforeTransform);
	await page.screenshot({ path: testInfo.outputPath('blender-glb-in-threejs.png'), fullPage: true });
	await page.screenshot({ path: resolve(process.cwd(), '../.tmp/atlas/blender-transformed-glb-threejs-browser-2026-11-04.png'), fullPage: true });

	const downloadPromise = page.waitForEvent('download');
	await page.getByRole('button', { name: 'Download edited GLB' }).click();
	const download = await downloadPromise;
	const editedPath = testInfo.outputPath(download.suggestedFilename());
	await download.saveAs(editedPath);
	await download.saveAs(resolve(process.cwd(), '../.tmp/blender-mcp-workspace/smoke/codex-three-edited.glb'));
	const { readFile, stat } = await import('node:fs/promises');
	const editedBytes = await readFile(editedPath);
	expect(download.suggestedFilename()).toMatch(/codex-transform-proof-edited\.glb$/i);
	expect(await stat(editedPath).then((file) => file.size)).toBeGreaterThan(20);
	expect(editedBytes.subarray(0, 4).toString('ascii')).toBe('glTF');
	expect(nonReadRequests.filter((request) => !request.includes('/api/analytics/events'))).toEqual([]);
	expect(pageErrors, pageErrors.join('\n')).toEqual([]);
	await page.getByRole('button', { name: 'Dispose' }).click();
	await expect(transformReadout).toHaveText('No local transform loaded');
});

test('synthetic playground creates, selects and exports multiple editable meshes without writes', async ({ page }, testInfo) => {
	const pageErrors: string[] = [];
	const nonReadRequests: string[] = [];
	page.on('pageerror', (error) => pageErrors.push(error.message));
	page.on('request', (request) => {
		if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) nonReadRequests.push(`${request.method()} ${request.url()}`);
	});
	await page.route('**/api/analytics/events', (route) => route.fulfill({ status: 204, body: '' }));
	await page.goto('/demos/spz-renderer');
	await page.getByRole('button', { name: 'Add box' }).click();
	await page.getByRole('button', { name: 'Add sphere' }).click();
	const selector = page.getByRole('combobox', { name: 'Select scene object' });
	await expect(selector.locator('option')).toHaveCount(2);
	await expect(selector).toHaveValue('Evidence sphere 1');
	await selector.selectOption('Evidence box 1');
	await expect(selector).toHaveValue('Evidence box 1');
	await expect(page.getByTestId('spz-mesh-transform')).toContainText('position');
	await expect(page.getByTestId('spz-mesh-edit-status')).toContainText('2 editable object(s)');
	await page.screenshot({ path: testInfo.outputPath('synthetic-multi-object-playground.png'), fullPage: true });
	const downloads: any[] = [];
	page.on('download', (download) => downloads.push(download));
	await page.getByRole('button', { name: 'Download edited GLB' }).click();
	await expect.poll(() => downloads.length).toBe(2);
	const [download, manifestDownload] = downloads;
	const outputPath = testInfo.outputPath(download.suggestedFilename());
	await download.saveAs(outputPath);
	const manifestPath = testInfo.outputPath(manifestDownload.suggestedFilename());
	await manifestDownload.saveAs(manifestPath);
	const { readFile, stat } = await import('node:fs/promises');
	const bytes = await readFile(outputPath);
	const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
	expect(bytes.subarray(0, 4).toString('ascii')).toBe('glTF');
	expect(await stat(outputPath).then((file) => file.size)).toBeGreaterThan(20);
	expect(download.suggestedFilename()).toMatch(/synthetic-playground-edited\.glb$/i);
	expect(manifest.schema).toBe('parent-atlas.scene-document.v1');
	expect(manifest.status).toBe('FIXTURE');
	expect(manifest.revision).toBe(1);
	expect(manifest.coordinateFrame).toBe('LOCAL_UNCALIBRATED');
	expect(manifest.objects.filter((object: any) => object.kind === 'MESH')).toHaveLength(2);
	expect(new Set(manifest.objects.map((object: any) => object.objectId)).size).toBe(manifest.objects.length);
	expect(manifest.assets[0].sha256).toMatch(/^[a-f0-9]{64}$/);
	expect(manifest.quality.status).toBe('NOT_ASSESSED');
	expect(await page.getByTestId('spz-scene-manifest-status').textContent()).toContain('revision 1 exported');
	expect(nonReadRequests.filter((request) => !request.includes('/api/analytics/events'))).toEqual([]);
	expect(pageErrors, pageErrors.join('\n')).toEqual([]);
});

test('local Mixamo-derived GLB clip can be previewed without changing case data', async ({ page }, testInfo) => {
	const pageErrors: string[] = [];
	const nonReadRequests: string[] = [];
	page.on('pageerror', (error) => pageErrors.push(error.message));
	page.on('request', (request) => {
		if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) nonReadRequests.push(`${request.method()} ${request.url()}`);
	});
	await page.route('**/api/analytics/events', (route) => route.fulfill({ status: 204, body: '' }));
	await page.goto('/demos/spz-renderer');
	await page.locator('input[type="file"][accept=".glb,model/gltf-binary"]').setInputFiles(resolve(process.cwd(), 'static/models/courtroom/walk_normal.glb'));
	await expect(page.getByText(/Blender-authored GLB loaded into the Three\.js fixture viewer/)).toBeVisible({ timeout: 30_000 });
	await expect(page.getByTestId('spz-animation-status')).toContainText('local clip(s) available');
	const play = page.getByRole('button', { name: 'Play animation' });
	await expect(play).toBeEnabled();
	await play.click();
	await expect(page.getByText(/Previewing .* locally\. Playback is illustrative/)).toBeVisible();
	await page.getByRole('button', { name: 'Stop animation' }).click();
	const downloads: any[] = [];
	page.on('download', (download) => downloads.push(download));
	await page.getByRole('button', { name: 'Download edited GLB' }).click();
	await expect.poll(() => downloads.length).toBe(2);
	const { readFile } = await import('node:fs/promises');
	const manifestPath = testInfo.outputPath(downloads[1].suggestedFilename());
	await downloads[1].saveAs(manifestPath);
	const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
	expect(manifest.coordinateFrame).toBe('GLTF_Y_UP_METERS');
	expect(manifest.animations.length).toBeGreaterThan(0);
	expect(manifest.assets).toHaveLength(2);
	expect(manifest.assets[0].role).toBe('SOURCE');
	expect(manifest.assets[1].role).toBe('DERIVED');
	expect(nonReadRequests.filter((request) => !request.includes('/api/analytics/events'))).toEqual([]);
	expect(pageErrors, pageErrors.join('\n')).toEqual([]);
});
