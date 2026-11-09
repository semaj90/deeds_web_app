import { test, expect } from '@playwright/test';
import { dirname, resolve } from 'node:path';

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
	const samplingDiagnostics = page.getByTestId('render-sampling-diagnostics');
	const readBackingBuffer = async () => {
		const text = await samplingDiagnostics.textContent();
		const match = text?.match(/measured drawing buffer (\d+)×(\d+)px/);
		expect(match, text ?? 'missing sampling diagnostics').not.toBeNull();
		return { width: Number(match?.[1]), height: Number(match?.[2]) };
	};
	await expect(samplingDiagnostics).toContainText(/HIGH · native/);
	const highBuffer = await readBackingBuffer();
	const highReadout = await samplingDiagnostics.textContent();

	const half = page.getByRole('button', { name: 'Half resolution' });
	await half.click();
	await expect(half).toHaveAttribute('aria-pressed', 'true');
	await expect(samplingDiagnostics).toContainText(/MEDIUM · half · CSS \d+×\d+px · measured drawing buffer [1-9]\d*×[1-9]\d*px/);
	await expect(samplingDiagnostics).toContainText('antialias requested ON; actual sample count unmeasured');
	const mediumBuffer = await readBackingBuffer();
	const mediumReadout = await samplingDiagnostics.textContent();
	expect(mediumBuffer.width / highBuffer.width).toBeCloseTo(0.5, 2);
	expect(mediumBuffer.height / highBuffer.height).toBeCloseTo(0.5, 2);
	const retro = page.getByRole('button', { name: 'Retro pixels' });
	await retro.click();
	await expect(retro).toHaveAttribute('aria-pressed', 'true');
	await expect(samplingDiagnostics).toContainText(/LOW · retro/);
	const lowBuffer = await readBackingBuffer();
	const lowReadout = await samplingDiagnostics.textContent();
	expect(lowBuffer.width / mediumBuffer.width).toBeCloseTo(0.5, 2);
	expect(lowBuffer.height / mediumBuffer.height).toBeCloseTo(0.5, 2);
	console.log(`[render-sampling-readback] ${JSON.stringify({ high: highReadout, medium: mediumReadout, low: lowReadout })}`);
	await page.screenshot({ path: testInfo.outputPath('spz-fixture-rendered.png'), fullPage: true });

	await page.getByRole('button', { name: 'Dispose' }).click();
	await expect(page.getByText('Scene disposed; the fixture can be loaded again.')).toBeVisible();
	expect(nonReadRequests.filter((request) => !request.includes('/api/analytics/events')), 'fixture viewer must not issue case/evidence/scene writes').toEqual([]);
	expect(pageErrors, pageErrors.join('\n')).toEqual([]);
	expect(consoleErrors, consoleErrors.join('\n')).toEqual([]);
});

test('synthetic Streamed SOG package verifies and loads through PlayCanvas without writes', async ({ page }, testInfo) => {
	const pageErrors: string[] = [];
	const nonReadRequests: string[] = [];
	page.on('pageerror', (error) => pageErrors.push(error.message));
	page.on('request', (request) => {
		if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) nonReadRequests.push(`${request.method()} ${request.url()}`);
	});
	await page.route('**/api/analytics/events', (route) => route.fulfill({ status: 204, body: '' }));
	await page.route('**/api/errors/client-report', (route) => route.fulfill({ status: 204, body: '' }));

	await page.goto('/demos/spz-renderer');
	await page.getByTestId('streamed-sog-toggle').click();
	const status = page.getByTestId('streamed-sog-status');
	await expect(status).toContainText(/Rendering verified synthetic SOG/, { timeout: 30_000 });
	await expect(status).toContainText(/WebGPU|WebGL2 fallback/);
	await expect(page.getByLabel(/Synthetic Streamed SOG comparison canvas/)).toBeVisible();
	await page.screenshot({ path: testInfo.outputPath('synthetic-streamed-sog-playcanvas.png'), fullPage: true });
	await page.screenshot({ path: resolve(process.cwd(), '../.tmp/atlas/streamed-sog-playcanvas-2026-11-05.png'), fullPage: true });

	expect(pageErrors, pageErrors.join('\n')).toEqual([]);
	expect(nonReadRequests.filter((request) => !request.includes('/api/analytics/events') && !request.includes('/api/errors/client-report'))).toEqual([]);
});

test('Blender MCP transformed GLB imports into Three.js and copy exports', async ({ page }, testInfo) => {
	const pageErrors: string[] = [];
	const nonReadRequests: string[] = [];
	const clientErrorReports: string[] = [];
	page.on('pageerror', (error) => pageErrors.push(error.message));
	page.on('request', (request) => {
		if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) nonReadRequests.push(`${request.method()} ${request.url()}`);
	});
	await page.route('**/api/analytics/events', (route) => route.fulfill({ status: 204, body: '' }));
	// The application error reporter persists events and may enqueue work; capture it locally so this fixture stays DB-free.
	await page.route('**/api/errors/client-report', async (route) => {
		clientErrorReports.push(route.request().postData() ?? '');
		await route.fulfill({ status: 204, body: '' });
	});
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
	expect(pageErrors, pageErrors.join('\n')).toEqual([]);
	expect(clientErrorReports, clientErrorReports.join('\n')).toEqual([]);
	expect(nonReadRequests.filter((request) => !request.includes('/api/analytics/events') && !request.includes('/api/errors/client-report'))).toEqual([]);
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
	expect(manifest.quality.derivedAssetBytes).toBe(manifest.assets.filter((asset: any) => ['DERIVED', 'LOD'].includes(asset.role)).reduce((sum: number, asset: any) => sum + asset.bytes, 0));
	expect(manifest.quality.derivedAssetByteBudget).toBe(8 * 1024 * 1024);
	expect(manifest.quality.derivedAssetByteStatus).toBe(manifest.quality.derivedAssetBytes <= manifest.quality.derivedAssetByteBudget ? 'WITHIN_BUDGET' : 'BUDGET_NOT_MET');
	expect(await page.getByTestId('spz-scene-manifest-status').textContent()).toContain('revision 1 exported');
	const meshIds = manifest.objects.filter((object: any) => object.kind === 'MESH').map((object: any) => object.objectId).sort();
	await page.locator('input[type="file"][accept=".glb,model/gltf-binary"]').setInputFiles(outputPath);
	await expect(page.getByText(/Blender-authored GLB loaded into the Three\.js fixture viewer/)).toBeVisible({ timeout: 30_000 });
	await page.getByRole('button', { name: 'Download edited GLB' }).click();
	await expect.poll(() => downloads.length).toBe(4);
	const roundTripManifestPath = testInfo.outputPath(downloads[3].suggestedFilename());
	await downloads[3].saveAs(roundTripManifestPath);
	const roundTripManifest = JSON.parse(await readFile(roundTripManifestPath, 'utf8'));
	expect(roundTripManifest.objects.filter((object: any) => object.kind === 'MESH').map((object: any) => object.objectId).sort()).toEqual(meshIds);
	expect(nonReadRequests.filter((request) => !request.includes('/api/analytics/events'))).toEqual([]);
	expect(pageErrors, pageErrors.join('\n')).toEqual([]);
});

test('case scene navigation preserves the scene and exhibit IDs across the editor return link', async ({ page }) => {
	const caseId = '11111111-1111-4111-8111-111111111111';
	const sceneId = '22222222-2222-4222-8222-222222222222';
	const evidenceId = '33333333-3333-4333-8333-333333333333';
	const nonReadRequests: string[] = [];
	const pageErrors: string[] = [];
	page.on('request', (request) => {
		if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) nonReadRequests.push(`${request.method()} ${request.url()}`);
	});
	page.on('pageerror', (error) => pageErrors.push(error.message));
	await page.route('**/api/analytics/events', (route) => route.fulfill({ status: 204, body: '' }));
	await page.route('**/api/errors/client-report', (route) => route.fulfill({ status: 204, body: '' }));
	await page.goto(`/demos/spz-renderer?caseId=${caseId}&sceneId=${sceneId}&evidenceId=${evidenceId}`);
	const returnLink = page.getByTestId('return-to-evidence-board');
	await expect(returnLink).toBeVisible();
	await expect(returnLink).toHaveAttribute('href', `/cases/${caseId}/board?sceneId=${sceneId}&evidenceId=${evidenceId}`);
	await expect(page.getByRole('button', { name: 'Save case scene revision' })).toBeDisabled();
	expect(nonReadRequests.filter((request) => !request.includes('/api/analytics/events') && !request.includes('/api/errors/client-report'))).toEqual([]);
	expect(pageErrors, pageErrors.join('\n')).toEqual([]);
});

test('Mixamo motion retargets on the pre-case character without changing case data', async ({ page }, testInfo) => {
	const pageErrors: string[] = [];
	const nonReadRequests: string[] = [];
	page.on('pageerror', (error) => pageErrors.push(error.message));
	page.on('request', (request) => {
		if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) nonReadRequests.push(`${request.method()} ${request.url()}`);
	});
	await page.route('**/api/analytics/events', (route) => route.fulfill({ status: 204, body: '' }));
	await page.route('**/api/errors/client-report', (route) => route.fulfill({ status: 204, body: '' }));
	await page.goto('/demos/spz-renderer?mode=preflight');
	await page.getByTestId('local-asset-file-input').setInputFiles(resolve(process.cwd(), 'static/models/courtroom/character_alice.glb'));
	await expect(page.getByText(/GLB loaded into the local Three\.js editor/)).toBeVisible({ timeout: 30_000 });
	const syntheticSplatVisibility = page.getByTestId('synthetic-splat-visibility');
	await expect(syntheticSplatVisibility).toBeChecked();
	await syntheticSplatVisibility.uncheck();
	await expect(syntheticSplatVisibility).not.toBeChecked();
	await page.getByTestId('frame-editable-scene').click();
	await page.getByTestId('retarget-motion-input').setInputFiles(resolve(process.cwd(), 'static/models/courtroom/objection_dramatic.glb'));
	await expect(page.getByTestId('retarget-status')).toContainText('52 bones mapped', { timeout: 30_000 });
	await page.getByTestId('retarget-play').click();
	await expect(page.getByTestId('retarget-status')).toContainText('Playing');
	await expect(page.getByTestId('retarget-bone-updates')).not.toHaveText('0 target bone rotations applied');
	await expect(page.getByTestId('retarget-bone-changes')).not.toHaveText('0 target bones differ from rest pose');
	const viewportBounds = await page.getByTestId('spz-fixture-canvas').boundingBox();
	expect(viewportBounds?.height).toBeGreaterThanOrEqual(160);
	await testInfo.attach('mixamo-retarget-active-pose.png', { body: await page.screenshot(), contentType: 'image/png' });
	await page.getByTestId('retarget-stop').click();
	await expect(page.getByTestId('retarget-status')).toContainText('character rest pose restored');
	await expect(page.getByTestId('retarget-bone-updates')).toHaveText('0 target bone rotations applied');
	await expect(page.getByTestId('retarget-bone-changes')).toHaveText('0 target bones differ from rest pose');
	expect(nonReadRequests.filter((request) => !request.includes('/api/analytics/events'))).toEqual([]);
	expect(pageErrors, pageErrors.join('\n')).toEqual([]);
});

test('generated primitive transform animation plays in the Three.js playground without writes', async ({ page }, testInfo) => {
	const pageErrors: string[] = [];
	const nonReadRequests: string[] = [];
	const clientErrorReports: string[] = [];
	page.on('pageerror', (error) => pageErrors.push(error.message));
	page.on('request', (request) => {
		if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) nonReadRequests.push(`${request.method()} ${request.url()}`);
	});
	await page.route('**/api/analytics/events', (route) => route.fulfill({ status: 204, body: '' }));
	await page.route('**/api/errors/client-report', async (route) => {
		clientErrorReports.push(route.request().postData() ?? '');
		await route.fulfill({ status: 204, body: '' });
	});
	await page.goto('/demos/spz-renderer?mode=preflight');
	await page.getByTestId('local-asset-file-input').setInputFiles(resolve(process.cwd(), '../.tmp/blender-mcp-workspace/smoke/codex-animation-mcp-20261105.glb'));
	await expect(page.getByText(/GLB loaded into the local Three\.js editor/)).toBeVisible({ timeout: 30_000 });
	const syntheticSplatVisibility = page.getByTestId('synthetic-splat-visibility');
	if (await syntheticSplatVisibility.isChecked()) await syntheticSplatVisibility.uncheck();
	await page.getByTestId('frame-editable-scene').click();
	await expect(page.getByTestId('spz-animation-status')).toContainText('local clip(s) available');
	const animation = page.getByRole('combobox', { name: 'Select animation clip' });
	const clips = await animation.locator('option').allTextContents();
	expect(clips.some((clip) => /marker-pulse/i.test(clip)), `Expected generated marker-pulse clip; got ${clips.join(', ')}`).toBe(true);
	await animation.selectOption({ label: clips.find((clip) => /marker-pulse/i.test(clip))! });
	await page.getByRole('button', { name: 'Play animation' }).click();
	await expect(page.getByTestId('spz-mesh-edit-status')).toContainText('Playback is illustrative');
	await page.screenshot({ path: resolve(process.cwd(), '../.tmp/atlas/blender-primitive-animation-playground-2026-11-05.png') });
	await page.getByRole('button', { name: 'Stop animation' }).click();
	expect(clientErrorReports, clientErrorReports.join('\n')).toEqual([]);
	expect(nonReadRequests.filter((request) => !request.includes('/api/analytics/events') && !request.includes('/api/errors/client-report'))).toEqual([]);
	expect(pageErrors, pageErrors.join('\n')).toEqual([]);
});

test('Blender scene-recipe GLB opens in the Three.js playground without case writes', async ({ page }, testInfo) => {
	const fixturePath = process.env.SCENE_RECIPE_GLB_PATH;
	test.skip(!fixturePath, 'Set SCENE_RECIPE_GLB_PATH to a GLB produced by blender_synthesize_scene_dag.');
	const pageErrors: string[] = [];
	const nonReadRequests: string[] = [];
	page.on('pageerror', (error) => pageErrors.push(error.message));
	page.on('request', (request) => {
		if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) nonReadRequests.push(`${request.method()} ${request.url()}`);
	});
	await page.route('**/api/analytics/events', (route) => route.fulfill({ status: 204, body: '' }));
	await page.goto('/demos/spz-renderer');
	await page.locator('input[type="file"][accept=".glb,model/gltf-binary"]').setInputFiles(resolve(fixturePath!));
	await expect(page.getByText(/Blender-authored GLB loaded into the Three\.js fixture viewer/)).toBeVisible({ timeout: 30_000 });
	const objects = page.getByRole('combobox', { name: 'Select scene object' });
	await expect(objects.locator('option')).toHaveCount(2);
	const objectNames = await objects.locator('option').allTextContents();
	expect(objectNames).toEqual(expect.arrayContaining(['ground', 'marker']));
	await objects.selectOption('marker');
	await expect(page.getByTestId('spz-mesh-transform')).toContainText('position');
	const screenshotPath = resolve(process.cwd(), '../.tmp/atlas/scene-recipe-three-playground-2026-11-05.png');
	await (await import('node:fs/promises')).mkdir(dirname(screenshotPath), { recursive: true });
	await page.screenshot({ path: screenshotPath, fullPage: true });
	expect(nonReadRequests.filter((request) => !request.includes('/api/analytics/events'))).toEqual([]);
	expect(pageErrors, pageErrors.join('\n')).toEqual([]);
});

test('rounded Blender primitive keeps its PBR material and UVs in pre-case Three.js', async ({ page }, testInfo) => {
	const fixturePath = process.env.MATERIAL_CUBE_GLB_PATH;
	test.skip(!fixturePath, 'Set MATERIAL_CUBE_GLB_PATH to a GLB produced by tessellated-cube-material-v1.py.');
	const pageErrors: string[] = [];
	const nonReadRequests: string[] = [];
	page.on('pageerror', (error) => pageErrors.push(error.message));
	page.on('request', (request) => {
		if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) nonReadRequests.push(`${request.method()} ${request.url()}`);
	});
	await page.route('**/api/analytics/events', (route) => route.fulfill({ status: 204, body: '' }));
	await page.route('**/api/errors/client-report', (route) => route.fulfill({ status: 204, body: '' }));
	await page.goto('/demos/spz-renderer?mode=preflight');
	await page.getByTestId('local-asset-file-input').setInputFiles(resolve(fixturePath!));
	await expect(page.getByTestId('preflight-file')).toContainText('rounded-grid-cube.glb', { timeout: 30_000 });
	await expect(page.getByTestId('preflight-geometry')).toContainText('2 meshes');
	await expect(page.getByTestId('preflight-uv-textures')).toHaveText(/^[1-9]\d* UV channels? · 0 textures/);
	await expect(page.getByTestId('preflight-material-count')).toContainText('2 materials');
	await page.getByText('Inspect material values').click();
	await expect(page.getByTestId('preflight-material-list')).toContainText('Hypothesis Amber');
	await expect(page.getByTestId('preflight-material-list')).toContainText('MeshStandardMaterial');
	await expect(page.getByTestId('preflight-material-list')).toContainText('base #f59e0b');
	await expect(page.getByTestId('preflight-material-list')).toContainText('roughness 0.78');
	await expect(page.getByTestId('preflight-report')).toContainText('MiB geometry buffers');
	await expect(page.getByTestId('preflight-report')).toContainText('decoded RGBA texture estimate');
	await page.getByTestId('primitive-detail').selectOption('retro');
	await page.getByRole('button', { name: 'Add sphere' }).click();
	await expect(page.getByTestId('preflight-geometry')).toContainText('3 meshes');
	await page.getByTestId('material-mode-phong').click();
	await expect(page.getByTestId('material-mode-phong')).toHaveAttribute('aria-pressed', 'true');
	await page.getByTestId('material-mode-source').click();
	await expect(page.getByTestId('material-mode-source')).toHaveAttribute('aria-pressed', 'true');
	await page.getByTestId('shader-source-file-input').setInputFiles({ name: 'demo.wgsl', mimeType: 'text/plain', buffer: Buffer.from('@fragment fn main() -> @location(0) vec4f { return vec4f(1.0); }') });
	await expect(page.getByTestId('shader-source-name')).toHaveText('demo.wgsl');
	await expect(page.getByTestId('shader-source-hash')).toHaveText(/^[a-f0-9]{64}$/);
	await expect(page.getByTestId('shader-source-receipt')).toContainText('local inventory only');
	await expect(page.getByTestId('preflight-source-hash')).toContainText(/SHA-256: [a-f0-9]{64}/);
	await expect(page.getByText(/Confirm baking in Blender/)).toBeVisible();
	const canvasBox = await page.getByTestId('spz-fixture-canvas').boundingBox();
	expect(canvasBox?.height ?? 0).toBeGreaterThan(160);
	await page.screenshot({ path: testInfo.outputPath('rounded-grid-cube-preflight.png'), fullPage: true });
	expect(pageErrors, pageErrors.join('\n')).toEqual([]);
	expect(nonReadRequests.filter((request) => !request.includes('/api/analytics/events') && !request.includes('/api/errors/client-report'))).toEqual([]);
});

test('Blender material preset swatches load in pre-case Three.js without case writes', async ({ page }, testInfo) => {
	const fixturePath = process.env.MATERIAL_PRESETS_GLB_PATH;
	test.skip(!fixturePath, 'Set MATERIAL_PRESETS_GLB_PATH to a GLB produced by material-preset-swatch-v1.py.');
	const pageErrors: string[] = [];
	const nonReadRequests: string[] = [];
	page.on('pageerror', (error) => pageErrors.push(error.message));
	page.on('request', (request) => {
		if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) nonReadRequests.push(`${request.method()} ${request.url()}`);
	});
	await page.route('**/api/analytics/events', (route) => route.fulfill({ status: 204, body: '' }));
	await page.route('**/api/errors/client-report', (route) => route.fulfill({ status: 204, body: '' }));
	await page.addInitScript(() => {
		const readArrayBuffer = Blob.prototype.arrayBuffer;
		Blob.prototype.arrayBuffer = async function (this: Blob) {
			if ((this as File).name === 'cancel-import.glb') await new Promise((resolve) => setTimeout(resolve, 1000));
			return readArrayBuffer.call(this);
		};
	});
	await page.goto('/demos/spz-renderer?mode=preflight');
	await page.getByTestId('local-asset-file-input').setInputFiles(resolve(fixturePath!));
	await expect(page.getByTestId('preflight-file')).toContainText('material-presets-v1.glb', { timeout: 30_000 });
	await expect(page.getByTestId('asset-import-state')).toHaveText('Import: ready');
	await expect(page.getByTestId('preflight-geometry')).toContainText('5 meshes');
	await expect(page.getByTestId('preflight-material-count')).toContainText('5 materials');
	await page.getByText('Inspect material values').click();
	const materialList = page.getByTestId('preflight-material-list');
	for (const name of ['Hypothesis Amber', 'Synthetic Cyan', 'Neutral Clay', 'Review Red']) {
		await expect(materialList).toContainText(name);
	}
	const canvasBox = await page.getByTestId('spz-fixture-canvas').boundingBox();
	expect(canvasBox?.height ?? 0).toBeGreaterThan(160);
	await page.getByTestId('local-asset-file-input').setInputFiles({
		name: 'cancel-import.glb',
		mimeType: 'model/gltf-binary',
		buffer: Buffer.alloc(64)
	});
	const cancelImport = page.getByTestId('cancel-asset-import');
	await expect(cancelImport).toBeVisible({ timeout: 5_000 });
	await cancelImport.click();
	await expect(page.getByTestId('asset-import-state')).toHaveText('Import: idle');
	await page.waitForTimeout(1_100);
	await expect(page.getByTestId('preflight-file')).toContainText('material-presets-v1.glb');
	await expect(page.getByTestId('preflight-geometry')).toContainText('5 meshes');
	await page.getByTestId('local-asset-file-input').setInputFiles({ name: 'invalid.glb', mimeType: 'model/gltf-binary', buffer: Buffer.alloc(64) });
	await expect(page.getByTestId('asset-import-state')).toHaveText('Import: failed', { timeout: 10_000 });
	await expect(page.getByTestId('preflight-file')).toContainText('material-presets-v1.glb');
	await page.getByTestId('local-asset-file-input').setInputFiles(resolve(fixturePath!));
	await expect(page.getByTestId('asset-import-state')).toHaveText('Import: ready', { timeout: 30_000 });
	await expect(page.getByTestId('preflight-geometry')).toContainText('5 meshes');
	await page.screenshot({ path: testInfo.outputPath('blender-material-presets-threejs-preflight.png'), fullPage: true });
	expect(pageErrors, pageErrors.join('\n')).toEqual([]);
	expect(nonReadRequests.filter((request) => !request.includes('/api/analytics/events') && !request.includes('/api/errors/client-report'))).toEqual([]);
});

test('synthetic OBJ upload parses through OBJLoader into the local editor without writes', async ({ page }) => {
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
	await page.route('**/api/analytics/events', (route) => route.fulfill({ status: 204, body: '' }));
	await page.route('**/api/errors/client-report', (route) => route.fulfill({ status: 204, body: '' }));

	// Two named objects (two OBJLoader meshes), one triangle each. Synthetic text only.
	const objText = [
		'# synthetic two-object OBJ fixture (no evidence content)',
		'o Evidence_A',
		'v 0 0 0',
		'v 1 0 0',
		'v 0 1 0',
		'f 1 2 3',
		'o Evidence_B',
		'v 0 0 1',
		'v 1 0 1',
		'v 0 1 1',
		'f 4 5 6',
		'',
	].join('\n');

	await page.goto('/demos/spz-renderer');
	await page.getByTestId('local-asset-file-input').setInputFiles({
		name: 'synthetic-two-object.obj',
		mimeType: 'text/plain',
		buffer: Buffer.from(objText, 'utf8'),
	});
	await expect(page.getByText(/OBJ loaded into the local Three\.js editor/)).toBeVisible({ timeout: 30_000 });
	await expect(page.getByTestId('spz-mesh-edit-status')).toContainText(/Imported OBJ with 2 editable mesh object\(s\)/);
	await expect(page.getByRole('button', { name: 'Download edited GLB' })).toBeEnabled();

	expect(pageErrors, pageErrors.join('\n')).toEqual([]);
	expect(consoleErrors, consoleErrors.join('\n')).toEqual([]);
	expect(nonReadRequests.filter((request) => !request.includes('/api/analytics/events') && !request.includes('/api/errors/client-report')), 'OBJ import must not issue case/evidence/scene writes').toEqual([]);
});
