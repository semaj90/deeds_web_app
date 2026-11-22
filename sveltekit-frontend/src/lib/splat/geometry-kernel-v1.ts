/**
 * Parent Atlas Backend Capability Registry & Geometry Kernel Contract (v1)
 *
 * Unifies scalar TypeScript, WASM SIMD, WebGPU, and optional N-API C++ execution
 * behind a single deterministic ABI and fallback registry without creating a
 * competing scene or database authority.
 */

export type GeometryBackendKindV1 = 'typescript' | 'wasm-simd' | 'napi-cpp' | 'webgpu';

export interface BackendCapabilityReportV1 {
	readonly activeBackend: GeometryBackendKindV1;
	readonly supported: Readonly<Record<GeometryBackendKindV1, boolean>>;
	readonly details: {
		readonly webAssembly: boolean;
		readonly wasmSimd: boolean;
		readonly webGpu: boolean;
		readonly napiAddon: boolean;
	};
}

// Minimal valid 1-function WASM module containing a v128.const SIMD instruction
const WASM_SIMD_PROBE_BYTES = new Uint8Array([
	0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
	0x01, 0x05, 0x01, 0x60, 0x00, 0x01, 0x7b,
	0x03, 0x02, 0x01, 0x00,
	0x0a, 0x16, 0x01, 0x14, 0x00, 0xfd, 0x0c,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0x0b
]);

export function probeBackendCapabilitiesV1(options: { napiAvailable?: boolean } = {}): BackendCapabilityReportV1 {
	const webAssembly = typeof WebAssembly === 'object' && typeof WebAssembly.validate === 'function';
	let wasmSimd = false;
	if (webAssembly) {
		try {
			wasmSimd = WebAssembly.validate(WASM_SIMD_PROBE_BYTES);
		} catch {
			wasmSimd = false;
		}
	}
	const webGpu = typeof navigator !== 'undefined' && 'gpu' in navigator;
	const napiAddon = options.napiAvailable ?? false;

	const activeBackend: GeometryBackendKindV1 = napiAddon
		? 'napi-cpp'
		: wasmSimd
			? 'wasm-simd'
			: 'typescript';

	return {
		activeBackend,
		supported: {
			typescript: true,
			'wasm-simd': wasmSimd,
			'napi-cpp': napiAddon,
			webgpu: webGpu
		},
		details: {
			webAssembly,
			wasmSimd,
			webGpu,
			napiAddon
		}
	};
}

export interface GeometryKernelV1 {
	readonly backend: GeometryBackendKindV1;
	rasterizePolygonMask(polygon: Float32Array, width: number, height: number): Promise<Uint8Array>;
	packPalette4Bpp(pixels: Uint8Array): Promise<Uint8Array>;
	intersectBitsets(left: Uint32Array, right: Uint32Array): Promise<number>;
	matchNesLutMask(lut: Uint8Array, allowed: Uint8Array): Promise<Uint32Array>;
}

function pointInPolygon(x: number, y: number, polygon: Float32Array): boolean {
	const count = polygon.length >>> 1;
	let inside = false;
	for (let i = 0, j = count - 1; i < count; j = i++) {
		const xi = polygon[i * 2]!;
		const yi = polygon[i * 2 + 1]!;
		const xj = polygon[j * 2]!;
		const yj = polygon[j * 2 + 1]!;
		const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
		if (intersect) inside = !inside;
	}
	return inside;
}

function popcount32(x: number): number {
	let v = x >>> 0;
	v = v - ((v >>> 1) & 0x55555555);
	v = (v & 0x33333333) + ((v >>> 2) & 0x33333333);
	return (((v + (v >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
}

/**
 * Canonical scalar TypeScript reference implementation of GeometryKernelV1.
 * All accelerated WASM SIMD / N-API backends must match this exact byte output.
 */
export function createTypeScriptGeometryKernelV1(): GeometryKernelV1 {
	return {
		backend: 'typescript',

		async rasterizePolygonMask(polygon: Float32Array, width: number, height: number): Promise<Uint8Array> {
			if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 4096 || height > 4096) {
				throw new RangeError('RASTER_DIMENSIONS_INVALID');
			}
			if (polygon.length < 6 || polygon.length % 2 !== 0) {
				throw new RangeError('POLYGON_VERTICES_INVALID');
			}
			const mask = new Uint8Array(width * height);
			for (let py = 0; py < height; py++) {
				const ny = (py + 0.5) / height;
				for (let px = 0; px < width; px++) {
					const nx = (px + 0.5) / width;
					if (pointInPolygon(nx, ny, polygon)) {
						mask[py * width + px] = 255;
					}
				}
			}
			return mask;
		},

		async packPalette4Bpp(pixels: Uint8Array): Promise<Uint8Array> {
			const packed = new Uint8Array(Math.ceil(pixels.length / 2));
			for (let i = 0; i < pixels.length; i++) {
				const v = pixels[i]!;
				if (v > 15) {
					throw new RangeError('NIBBLE_VALUE_OUT_OF_RANGE');
				}
				packed[i >> 1] |= v << ((i & 1) * 4);
			}
			return packed;
		},

		async intersectBitsets(left: Uint32Array, right: Uint32Array): Promise<number> {
			if (left.length !== right.length) {
				throw new RangeError('BITSET_LENGTH_MISMATCH');
			}
			let total = 0;
			for (let i = 0; i < left.length; i++) {
				total += popcount32(left[i]! & right[i]!);
			}
			return total;
		},

		/**
		 * Exact TypeScript mirror of `nes_lut::match_mask_scalar` / `match_mask_avx2`
		 * in `simd-bridge/cpp/nes_lut_filter.h`:
		 * bit i of out[i >> 5] (LSB-first) is 1 iff lut[i] is in unique allowed[0..k), 1 <= k <= 16.
		 */
		async matchNesLutMask(lut: Uint8Array, allowed: Uint8Array): Promise<Uint32Array> {
			if (allowed.length === 0 || allowed.length > 16) {
				throw new RangeError('NES_LUT_ALLOWED_COUNT_INVALID');
			}
			const allowedSet = new Set<number>();
			for (let a = 0; a < allowed.length; a++) {
				const v = allowed[a]!;
				if (allowedSet.has(v)) {
					throw new RangeError('NES_LUT_ALLOWED_DUPLICATE');
				}
				allowedSet.add(v);
			}
			const words = Math.ceil(lut.length / 32);
			const out = new Uint32Array(words);
			for (let i = 0; i < lut.length; i++) {
				if (allowedSet.has(lut[i]!)) {
					out[i >> 5] |= (1 << (i & 31)) >>> 0;
				}
			}
			return out;
		}
	};
}
