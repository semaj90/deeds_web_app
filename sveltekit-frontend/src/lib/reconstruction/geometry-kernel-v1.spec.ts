import { describe, it, expect } from 'vitest';
import {
	TypeScriptGeometryKernelV1,
	createGeometryKernelV1,
	detectGeometryKernelCapabilities,
	rasterizeSimplePolygonScanlineV1,
	paletteArtifactRefV1Schema,
	sceneValkeyCacheKeysV1,
	BoundedScanlineQueueV1
} from './geometry-kernel-v1.js';
import {
	decodeIndexed4BppToRgbaV1,
	INDEXED_PALETTE16_V1,
	type IndexedTexture4BppV1
} from '$lib/splat/indexed-palette-texture-v1.js';
import { createTileBudgetCacheV1 } from '$lib/splat/n64-tile-budget-cache-v1.js';
import {
	ScenePrefabRegistryV1,
	buildStudioApartmentPrefabV1
} from './scene-prefab-registry-v1.js';
import {
	validateProposedScenePlanV1
} from '$lib/server/reconstruction/scene-model-adapter-v1.js';

describe('GeometryKernelV1 & Scene Prefab Registry', () => {
	describe('TypeScriptGeometryKernelV1', () => {
		const kernel = new TypeScriptGeometryKernelV1();

		it('rasterizes a 2D polygon into a binary mask with exact bounding box clipping', async () => {
			// A 4x4 square inside a 10x10 image: from (2,2) to (6,6)
			const polygon = new Float32Array([
				2, 2,
				6, 2,
				6, 6,
				2, 6
			]);
			const mask = await kernel.rasterizePolygonMask(polygon, 10, 10);
			expect(mask.length).toBe(100);

			// Center pixel (4, 4) should be inside (255)
			expect(mask[4 * 10 + 4]).toBe(255);
			// Outside pixel (0, 0) should be outside (0)
			expect(mask[0]).toBe(0);
			// Outside pixel (8, 8) should be outside (0)
			expect(mask[8 * 10 + 8]).toBe(0);
		});

		it('packs 8-bit palette indices into canonical low-nibble-first 4bpp nibbles', async () => {
			// Even pixel = low nibble, odd pixel = high nibble (matching indexed-palette-texture-v1.ts)
			const pixels = new Uint8Array([0x01, 0x02, 0x03, 0x04, 0x0f, 0x00]);
			const packed = await kernel.packPalette4Bpp(pixels);

			expect(packed.length).toBe(3);
			expect(packed[0]).toBe(0x21); // pixel 0 = 1 (low), pixel 1 = 2 (high)
			expect(packed[1]).toBe(0x43); // pixel 2 = 3 (low), pixel 3 = 4 (high)
			expect(packed[2]).toBe(0x0f); // pixel 4 = 15 (low), pixel 5 = 0 (high)
		});

		it('computes intersection bitset popcount', async () => {
			// left has bits 0, 2, 3 set (0b1101 = 13)
			// right has bits 0, 1, 3 set (0b1011 = 11)
			// intersection has bits 0 and 3 set (popcount = 2)
			const left = new Uint32Array([13, 0]);
			const right = new Uint32Array([11, 0]);

			const count = await kernel.intersectBitsets(left, right);
			expect(count).toBe(2);
		});

		it('reports kernel capabilities and provides TypeScript fallback', () => {
			const caps = detectGeometryKernelCapabilities();
			expect(caps.activeBackend).toBe('typescript');
			expect(caps.availableBackends).toContain('typescript');

			const defaultKernel = createGeometryKernelV1();
			expect(defaultKernel.backend).toBe('typescript');
		});
	});

	describe('ScenePrefabRegistryV1', () => {
		it('compiles house.studio.v1 prefab and spawns two distinct buildings sharing recipes', () => {
			const registry = new ScenePrefabRegistryV1();
			const { prefab, recipes } = buildStudioApartmentPrefabV1();

			registry.registerPrefab(prefab);
			for (const r of recipes) {
				registry.registerRecipe(r);
			}

			// Spawn Building 1 at [0, 0, 0]
			const b1 = registry.compilePrefab(prefab.prefabId, {
				caseId: '11111111-2222-4333-8444-555555555555',
				sceneId: '99999999-8888-4777-8666-555555555555',
				rootPosition: [0, 0, 0]
			});

			// Spawn Building 2 at [20, 0, 0]
			const b2 = registry.compilePrefab(prefab.prefabId, {
				caseId: '11111111-2222-4333-8444-555555555555',
				sceneId: '99999999-8888-4777-8666-555555555555',
				rootPosition: [20, 0, 0]
			});

			expect(b1.spawnedObjects.length).toBe(7); // floor, 2 walls, table, 2 chairs, light
			expect(b2.spawnedObjects.length).toBe(7);

			// Both buildings share the exact same recipes
			expect(b1.spawnedObjects[0].recipeId).toBe(b2.spawnedObjects[0].recipeId);

			// But have distinct object identities and distinct world positions
			expect(b1.spawnedObjects[0].objectId).not.toBe(b2.spawnedObjects[0].objectId);
			expect(b1.spawnedObjects[0].transform.position[0]).toBe(0);
			expect(b2.spawnedObjects[0].transform.position[0]).toBe(20);
		});
	});

	describe('validateProposedScenePlanV1', () => {
		it('rejects null or non-object proposed plans', () => {
			const res = validateProposedScenePlanV1(null);
			expect(res.valid).toBe(false);
			expect(res.error).toBe('PROPOSED_PLAN_NOT_AN_OBJECT');
		});

		it('rejects plans attempting to claim calibrated coordinates without human review', () => {
			const unverified = {
				schema: 'parent-atlas.scene-generation-plan/v1',
				planHash: 'a'.repeat(64),
				environment: {
					kind: 'studio',
					coordinateStatus: 'calibrated_metric' // FORBIDDEN for unverified model proposals
				}
			};
			const res = validateProposedScenePlanV1(unverified);
			expect(res.valid).toBe(false);
		});
	});

	describe('Scanline Polygon Rasterizer & Valkey Scene Cache Keys', () => {
		it('rasterizes ear-clipped triangles row-by-row via scanline spans and rejects self-intersecting polygons', () => {
			const result = rasterizeSimplePolygonScanlineV1({
				width: 10,
				height: 10,
				polygon: [
					[2, 2],
					[6, 2],
					[6, 6],
					[2, 6]
				],
				coordinateSpace: 'IMAGE_PIXELS'
			});

			expect(result.pixelOrigin).toBe('TOP_LEFT');
			expect(result.coverage[4 * 10 + 4]).toBe(255);
			expect(result.coverage[0]).toBe(0);
			expect(result.coverage[8 * 10 + 8]).toBe(0);

			// Bowtie / self-intersecting polygon must throw via triangulateSimplePolygonV1
			expect(() =>
				rasterizeSimplePolygonScanlineV1({
					width: 10,
					height: 10,
					polygon: [
						[1, 1],
						[8, 8],
						[8, 1],
						[1, 8]
					],
					coordinateSpace: 'IMAGE_PIXELS'
				})
			).toThrow();
		});

		it('validates PaletteArtifactRefV1 and produces isolated Valkey scene cache keys', () => {
			const shaA = 'a'.repeat(64);
			const shaB = 'b'.repeat(64);

			const ref = paletteArtifactRefV1Schema.parse({
				assetId: '11111111-2222-4333-8444-555555555555',
				sceneRevision: 3,
				sourceSha256: shaA,
				artifactSha256: shaB,
				paletteRevision: 'atlas-indexed-palette16-v1',
				byteLength: 8192,
				storage: {
					bucket: 'atlas-artifacts',
					objectKey: `derived/palettes/${shaB}.bin`
				}
			});

			expect(ref.byteLength).toBe(8192);
			expect(sceneValkeyCacheKeysV1.recipe(shaA)).toBe(`pa:scene:recipe:v1:${shaA}`);
			expect(sceneValkeyCacheKeysV1.cell(shaA, 'cell_10_12', 'balanced')).toBe(`pa:scene:cell:v1:${shaA}:cell_10_12:balanced`);
			expect(sceneValkeyCacheKeysV1.palette(shaB)).toBe(`pa:scene:palette:v1:${shaB}`);
		});

		it('flushes 8-row strip scanline queues into canonical low-nibble-first IndexedTexture4BppV1 and caches in N64 tile budget LRU', () => {
			const queue = new BoundedScanlineQueueV1(128);
			// Enqueue two polygons with distinct palette indices (5 = Umber, 12 = Rust)
			queue.enqueue({
				polygon: [
					[0, 0],
					[8, 0],
					[8, 8],
					[0, 8]
				],
				paletteIndex: 5
			});
			queue.enqueue({
				polygon: [
					[8, 8],
					[16, 8],
					[16, 16],
					[8, 16]
				],
				paletteIndex: 12
			});

			expect(queue.size).toBe(2);
			const flushed = queue.flushTo4Bpp(16, 16, 8);
			expect(queue.size).toBe(0); // Reset after flush (`nqt = 0`)
			expect(flushed.jobsProcessed).toBe(2);
			expect(flushed.stripsProcessed).toBe(2); // 16 rows / 8 rows per strip = 2 strips
			expect(flushed.packed4Bpp.byteLength).toBe(128); // 16*16 / 2 = 128 bytes

			// Directly decode through existing canonical indexed-palette-texture-v1.ts
			const rgba = decodeIndexed4BppToRgbaV1(flushed.texture4Bpp);
			expect(rgba.length).toBe(16 * 16 * 4);

			// Top-left pixel (2, 2) -> Umber (index 5)
			const pTopLeft = (2 * 16 + 2) * 4;
			expect([rgba[pTopLeft], rgba[pTopLeft + 1], rgba[pTopLeft + 2], rgba[pTopLeft + 3]]).toEqual([
				...INDEXED_PALETTE16_V1[5].rgba
			]);

			// Bottom-right pixel (12, 12) -> Rust (index 12)
			const pBottomRight = (12 * 16 + 12) * 4;
			expect([rgba[pBottomRight], rgba[pBottomRight + 1], rgba[pBottomRight + 2], rgba[pBottomRight + 3]]).toEqual([
				...INDEXED_PALETTE16_V1[12].rgba
			]);

			// Store in N64 8 MiB tile budget LRU cache
			const tileCache = createTileBudgetCacheV1<IndexedTexture4BppV1>(1024);
			tileCache.put('tile:studio:mask0', flushed.texture4Bpp, flushed.packed4Bpp.byteLength);
			expect(tileCache.get('tile:studio:mask0')?.pixelCount).toBe(256);
			expect(tileCache.stats().bytes).toBe(128);
		});
	});
});
