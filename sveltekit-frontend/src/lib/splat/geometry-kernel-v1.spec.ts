import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import {
	createTypeScriptGeometryKernelV1,
	probeBackendCapabilitiesV1
} from './geometry-kernel-v1.js';

describe('BackendCapabilityRegistry & GeometryKernelV1', () => {
	it('probes runtime capabilities with deterministic fallback to typescript', () => {
		const report = probeBackendCapabilitiesV1({ napiAvailable: false });
		expect(report.supported.typescript).toBe(true);
		expect(['typescript', 'wasm-simd']).toContain(report.activeBackend);
	});

	it('rasterizes polygon mask, packs 4bpp low-nibble-first, and intersects bitsets', async () => {
		const kernel = createTypeScriptGeometryKernelV1();

		// Square covering [0.25, 0.75] x [0.25, 0.75] on 4x4 grid -> center 2x2 pixels = 4 lit
		const square = new Float32Array([0.25, 0.25, 0.75, 0.25, 0.75, 0.75, 0.25, 0.75]);
		const mask = await kernel.rasterizePolygonMask(square, 4, 4);
		expect(mask.length).toBe(16);
		const litCount = mask.reduce((acc, v) => acc + (v === 255 ? 1 : 0), 0);
		expect(litCount).toBe(4);

		// Low-nibble-first 4bpp packing: [3, 12, 5] -> [0xc3, 0x05]
		const packed = await kernel.packPalette4Bpp(new Uint8Array([3, 12, 5]));
		expect(Array.from(packed)).toEqual([0xc3, 0x05]);
		await expect(kernel.packPalette4Bpp(new Uint8Array([16]))).rejects.toThrow(
			/NIBBLE_VALUE_OUT_OF_RANGE/
		);

		// Bitset intersection popcount
		const a = new Uint32Array([0b10110000, 0x0000ffff]);
		const b = new Uint32Array([0b10101111, 0x00000f0f]);
		expect(await kernel.intersectBitsets(a, b)).toBe(2 + 8);
	});

	it('matches nes_lut::match_mask_scalar/avx2 LSB-first 32-bit word layout and .okf ABI contract', async () => {
		const abi = JSON.parse(
			readFileSync(
				resolve(process.cwd(), '../docs/contracts/nes-lut-4bpp-binary-abi.okf.json'),
				'utf8'
			)
		) as {
			schema: string;
			nesLutFilter: { maxAllowed: number; bitOrder: string };
			palette4Bpp: { nibbleOrder: string };
		};
		expect(abi.schema).toBe('atlas.nes_lut_4bpp_binary_abi.v1');
		expect(abi.nesLutFilter.maxAllowed).toBe(16);
		expect(abi.nesLutFilter.bitOrder).toBe('LSB_FIRST');
		expect(abi.palette4Bpp.nibbleOrder).toBe('LOW_NIBBLE_FIRST');

		const kernel = createTypeScriptGeometryKernelV1();
		const lut = new Uint8Array(35);
		lut[0] = 7;
		lut[3] = 12;
		lut[31] = 7;
		lut[34] = 12;
		const mask = await kernel.matchNesLutMask(lut, new Uint8Array([7, 12]));
		expect(mask.length).toBe(2);
		expect(mask[0]! >>> 0).toBe(((1 << 0) | (1 << 3) | (1 << 31)) >>> 0);
		expect(mask[1]! >>> 0).toBe(1 << 2);

		await expect(kernel.matchNesLutMask(lut, new Uint8Array([]))).rejects.toThrow(
			/NES_LUT_ALLOWED_COUNT_INVALID/
		);
		await expect(kernel.matchNesLutMask(lut, new Uint8Array([7, 7]))).rejects.toThrow(
			/NES_LUT_ALLOWED_DUPLICATE/
		);
	});

	it('verifies bit-identical N-API tensorrt_bridge.node matchNesLutMask parity with TypeScript oracle', async () => {
		const addonCandidates = [
			resolve(process.cwd(), '../simd-bridge/cpp/build-x64-cuda/Release/tensorrt_bridge.node'),
			resolve(process.cwd(), '../simd-bridge/cpp/build-x64-fallback/Release/tensorrt_bridge.node'),
			resolve(process.cwd(), '../simd-bridge/build/Release/tensorrt_bridge.node')
		];
		const addonPath = addonCandidates.find((p) => existsSync(p));
		expect(addonPath).toBeTruthy();

		const require = createRequire(import.meta.url);
		const addon = require(addonPath!) as {
			nesLutSupportsAvx2?: () => number;
			matchNesLutMask?: (
				lut: Uint8Array,
				allowed: Uint8Array,
				forceScalar?: number,
				out?: Uint32Array
			) => Uint32Array;
			batchCosineTopKMasked?: (
				query: Float32Array,
				corpus: Float32Array,
				n: number,
				dim: number,
				k: number,
				activeMask: Uint32Array,
				outIndices?: Int32Array,
				outScores?: Float32Array
			) => {
				indices: Int32Array;
				scores: Float32Array;
				count: number;
				evaluatedCount: number;
				backend: string;
			};
		};
		expect(typeof addon.nesLutSupportsAvx2).toBe('function');
		expect(typeof addon.matchNesLutMask).toBe('function');
		expect(typeof addon.batchCosineTopKMasked).toBe('function');

		const kernel = createTypeScriptGeometryKernelV1();
		const lut = new Uint8Array(103);
		for (let i = 0; i < lut.length; i++) lut[i] = (i * 7 + 3) & 0x1f;
		const allowed = new Uint8Array([3, 10, 17, 24, 31]);

		const tsMask = await kernel.matchNesLutMask(lut, allowed);
		const nativeMask = addon.matchNesLutMask!(lut, allowed, 0);
		const nativeScalar = addon.matchNesLutMask!(lut, allowed, 1);
		const preallocOut = new Uint32Array(tsMask.length);
		const returnedOut = addon.matchNesLutMask!(lut, allowed, 0, preallocOut);

		expect(returnedOut).toBe(preallocOut);
		expect(Array.from(preallocOut)).toEqual(Array.from(tsMask));
		expect(Array.from(nativeMask)).toEqual(Array.from(tsMask));
		expect(Array.from(nativeScalar)).toEqual(Array.from(tsMask));
		expect(() => addon.matchNesLutMask!(lut, new Uint8Array([]))).toThrow(/NES_LUT_ALLOWED_COUNT_INVALID/);
		expect(() => addon.matchNesLutMask!(lut, new Uint8Array([7, 7]))).toThrow(/NES_LUT_ALLOWED_DUPLICATE/);

		// Bitset-filtered Top-K with caller-owned output buffers (zero-alloc fast path)
		const query = new Float32Array([1, 0, 0]);
		// 4 candidates: idx 0=[1,0,0] (masked OUT), idx 1=[0.6,0.8,0], idx 2=[0.9,0.1,0], idx 3=[0,1,0] (masked OUT)
		const corpus = new Float32Array([1, 0, 0, 0.6, 0.8, 0, 0.9, 0.1, 0, 0, 1, 0]);
		const activeMask = new Uint32Array([(1 << 1) | (1 << 2)]);
		const outIdx = new Int32Array(2);
		const outScores = new Float32Array(2);
		const topk = addon.batchCosineTopKMasked!(query, corpus, 4, 3, 2, activeMask, outIdx, outScores);
		expect(topk.backend).toBe('cpu_masked_bitset');
		expect(topk.evaluatedCount).toBe(2);
		expect(topk.count).toBe(2);
		expect(topk.indices).toBe(outIdx);
		expect(topk.scores).toBe(outScores);
		expect(Array.from(outIdx)).toEqual([2, 1]);
		expect(outScores[0]!).toBeGreaterThan(outScores[1]!);
	});
});
