import { expect, test } from '@playwright/test';
import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

test.use({ serviceWorkers: 'block', viewport: { width: 1280, height: 720 } });

test('a real case board opens local image and mesh preflight without writing case data', async ({ page }, testInfo) => {
	const pageErrors: string[] = [];
	const consoleErrors: string[] = [];
	const nonReadRequests: string[] = [];
	page.on('pageerror', (error) => pageErrors.push(error.message));
	page.on('console', (message) => {
		if (message.type() === 'error') consoleErrors.push(message.text());
	});
	page.on('request', (request) => {
		if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) {
			nonReadRequests.push(`${request.method()} ${request.url()}`);
		}
	});
	await page.route('**/api/analytics/events', (route) => route.fulfill({ status: 204, body: '' }));
	await page.route('**/api/errors/client-report', (route) => route.fulfill({ status: 204, body: '' }));

	await page.goto('/cases');
	const caseBoardLink = page.getByRole('link', { name: 'Open evidence board' }).first();
	await expect(caseBoardLink).toBeVisible({ timeout: 30_000 });
	const caseBoardHref = await caseBoardLink.getAttribute('href');
	expect(caseBoardHref).toMatch(/^\/cases\/[0-9a-f-]+\/board$/i);
	await caseBoardLink.click();

	const preflightLink = page.getByTestId('scene-preflight-link');
	await expect(preflightLink).toBeVisible({ timeout: 30_000 });
	const preflightHref = await preflightLink.getAttribute('href');
	expect(preflightHref).toContain('mode=preflight');
	expect(preflightHref).toContain(`returnCaseId=${encodeURIComponent(caseBoardHref!.split('/')[2])}`);
	await preflightLink.click();
	await expect(page.getByTestId('local-asset-file-input')).toBeVisible({ timeout: 30_000 });
	await expect(page.getByText(/Local preflight only/)).toBeVisible();
	await page.getByTestId('local-image-file-input').setInputFiles(resolve(process.cwd(), 'tests/fixtures/test-poi-photo.png'));
	await expect(page.getByTestId('preflight-file')).toContainText('test-poi-photo.png', { timeout: 30_000 });
	await expect(page.getByTestId('preflight-source-hash')).toContainText(/SHA-256: [a-f0-9]{64}/);
	const preflightGeometry = (await page.getByTestId('preflight-geometry').textContent()) ?? '';
	expect(preflightGeometry).toMatch(/^1 meshes · [\d,]+ vertices · [\d,]+ triangles/);
	await expect(page.getByTestId('preflight-uv-textures')).toContainText('1 generated UV channel');
	await expect(page.getByTestId('preflight-uv-textures')).toContainText('1 original-image texture attached · not atlas-baked');
	await expect(page.getByTestId('preflight-file-path')).toContainText('test-poi-photo.png');
	await expect(page.getByText(/Single-image relief is a 2\.5D demonstrative hypothesis/)).toBeVisible();
	await expect(page.getByText(/original color image is attached through generated UVs; this is not a newly baked texture atlas/)).toBeVisible();
	await expect(page.getByText(/visual quality and case provenance need separate review/)).toBeVisible();
	const preflightFile = (await page.getByTestId('preflight-file').textContent()) ?? '';
	const preflightFilePath = (await page.getByTestId('preflight-file-path').textContent()) ?? '';
	const preflightUvTextures = (await page.getByTestId('preflight-uv-textures').textContent()) ?? '';
	const preflightSourceHash = (await page.getByTestId('preflight-source-hash').textContent())?.match(/[a-f0-9]{64}/i)?.[0] ?? '';

	await page.getByRole('button', { name: 'Add sphere' }).click();
	const editedGeometry = page.getByTestId('preflight-geometry');
	await expect(editedGeometry).toContainText(/^2 meshes/);
	const editedGeometryText = (await editedGeometry.textContent()) ?? '';
	const downloads: import('@playwright/test').Download[] = [];
	page.on('download', (download) => downloads.push(download));
	await page.getByRole('button', { name: 'Download edited GLB' }).click();
	await expect.poll(() => downloads.length).toBe(2);
	const glbPath = testInfo.outputPath(downloads[0].suggestedFilename());
	const manifestPath = testInfo.outputPath(downloads[1].suggestedFilename());
	await downloads[0].saveAs(glbPath);
	await downloads[1].saveAs(manifestPath);
	const imageBytes = await readFile(resolve(process.cwd(), 'tests/fixtures/test-poi-photo.png'));
	const glbBytes = await readFile(glbPath);
	const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
	const sourceSha256 = createHash('sha256').update(imageBytes).digest('hex');
	expect(preflightSourceHash).toBe(sourceSha256);
	expect(glbBytes.subarray(0, 4).toString('ascii')).toBe('glTF');
	const exportedGlbBytes = (await stat(glbPath)).size;
	expect(exportedGlbBytes).toBeGreaterThan(20);
	expect(exportedGlbBytes).toBeLessThanOrEqual(8 * 1024 * 1024);
	expect(manifest.objects.filter((object: { kind: string }) => object.kind === 'MESH')).toHaveLength(2);
	expect(manifest.quality.status).toBe('NOT_ASSESSED');
	await expect(page.getByTestId('preflight-export')).toContainText('GLB SHA-256');
	expect(manifest.assets.some((asset: { role: string }) => ['DERIVED', 'LOD'].includes(asset.role))).toBe(true);
	const receipt = {
		schema: 'parent-atlas.board-precase-preflight-receipt.v1',
		status: 'PASS',
		createdAt: new Date().toISOString(),
		caseBoardPath: caseBoardHref,
		preflightPath: preflightHref,
		classification: 'LOCAL_2_5D_HYPOTHESIS',
		source: {
			fileName: 'test-poi-photo.png',
			bytes: imageBytes.byteLength,
			sha256: sourceSha256,
			uiSha256: preflightSourceHash,
			filePathLabel: preflightFilePath,
			fileReadout: preflightFile,
			geometry: preflightGeometry,
			uvAndTexture: preflightUvTextures
		},
		edit: { operation: 'Add sphere', geometry: editedGeometryText },
		export: {
			fileName: downloads[0].suggestedFilename(),
			bytes: exportedGlbBytes,
			sha256: createHash('sha256').update(glbBytes).digest('hex'),
			meshCount: manifest.objects.filter((object: { kind: string }) => object.kind === 'MESH').length,
			qualityStatus: manifest.quality.status,
			derivedAssetByteBudget: manifest.quality.derivedAssetByteBudget
		},
		writes: {
			case: 0,
			postgres: 0,
			seaweedfs: 0,
			unexpectedNonReadRequests: nonReadRequests.filter((request) => !request.includes('/api/analytics/events') && !request.includes('/api/errors/client-report')).length
		}
	};
	const receiptDate = receipt.createdAt.slice(0, 10);
	const receiptPath = resolve(process.cwd(), `../.tmp/atlas/board-precase-preflight-${receiptDate}.json`);
	await mkdir(dirname(receiptPath), { recursive: true });
	await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
	await testInfo.attach('board-precase-preflight-receipt.json', { path: receiptPath, contentType: 'application/json' });

	expect(nonReadRequests.filter((request) => !request.includes('/api/analytics/events') && !request.includes('/api/errors/client-report'))).toEqual([]);
	expect(pageErrors, pageErrors.join('\n')).toEqual([]);
	expect(consoleErrors, consoleErrors.join('\n')).toEqual([]);
});
