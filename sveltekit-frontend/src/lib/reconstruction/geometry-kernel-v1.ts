/**
 * Parent Atlas Geometry Kernel Capability Contract & Reference Implementation (v1)
 *
 * Implements the unified geometry kernel interface:
 * 1. `rasterizePolygonMask`: Point-in-polygon 8-bit binary mask rasterization.
 * 2. `packPalette4Bpp`: 4-bit packed nibble compression for retro/NES textures.
 * 3. `intersectBitsets`: Population count of bitwise AND for visibility/culling bitsets.
 *
 * Backends:
 * - `typescript`: Guaranteed baseline with exact byte parity and coordinate checking.
 * - `wasm-simd`: Optional browser worker SIMD layer (when available).
 * - `napi-cpp`: Optional server-side native AVX2 layer (when compiled).
 */

import { z } from 'zod';
import { triangulateSimplePolygonV1, type PolygonPointV1 } from '$lib/splat/polygon-prism-validation-v1.js';
import {
	INDEXED_PALETTE_TEXTURE_REVISION_V1,
	type IndexedTexture4BppV1
} from '$lib/splat/indexed-palette-texture-v1.js';

export interface GeometryKernelV1 {
	readonly backend: 'typescript' | 'wasm-simd' | 'napi-cpp';

	rasterizePolygonMask(
		polygon: Float32Array,
		width: number,
		height: number
	): Promise<Uint8Array>;

	packPalette4Bpp(
		pixels: Uint8Array
	): Promise<Uint8Array>;

	intersectBitsets(
		left: Uint32Array,
		right: Uint32Array
	): Promise<number>;
}

// ============================================================================
// TypeScript Reference Geometry Kernel (Scalar Baseline)
// ============================================================================

export class TypeScriptGeometryKernelV1 implements GeometryKernelV1 {
	readonly backend = 'typescript' as const;

	/**
	 * Rasterizes a 2D simple polygon into a binary mask (255 inside, 0 outside).
	 * Polygon is passed as flat [x0, y0, x1, y1, ...] in pixel space.
	 */
	async rasterizePolygonMask(
		polygon: Float32Array,
		width: number,
		height: number
	): Promise<Uint8Array> {
		if (width <= 0 || height <= 0 || !Number.isInteger(width) || !Number.isInteger(height)) {
			throw new RangeError(`invalid dimensions ${width}x${height}`);
		}
		const numPoints = polygon.length / 2;
		if (numPoints < 3) {
			throw new RangeError('polygon must have at least 3 points');
		}

		const mask = new Uint8Array(width * height);

		// Compute polygon bounding box
		let minX = width;
		let maxX = 0;
		let minY = height;
		let maxY = 0;

		for (let i = 0; i < numPoints; i++) {
			const px = polygon[i * 2 + 0];
			const py = polygon[i * 2 + 1];
			if (px < minX) minX = Math.floor(px);
			if (px > maxX) maxX = Math.ceil(px);
			if (py < minY) minY = Math.floor(py);
			if (py > maxY) maxY = Math.ceil(py);
		}

		// Clamp bounding box to image bounds
		const startX = Math.max(0, minX);
		const endX = Math.min(width - 1, maxX);
		const startY = Math.max(0, minY);
		const endY = Math.min(height - 1, maxY);

		// Ray-casting point-in-polygon per scanline inside bbox
		for (let y = startY; y <= endY; y++) {
			const py = y + 0.5; // pixel center
			const rowOffset = y * width;

			for (let x = startX; x <= endX; x++) {
				const px = x + 0.5;
				let inside = false;

				for (let i = 0, j = numPoints - 1; i < numPoints; j = i++) {
					const xi = polygon[i * 2 + 0];
					const yi = polygon[i * 2 + 1];
					const xj = polygon[j * 2 + 0];
					const yj = polygon[j * 2 + 1];

					const intersect = ((yi > py) !== (yj > py)) &&
						(px < ((xj - xi) * (py - yi)) / (yj - yi) + xi);

					if (intersect) inside = !inside;
				}

				if (inside) {
					mask[rowOffset + x] = 255;
				}
			}
		}

		return mask;
	}

	/**
	 * Packs 8-bit palette indices (0..15) into canonical low-nibble-first 4bpp bytes
	 * matching `indexed-palette-texture-v1.ts` (even pixel = low nibble, odd pixel = high nibble).
	 */
	async packPalette4Bpp(pixels: Uint8Array): Promise<Uint8Array> {
		const outLength = Math.ceil(pixels.length / 2);
		const packed = new Uint8Array(outLength);

		for (let i = 0; i < outLength; i++) {
			const p0 = pixels[i * 2] & 0x0f;
			const p1 = (i * 2 + 1 < pixels.length) ? (pixels[i * 2 + 1] & 0x0f) : 0;
			packed[i] = p0 | (p1 << 4);
		}

		return packed;
	}

	/**
	 * Computes population count of bitwise AND between two 32-bit bitsets.
	 */
	async intersectBitsets(left: Uint32Array, right: Uint32Array): Promise<number> {
		const minLen = Math.min(left.length, right.length);
		let count = 0;

		for (let i = 0; i < minLen; i++) {
			let val = (left[i] & right[i]) >>> 0;
			// Brian Kernighan popcount
			while (val > 0) {
				val &= val - 1;
				count++;
			}
		}

		return count;
	}
}

// ============================================================================
// Capability Detection & Registry
// ============================================================================

export interface GeometryKernelCapabilitiesV1 {
	availableBackends: ('typescript' | 'wasm-simd' | 'napi-cpp')[];
	activeBackend: 'typescript' | 'wasm-simd' | 'napi-cpp';
	hasSimdSupport: boolean;
	hasWebGpuSupport: boolean;
}

export function detectGeometryKernelCapabilities(): GeometryKernelCapabilitiesV1 {
	const backends: ('typescript' | 'wasm-simd' | 'napi-cpp')[] = ['typescript'];

	// Check WebGPU availability if in browser
	const hasWebGpuSupport = typeof navigator !== 'undefined' && 'gpu' in navigator;

	// In current workstation environment, TypeScript kernel is the certified baseline
	return {
		availableBackends: backends,
		activeBackend: 'typescript',
		hasSimdSupport: false,
		hasWebGpuSupport
	};
}

export function createGeometryKernelV1(backend: 'typescript' | 'wasm-simd' | 'napi-cpp' = 'typescript'): GeometryKernelV1 {
	if (backend === 'typescript') {
		return new TypeScriptGeometryKernelV1();
	}
	// Fall back to TypeScript baseline if requested accelerated backend is unbuilt
	return new TypeScriptGeometryKernelV1();
}

// ============================================================================
// Bounded Scanline Triangle / Polygon Mask Rasterizer (Reuses Ear-Clipper)
// ============================================================================

export type RasterMaskInputV1 = {
	width: number;
	height: number;
	polygon: readonly PolygonPointV1[];
	coordinateSpace: 'IMAGE_PIXELS' | 'SCENE_PREVIEW';
};

export type RasterMaskOutputV1 = {
	coverage: Uint8Array;
	width: number;
	height: number;
	pixelOrigin: 'TOP_LEFT';
};

/**
 * Validates and ear-clips the simple polygon via `triangulateSimplePolygonV1`,
 * then fills each triangle row-by-row using scanline edge-intersection spans.
 */
export function rasterizeSimplePolygonScanlineV1(input: RasterMaskInputV1): RasterMaskOutputV1 {
	const { width, height, polygon } = input;
	if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0 || width > 4096 || height > 4096) {
		throw new RangeError(`invalid raster mask dimensions: ${width}x${height}`);
	}

	// Validate topology and compute CCW ear-clipped triangles
	const indices = triangulateSimplePolygonV1(polygon);
	const coverage = new Uint8Array(width * height);

	// Fill each ear-clipped triangle via horizontal scanline spans
	for (let t = 0; t < indices.length; t += 3) {
		const p0 = polygon[indices[t + 0]];
		const p1 = polygon[indices[t + 1]];
		const p2 = polygon[indices[t + 2]];

		const minY = Math.max(0, Math.floor(Math.min(p0[1], p1[1], p2[1])));
		const maxY = Math.min(height - 1, Math.ceil(Math.max(p0[1], p1[1], p2[1])));

		const edges: [PolygonPointV1, PolygonPointV1][] = [
			[p0, p1],
			[p1, p2],
			[p2, p0]
		];

		for (let y = minY; y <= maxY; y++) {
			const scanY = y + 0.5;
			const intersections: number[] = [];

			for (const [a, b] of edges) {
				const y0 = a[1];
				const y1 = b[1];
				if ((y0 <= scanY && y1 > scanY) || (y1 <= scanY && y0 > scanY)) {
					const tEdge = (scanY - y0) / (y1 - y0);
					const xIntersect = a[0] + tEdge * (b[0] - a[0]);
					intersections.push(xIntersect);
				}
			}

			if (intersections.length >= 2) {
				intersections.sort((u, v) => u - v);
				const xStart = Math.max(0, Math.ceil(intersections[0] - 0.5));
				const xEnd = Math.min(width - 1, Math.floor(intersections[intersections.length - 1] - 0.5));
				const rowOffset = y * width;
				for (let x = xStart; x <= xEnd; x++) {
					coverage[rowOffset + x] = 255;
				}
			}
		}
	}

	return {
		coverage,
		width,
		height,
		pixelOrigin: 'TOP_LEFT'
	};
}

// ============================================================================
// SeaweedFS Palette Artifact Ref & Valkey Scene Cache Key Separation
// ============================================================================

export const paletteArtifactRefV1Schema = z.object({
	assetId: z.string().uuid(),
	sceneRevision: z.number().int().positive(),
	sourceSha256: z.string().regex(/^[0-9a-f]{64}$/i),
	artifactSha256: z.string().regex(/^[0-9a-f]{64}$/i),
	paletteRevision: z.string().min(1).max(100),
	byteLength: z.number().int().positive(),
	storage: z.object({
		bucket: z.string().min(1).max(100),
		objectKey: z.string().min(1).max(500)
	}).strict()
}).strict();

export type PaletteArtifactRefV1 = z.infer<typeof paletteArtifactRefV1Schema>;

/**
 * Builds deterministic Valkey cache keys for scene recipes, Morton cells, and 4bpp palettes.
 * Explicitly isolated from retrieval centroid vectors (`centroid-cache.ts`).
 */
export const sceneValkeyCacheKeysV1 = Object.freeze({
	recipe(recipeSha256: string): string {
		if (!/^[0-9a-f]{64}$/i.test(recipeSha256)) throw new Error('INVALID_RECIPE_SHA256');
		return `pa:scene:recipe:v1:${recipeSha256.toLowerCase()}`;
	},
	cell(sceneRevisionHash: string, cellId: string, lod: 'retro' | 'balanced' | 'detailed'): string {
		if (!/^[0-9a-f]{64}$/i.test(sceneRevisionHash)) throw new Error('INVALID_SCENE_REVISION_HASH');
		if (!/^[a-zA-Z0-9_:-]{1,64}$/.test(cellId)) throw new Error('INVALID_CELL_ID');
		return `pa:scene:cell:v1:${sceneRevisionHash.toLowerCase()}:${cellId}:${lod}`;
	},
	palette(artifactSha256: string): string {
		if (!/^[0-9a-f]{64}$/i.test(artifactSha256)) throw new Error('INVALID_PALETTE_ARTIFACT_SHA256');
		return `pa:scene:palette:v1:${artifactSha256.toLowerCase()}`;
	}
});

// ============================================================================
// Bounded 8-Row Strip Scanline Queue (`QT / QCAP` & `raster_job` Adaptation)
// Directly outputs canonical low-nibble-first `IndexedTexture4BppV1`
// compatible with `indexed-palette-shader-v1.ts` (`NearestFilter`, `generateMipmaps = false`).
// ============================================================================

function setLowNibbleFirst(packed: Uint8Array, pixelIndex: number, value: number): void {
	const idx = pixelIndex >>> 1;
	const nib = value & 0x0f;
	if ((pixelIndex & 1) === 0) {
		// Even pixel occupies low nibble (bits 0..3)
		packed[idx] = (packed[idx] & 0xf0) | nib;
	} else {
		// Odd pixel occupies high nibble (bits 4..7)
		packed[idx] = (packed[idx] & 0x0f) | (nib << 4);
	}
}

export interface QueuedPolygonJobV1 {
	polygon: readonly PolygonPointV1[];
	paletteIndex: number; // 0..15
}

export class BoundedScanlineQueueV1 {
	private readonly queue: QueuedPolygonJobV1[] = [];

	constructor(public readonly capacity = 4096) {
		if (!Number.isInteger(capacity) || capacity < 1 || capacity > 70_000) {
			throw new RangeError('queue capacity must be 1..70000');
		}
	}

	get size(): number {
		return this.queue.length;
	}

	enqueue(job: QueuedPolygonJobV1): void {
		if (this.queue.length >= this.capacity) {
			throw new RangeError(`scanline queue capacity (${this.capacity}) exceeded`);
		}
		if (!Number.isInteger(job.paletteIndex) || job.paletteIndex < 0 || job.paletteIndex > 15) {
			throw new RangeError('paletteIndex must be 0..15');
		}
		// Validate polygon upfront
		triangulateSimplePolygonV1(job.polygon);
		this.queue.push(job);
	}

	/**
	 * Flushes the queue across 8-row horizontal framebuffer strips (`stripHeight = 8`),
	 * producing a canonical low-nibble-first `IndexedTexture4BppV1` and resetting the queue (`nqt = 0`).
	 */
	flushTo4Bpp(width: number, height: number, stripHeight = 8): {
		packed4Bpp: Uint8Array;
		texture4Bpp: IndexedTexture4BppV1;
		jobsProcessed: number;
		stripsProcessed: number;
	} {
		if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0 || width > 2048 || height > 2048) {
			throw new RangeError(`invalid target dimensions: ${width}x${height}`);
		}
		const pixelCount = width * height;
		const packed4Bpp = new Uint8Array(Math.ceil(pixelCount / 2));
		const jobsProcessed = this.queue.length;
		const makeTexture = (): IndexedTexture4BppV1 =>
			Object.freeze({
				format: INDEXED_PALETTE_TEXTURE_REVISION_V1,
				width,
				height,
				paletteRevision: INDEXED_PALETTE_TEXTURE_REVISION_V1,
				packedIndices: packed4Bpp,
				pixelCount
			});

		if (jobsProcessed === 0) {
			return { packed4Bpp, texture4Bpp: makeTexture(), jobsProcessed: 0, stripsProcessed: 0 };
		}

		// Pre-triangulate queued jobs
		const compiled = this.queue.map((job) => ({
			polygon: job.polygon,
			indices: triangulateSimplePolygonV1(job.polygon),
			paletteIndex: job.paletteIndex
		}));

		const numStrips = Math.ceil(height / stripHeight);

		// Process 8-row horizontal strips (cache-friendly scanline partitioning)
		for (let strip = 0; strip < numStrips; strip++) {
			const stripYStart = strip * stripHeight;
			const stripYEnd = Math.min(height - 1, stripYStart + stripHeight - 1);

			for (const item of compiled) {
				const { polygon, indices, paletteIndex } = item;
				for (let t = 0; t < indices.length; t += 3) {
					const p0 = polygon[indices[t + 0]];
					const p1 = polygon[indices[t + 1]];
					const p2 = polygon[indices[t + 2]];

					const triMinY = Math.max(stripYStart, Math.floor(Math.min(p0[1], p1[1], p2[1])));
					const triMaxY = Math.min(stripYEnd, Math.ceil(Math.max(p0[1], p1[1], p2[1])));
					if (triMinY > triMaxY) continue;

					const edges: [PolygonPointV1, PolygonPointV1][] = [
						[p0, p1],
						[p1, p2],
						[p2, p0]
					];

					for (let y = triMinY; y <= triMaxY; y++) {
						const scanY = y + 0.5;
						const intersections: number[] = [];

						for (const [a, b] of edges) {
							const y0 = a[1];
							const y1 = b[1];
							if ((y0 <= scanY && y1 > scanY) || (y1 <= scanY && y0 > scanY)) {
								const tEdge = (scanY - y0) / (y1 - y0);
								intersections.push(a[0] + tEdge * (b[0] - a[0]));
							}
						}

						if (intersections.length >= 2) {
							intersections.sort((u, v) => u - v);
							const xStart = Math.max(0, Math.ceil(intersections[0] - 0.5));
							const xEnd = Math.min(width - 1, Math.floor(intersections[intersections.length - 1] - 0.5));
							const rowOffset = y * width;
							for (let x = xStart; x <= xEnd; x++) {
								setLowNibbleFirst(packed4Bpp, rowOffset + x, paletteIndex);
							}
						}
					}
				}
			}
		}

		// Reset queue (`nqt = 0`)
		this.queue.length = 0;

		return {
			packed4Bpp,
			texture4Bpp: makeTexture(),
			jobsProcessed,
			stripsProcessed: numStrips
		};
	}
}


