import { expect, test } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

test.use({
	serviceWorkers: 'block',
	viewport: { width: 1280, height: 720 }
});

test('Blender MCP synthetic memory fabric loads in the pre-case Three.js playground without writes', async ({ page }, testInfo) => {
	const fixturePath = process.env.MEMORY_FABRIC_GLB_PATH;
	test.skip(!fixturePath, 'Set MEMORY_FABRIC_GLB_PATH to a GLB exported by the Blender memory-fabric smoke.');
	const receiptPath = process.env.MEMORY_FABRIC_RECEIPT_PATH;
	test.skip(!receiptPath, 'Set MEMORY_FABRIC_RECEIPT_PATH to the matching Blender smoke receipt.');
	const receipt = JSON.parse(await readFile(resolve(receiptPath!), 'utf8'));

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

	await page.goto('/demos/spz-renderer?mode=preflight');
	await page.getByTestId('local-asset-file-input').setInputFiles(resolve(fixturePath!));
	await expect(page.getByTestId('preflight-file')).toContainText('atlas-memory-fabric.glb', { timeout: 30_000 });
	await expect(page.getByTestId('preflight-file')).toContainText(receipt.exportedGlbBytes.toLocaleString());
	await expect(page.getByTestId('preflight-file-path')).toContainText('atlas-memory-fabric.glb');
	await expect(page.getByTestId('preflight-geometry')).toHaveText(
		`${receipt.independentReadback.meshObjectCount} meshes · ${receipt.independentReadback.vertexCount.toLocaleString()} vertices · ${receipt.independentReadback.triangleCount.toLocaleString()} triangles`
	);
	await expect(page.getByTestId('preflight-spatial-bvh')).toContainText(/CPU BVH picking.*TLAS ready/);
	await expect(page.getByTestId('preflight-skeleton')).toHaveText('0 bones detected');
	await expect(page.getByTestId('preflight-uv-textures')).toContainText(/UV channels? · 0 textures · baked-map status unverified/);
	await expect(page.getByTestId('preflight-texture-list')).toHaveText('No material textures detected in this asset.');
	await expect(page.getByTestId('preflight-material-count')).toContainText(/[1-9][\d,]* materials · glTF metallic-roughness subset/);
	await expect(page.getByTestId('preflight-source-hash')).toContainText(/SHA-256: [a-f0-9]{64}/);
	await expect(page.getByTestId('scene-composition-status')).toContainText('24 editable objects');

	await page.getByRole('button', { name: 'Add sphere' }).click();
	await expect(page.getByTestId('preflight-geometry')).toContainText('25 meshes');
	const editedGeometry = await page.getByTestId('preflight-geometry').innerText();
	const editedTriangleCount = Number(editedGeometry.match(/([\d,]+) triangles/)?.[1].replaceAll(',', ''));
	expect(editedTriangleCount).toBeGreaterThan(receipt.independentReadback.triangleCount);
	const [download, manifestDownload] = await Promise.all([
		page.waitForEvent('download', (candidate) => candidate.suggestedFilename().endsWith('.glb')),
		page.waitForEvent('download', (candidate) => candidate.suggestedFilename().endsWith('.json')),
		page.getByRole('button', { name: 'Download edited GLB' }).click()
	]);
	const editedPath = testInfo.outputPath('memory-fabric-edited.glb');
	const manifestPath = testInfo.outputPath('memory-fabric-scene-manifest.json');
	await download.saveAs(editedPath);
	await manifestDownload.saveAs(manifestPath);
	const editedBytes = await readFile(editedPath);
	expect(editedBytes.subarray(0, 4).toString('ascii')).toBe('glTF');
	const editedSha256 = createHash('sha256').update(editedBytes).digest('hex');
	expect(editedSha256).not.toBe(receipt.glbSha256);
	const sceneManifest = JSON.parse(await readFile(manifestPath, 'utf8'));
	expect(sceneManifest).toMatchObject({
		schema: 'parent-atlas.scene-document.v1',
		caseId: null,
		status: 'FIXTURE',
		sceneClassification: 'SYNTHETIC_FIXTURE',
		quality: { triangleCount: editedTriangleCount, derivedAssetBytes: editedBytes.byteLength }
	});
	expect(sceneManifest.assets).toEqual(expect.arrayContaining([
		expect.objectContaining({ role: 'SOURCE', sha256: receipt.glbSha256, bytes: receipt.exportedGlbBytes }),
		expect.objectContaining({ role: 'DERIVED', sha256: editedSha256, bytes: editedBytes.byteLength })
	]));
	await testInfo.attach('edited-memory-fabric.glb', { path: editedPath, contentType: 'model/gltf-binary' });
	await testInfo.attach('edited-memory-fabric-scene-manifest.json', { path: manifestPath, contentType: 'application/json' });
	console.log(`[memory-fabric-export] ${JSON.stringify({ editedGlbBytes: editedBytes.byteLength, editedGlbSha256: editedSha256, triangleCount: editedTriangleCount, manifestQuality: sceneManifest.quality })}`);
	await page.getByTestId('local-asset-file-input').setInputFiles(editedPath);
	await expect(page.getByTestId('preflight-file')).toContainText('memory-fabric-edited.glb', { timeout: 30_000 });
	await expect(page.getByTestId('preflight-geometry')).toContainText('25 meshes');
	await expect(page.getByTestId('preflight-geometry')).toContainText(`${editedTriangleCount.toLocaleString()} triangles`);
	await expect(page.getByTestId('preflight-source-hash')).toContainText(editedSha256);

	const canvas = page.getByTestId('spz-fixture-canvas');
	const canvasBounds = await canvas.boundingBox();
	expect(canvasBounds?.height ?? 0).toBeGreaterThan(160);
	await page.screenshot({ path: testInfo.outputPath('memory-fabric-preflight.png'), fullPage: true });

	expect(nonReadRequests.filter((request) => !request.includes('/api/analytics/events') && !request.includes('/api/errors/client-report'))).toEqual([]);
	expect(pageErrors, pageErrors.join('\n')).toEqual([]);
	expect(consoleErrors, consoleErrors.join('\n')).toEqual([]);
});
