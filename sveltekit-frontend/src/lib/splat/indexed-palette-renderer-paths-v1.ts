import type { IndexedTexture4BppV1 } from './indexed-palette-texture-v1.js';

/**
 * Renderer paths for the packed 4bpp indexed-palette preview (openspec 11.45/11.46).
 *
 * Both GPU paths store the same packed bytes (R8 texture, low-nibble-first, row-major
 * pixel ordinal) and the same 16-entry palette. Only the shader language differs:
 *   - webgl2-glsl-packed : GLSL chunk injected through onBeforeCompile
 *   - webgpu-tsl-packed  : TSL node graph on a MeshStandardNodeMaterial
 *   - rgba-compat        : expanded RGBA CanvasTexture (no GPU storage saving)
 *
 * paletteIndexForPixelV1 is the CPU oracle for the shared index formula. Both shader
 * paths must reproduce it; the browser proof checks the rendered result.
 */

export const INDEXED_PALETTE_RENDERER_PATHS_REVISION_V1 = 'atlas-indexed-palette-renderer-paths-v1' as const;

export type IndexedPaletteRendererPathV1 = 'webgl2-glsl-packed' | 'webgpu-tsl-packed' | 'rgba-compat';

export type IndexedPaletteBackendV1 = 'webgl2' | 'webgpu' | 'unknown' | null;

/**
 * WebGL2 uses the GLSL path. WebGPU uses the TSL path when the TSL namespace is
 * available; otherwise it keeps the RGBA compatibility preview. Unknown backends
 * never get a packed shader, because the shader language is not known.
 */
export function selectIndexedPaletteRendererPathV1(
	backend: IndexedPaletteBackendV1,
	tslAvailable: boolean
): IndexedPaletteRendererPathV1 {
	if (backend === 'webgl2') return 'webgl2-glsl-packed';
	if (backend === 'webgpu' && tslAvailable) return 'webgpu-tsl-packed';
	return 'rgba-compat';
}

/** Human-readable status line for the demo; kept here so both paths report the same fields. */
export function describeIndexedPaletteRendererPathV1(
	path: IndexedPaletteRendererPathV1,
	packedWidth: number,
	packedHeight: number,
	gpuTexelBytes: number
): string {
	const size = `${packedWidth}×${packedHeight}`;
	switch (path) {
		case 'webgl2-glsl-packed':
			return `${size} · packed 4bpp GLSL shader · ${gpuTexelBytes.toLocaleString()} GPU texture texel bytes (driver allocation not measured)`;
		case 'webgpu-tsl-packed':
			return `${size} · packed 4bpp TSL shader · ${gpuTexelBytes.toLocaleString()} GPU texture texel bytes (driver allocation not measured)`;
		case 'rgba-compat':
			return `${size} · expanded RGBA fallback (no packed GPU storage)`;
	}
}

/**
 * CPU oracle for one pixel: row-major ordinal, byte = ordinal >> 1, even ordinal = low nibble.
 * Mirrors the GLSL and TSL formulas exactly; keep the three in sync.
 */
export function paletteIndexForPixelV1(indexed: IndexedTexture4BppV1, x: number, y: number): number {
	if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y)
		|| x < 0 || y < 0 || x >= indexed.width || y >= indexed.height) {
		throw new RangeError('INDEXED_PALETTE_ORACLE_PIXEL_OUT_OF_RANGE');
	}
	const ordinal = y * indexed.width + x;
	const packed = indexed.packedIndices[ordinal >> 1];
	return (ordinal & 1) === 0 ? packed & 0x0f : (packed >> 4) & 0x0f;
}
