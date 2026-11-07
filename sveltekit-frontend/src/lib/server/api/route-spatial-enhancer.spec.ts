import { describe, it, expect } from 'vitest';
import {
	computeMorton30,
	mortonRadixSort,
	encodeActiveSlotBitset,
	decodeActiveSlotBitset,
	packKeyframeChunksToBuffer,
	unpackKeyframeBuffer,
	quantizeFloatToInt8,
	dequantizeInt8ToFloat,
	quantizePositionsToInt8Buffer,
	packInt4Nibbles,
	unpackInt4Nibbles,
	HyperLogLogSketch64B,
	reconcileSpatialKeyframe,
	ALIGNED_KEYFRAME_CHUNK_SIZE,
	AVX2_VECTOR_BYTES,
	AVX512_VECTOR_BYTES,
	type KeyframeChunk
} from './route-spatial-enhancer.js';

describe('Route Spatial Enhancer & SIMD Radix Bridge', () => {
	it('computes 30-bit Morton code correctly along the 3D Z-order curve', () => {
		const codeOrigin = computeMorton30(0, 0, 0);
		expect(codeOrigin).toBeGreaterThanOrEqual(0);
		expect(codeOrigin).toBeLessThanOrEqual(0x3fffffff); // 30 bits max

		const codeA = computeMorton30(-50, -50, -50);
		const codeB = computeMorton30(50, 50, 50);
		expect(codeA).toBeLessThan(codeB);
	});

	it('sorts keyframe chunks by Morton code using radix/Z-curve order', () => {
		const chunks: KeyframeChunk[] = [
			{
				mortonCode: 500,
				slotIndex: 0,
				clusterId: 1,
				position: [10, 10, 10],
				rot6d: [1, 0, 0, 0, 1, 0],
				scale: [1, 1, 1],
				flags: 1,
				reserved: 0
			},
			{
				mortonCode: 120,
				slotIndex: 1,
				clusterId: 0,
				position: [2, 2, 2],
				rot6d: [1, 0, 0, 0, 1, 0],
				scale: [1, 1, 1],
				flags: 1,
				reserved: 0
			},
			{
				mortonCode: 999,
				slotIndex: 2,
				clusterId: 2,
				position: [20, 20, 20],
				rot6d: [1, 0, 0, 0, 1, 0],
				scale: [1, 1, 1],
				flags: 1,
				reserved: 0
			}
		];

		const sorted = mortonRadixSort(chunks);
		expect(sorted[0].mortonCode).toBe(120);
		expect(sorted[1].mortonCode).toBe(500);
		expect(sorted[2].mortonCode).toBe(999);
	});

	it('encodes and decodes 256-bit active slot occupancy masks across hex, base64, and bitstring', () => {
		const activeSlots = [0, 1, 2, 63, 64, 127, 128, 255];
		const encoded = encodeActiveSlotBitset(activeSlots);

		expect(encoded.popcount).toBe(8);
		expect(encoded.activeSlots).toEqual(activeSlots);
		expect(encoded.bitsetString.length).toBe(256);
		expect(encoded.hexString.length).toBe(64); // 32 bytes = 64 hex characters

		// Bit 0, 1, 2, 63 should be '1'
		expect(encoded.bitsetString[0]).toBe('1');
		expect(encoded.bitsetString[1]).toBe('1');
		expect(encoded.bitsetString[2]).toBe('1');
		expect(encoded.bitsetString[63]).toBe('1');
		expect(encoded.bitsetString[64]).toBe('1');

		// Roundtrip decode from bitstring
		const decodedFromStr = decodeActiveSlotBitset(encoded.bitsetString);
		expect(decodedFromStr.activeSlots).toEqual(activeSlots);
		expect(decodedFromStr.popcount).toBe(8);

		// Roundtrip decode from hex
		const decodedFromHex = decodeActiveSlotBitset(encoded.hexString);
		expect(decodedFromHex.activeSlots).toEqual(activeSlots);

		// Roundtrip decode from base64
		const decodedFromB64 = decodeActiveSlotBitset(encoded.base64String);
		expect(decodedFromB64.activeSlots).toEqual(activeSlots);
	});

	it('enforces 64-byte chunk sizing matching AVX2 (2 instructions) and AVX-512 (1 instruction)', () => {
		expect(ALIGNED_KEYFRAME_CHUNK_SIZE).toBe(64);
		expect(AVX2_VECTOR_BYTES).toBe(32);   // 256 bits = 32 bytes (2 * 32 = 64)
		expect(AVX512_VECTOR_BYTES).toBe(64); // 512 bits = 64 bytes (1 * 64 = 64)

		const sampleChunk: KeyframeChunk = {
			mortonCode: 42100,
			slotIndex: 5,
			clusterId: 2,
			position: [41.213, 0.03, -2.107],
			rot6d: [0.99, 0.01, 0, 0, 0.99, 0.01],
			scale: [1.2, 0.91, 0.66],
			flags: 1,
			reserved: 0
		};

		const buf = packKeyframeChunksToBuffer([sampleChunk]);
		expect(buf.length).toBe(64);

		const unpacked = unpackKeyframeBuffer(buf);
		expect(unpacked.length).toBe(1);
		expect(unpacked[0].mortonCode).toBe(42100);
		expect(unpacked[0].slotIndex).toBe(5);
		expect(unpacked[0].clusterId).toBe(2);
		expect(unpacked[0].position[0]).toBeCloseTo(41.213, 3);
		expect(unpacked[0].position[1]).toBeCloseTo(0.03, 2);
		expect(unpacked[0].position[2]).toBeCloseTo(-2.107, 3);
		expect(unpacked[0].scale[0]).toBeCloseTo(1.2, 2);
		expect(unpacked[0].scale[1]).toBeCloseTo(0.91, 2);
		expect(unpacked[0].scale[2]).toBeCloseTo(0.66, 2);
	});

	it('reconciles spatial keyframe telemetry and reports SIMD metrics', async () => {
		const positions = [
			41.213, 0.030, -2.107, // Item 0
			12.500, 1.200, -0.500  // Item 1
		];

		const result = await reconcileSpatialKeyframe({
			caseId: '0192fe63-9524-7f12-8756-3240590a294c',
			sceneId: '2007b040-8b33-4613-8fb8-72f90c8c5317',
			titleId: 'test-hallway-splat',
			revisionId: 1,
			sourceSha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
			rawPositions: positions,
			writeToDb: false // Dry-run / cache only
		});

		expect(result.sceneId).toBe('2007b040-8b33-4613-8fb8-72f90c8c5317');
		expect(result.activeSlotCount).toBe(2);
		expect(result.simdMetrics.chunkCount).toBe(2);
		expect(result.simdMetrics.totalBytes).toBe(128); // 2 * 64
		expect(result.simdMetrics.avx2Instructions).toBe(4); // 2 chunks * 2
		expect(result.simdMetrics.avx512Instructions).toBe(2); // 2 chunks * 1
		expect(result.status).toBe('CACHED');
		expect(result.keyframeRecord.int8QuantizedCoords).toBeInstanceOf(Buffer);
		expect(result.keyframeRecord.int8QuantizedCoords.length).toBe(6); // 2 points * 3 axes = 6 bytes
		expect(result.keyframeRecord.int4QuantizedScores).toBeInstanceOf(Buffer);
		expect(result.keyframeRecord.int4QuantizedScores.length).toBe(2); // 2 chunks * 2 nibbles = 4 nibbles = 2 bytes
		expect(result.keyframeRecord.hyperloglogSketch).toBeInstanceOf(Buffer);
		expect(result.keyframeRecord.hyperloglogSketch.length).toBe(64); // 64-byte HLL sketch
	});

	it('quantizes and dequantizes floats to unsigned 8-bit integers (Int8 compression)', () => {
		const val = 42.5;
		const q = quantizeFloatToInt8(val, -100, 100);
		expect(q).toBeGreaterThanOrEqual(0);
		expect(q).toBeLessThanOrEqual(255);

		const recovered = dequantizeInt8ToFloat(q, -100, 100);
		expect(recovered).toBeCloseTo(val, 0); // 8-bit quantization precision within ~0.8 unit
	});

	it('packs and unpacks 4-bit nibbles (Int4 compression, 2 values per byte)', () => {
		const originalNibbles = [0, 5, 9, 14, 15, 3];
		const packed = packInt4Nibbles(originalNibbles);
		expect(packed.length).toBe(3); // 6 nibbles = 3 bytes

		const unpacked = unpackInt4Nibbles(packed, originalNibbles.length);
		expect(unpacked).toEqual(originalNibbles);
	});

	it('estimates unique exhibit cardinality in O(1) space with 64-byte HyperLogLog sketch', () => {
		const hll = new HyperLogLogSketch64B();
		for (let i = 0; i < 50; i++) {
			hll.add(`exhibit:${i}`);
		}
		const estimate = hll.estimate();
		// HLL with m=64 has standard error ~1.04 / sqrt(64) = ~13%
		expect(estimate).toBeGreaterThanOrEqual(35);
		expect(estimate).toBeLessThanOrEqual(65);

		const buf = hll.toBuffer();
		expect(buf.length).toBe(64);

		const restored = HyperLogLogSketch64B.fromBuffer(buf);
		expect(restored.estimate()).toBe(estimate);
	});
});
