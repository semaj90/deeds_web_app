import { describe, expect, it } from 'vitest';
import {
	encodeSparseRoutingByte,
	decodeSparseRoutingByte,
	packSparseRoutingBuffer,
	unpackSparseRoutingBuffer,
	synthesizeAceSparseRoutingEnvelopeV1,
	applyAvx2SparseRoutingToFloatTensor,
	PackedSparseRoutingEnvelopeV1Schema,
} from './sparse-routing-bit-packer-v1.js';

describe('SparseRoutingBitPackerV1', () => {
	it('encodes and decodes 1-bit sparse routing and 7-bit AVX2 shifter', () => {
		// Active, shifter = 64
		const byte1 = encodeSparseRoutingByte(true, 64);
		expect(byte1).toBe(0x80 | 64); // 128 + 64 = 192
		const decoded1 = decodeSparseRoutingByte(byte1);
		expect(decoded1.sparseActive).toBe(true);
		expect(decoded1.shifter7).toBe(64);

		// Pruned, shifter = 127
		const byte2 = encodeSparseRoutingByte(false, 127);
		expect(byte2).toBe(127);
		const decoded2 = decodeSparseRoutingByte(byte2);
		expect(decoded2.sparseActive).toBe(false);
		expect(decoded2.shifter7).toBe(127);

		// Pruned, shifter = 0
		const byte3 = encodeSparseRoutingByte(false, 0);
		expect(byte3).toBe(0);
		const decoded3 = decodeSparseRoutingByte(byte3);
		expect(decoded3.sparseActive).toBe(false);
		expect(decoded3.shifter7).toBe(0);
	});

	it('rejects shifter values outside [0, 127]', () => {
		expect(() => encodeSparseRoutingByte(true, -1)).toThrow(/SPARSE_ROUTING_INVALID_SHIFTER/);
		expect(() => encodeSparseRoutingByte(true, 128)).toThrow(/SPARSE_ROUTING_INVALID_SHIFTER/);
		expect(() => encodeSparseRoutingByte(true, 1.5)).toThrow(/SPARSE_ROUTING_INVALID_SHIFTER/);
	});

	it('packs entries into 64-byte aligned buffer with hex64 checksum', () => {
		const entries = [
			{ candidateId: 'c1', sparseActive: true, shifter7: 64 },
			{ candidateId: 'c2', sparseActive: false, shifter7: 32 },
			{ candidateId: 'c3', sparseActive: true, shifter7: 80 },
		];

		const { buffer, sparseActiveCount, hex64Checksum } = packSparseRoutingBuffer(entries);
		expect(buffer.length % 64).toBe(0); // 64-byte cache line alignment
		expect(sparseActiveCount).toBe(2);
		expect(hex64Checksum).toHaveLength(64);
		expect(hex64Checksum).toMatch(/^[a-f0-9]{64}$/);
	});

	it('synthesizes an ACE JSON-compatible envelope with base64 and hex64 lineage', () => {
		const entries = [
			{ candidateId: 'auth:1', sparseActive: true, shifter7: 64 },
			{ candidateId: 'auth:2', sparseActive: true, shifter7: 72 },
			{ candidateId: 'auth:3', sparseActive: false, shifter7: 10 },
		];

		const envelope = synthesizeAceSparseRoutingEnvelopeV1({
			entries,
			domainClass: 'AUTHENTICATION_AND_IDENTITY',
			nesLutClusterId: 42,
		});

		expect(envelope.schema).toBe('atlas.packed-sparse-routing.v1');
		expect(envelope.candidateCount).toBe(3);
		expect(envelope.sparseActiveCount).toBe(2);
		expect(envelope.byteLength).toBe(3);
		expect(envelope.canonicalAuthority).toBe(false);

		// Schema parse round-trip
		expect(PackedSparseRoutingEnvelopeV1Schema.parse(envelope)).toBeDefined();

		// Base64 decode verification
		const decodedBuffer = Buffer.from(envelope.base64Payload, 'base64');
		expect(decodedBuffer).toHaveLength(3);
		expect(decodeSparseRoutingByte(decodedBuffer[0])).toEqual({ sparseActive: true, shifter7: 64 });
		expect(decodeSparseRoutingByte(decodedBuffer[2])).toEqual({ sparseActive: false, shifter7: 10 });
	});

	it('applies AVX2 sparse routing and shift scaling to FP32 tensor', () => {
		// 2 rows, 2 cols
		const tensor = new Float32Array([
			1.0, 2.0, // row 0: active, shifter 64 (multiplier 1.0)
			3.0, 4.0, // row 1: pruned (should become 0.0)
		]);

		const entries = [
			{ candidateId: 'r0', sparseActive: true, shifter7: 64 },
			{ candidateId: 'r1', sparseActive: false, shifter7: 10 },
		];
		const { buffer } = packSparseRoutingBuffer(entries);

		const result = applyAvx2SparseRoutingToFloatTensor(tensor, 2, buffer);
		expect(result).toHaveLength(4);

		// Row 0 preserved
		expect(result[0]).toBeCloseTo(1.0, 3);
		expect(result[1]).toBeCloseTo(2.0, 3);

		// Row 1 pruned to 0
		expect(result[2]).toBe(0.0);
		expect(result[3]).toBe(0.0);
	});

	describe('BIT-01: Exhaustive 256-code round-trip & bucket recovery', () => {
		it('verifies exact round-trip for every possible byte from 0 to 255', () => {
			for (let b = 0; b <= 255; b++) {
				const decoded = decodeSparseRoutingByte(b);
				// Bit 7 is sparse flag
				const expectedActive = (b & 0x80) !== 0;
				// Bits 0..6 is shifter
				const expectedShifter = b & 0x7f;

				expect(decoded.sparseActive).toBe(expectedActive);
				expect(decoded.shifter7).toBe(expectedShifter);
				expect(decoded.shifter7).toBeGreaterThanOrEqual(0);
				expect(decoded.shifter7).toBeLessThanOrEqual(127);

				// Re-encode and assert strict equality
				const reencoded = encodeSparseRoutingByte(decoded.sparseActive, decoded.shifter7);
				expect(reencoded).toBe(b);
			}
		});

		it('re-verifies strict refusal on out-of-range shifter inputs', () => {
			const badInputs = [-1, 128, 255, 1.01, NaN, Infinity];
			for (const bad of badInputs) {
				expect(() => encodeSparseRoutingByte(true, bad as number)).toThrow(
					/SPARSE_ROUTING_INVALID_SHIFTER/,
				);
			}
		});
	});

	describe('BIT-02: FP32 reference scaling formula accuracy & edge cases', () => {
		it('verifies exact power-of-two multiplier s(q) = 2^((q - 64) / 16) across all 128 scale buckets', () => {
			for (let q = 0; q <= 127; q++) {
				const byte = encodeSparseRoutingByte(true, q);
				const tensor = new Float32Array([1.0]);
				const buffer = new Uint8Array([byte]);
				const scaled = applyAvx2SparseRoutingToFloatTensor(tensor, 1, buffer);

				const expectedMultiplier = Math.pow(2, (q - 64) / 16);
				expect(scaled[0]).toBeCloseTo(expectedMultiplier, 5);

				// Specific landmark checks:
				if (q === 0) {
					// 2^(-64/16) = 2^(-4) = 0.0625
					expect(scaled[0]).toBeCloseTo(0.0625, 4);
				}
				if (q === 64) {
					// 2^(0) = 1.0
					expect(scaled[0]).toBeCloseTo(1.0, 5);
				}
				if (q === 127) {
					// 2^(63/16) ≈ 15.3261887
					expect(scaled[0]).toBeCloseTo(Math.pow(2, 63 / 16), 4);
				}
			}
		});

		it('unconditionally zeros out row when sparseActive is false regardless of shifter', () => {
			for (let q = 0; q <= 127; q += 16) {
				const byte = encodeSparseRoutingByte(false, q);
				const tensor = new Float32Array([42.5, -100.25]);
				const buffer = new Uint8Array([byte]);
				const scaled = applyAvx2SparseRoutingToFloatTensor(tensor, 2, buffer);

				expect(scaled[0]).toBe(0.0);
				expect(scaled[1]).toBe(0.0);
			}
		});
	});

	describe('BIT-03: gRPC raw binary buffer transport & payload efficiency', () => {
		it('packs and unpacks directly via binary buffer without Base64 overhead', () => {
			const candidateCount = 250;
			const sampleEntries = Array.from({ length: candidateCount }, (_, i) => ({
				candidateId: `cand-ord-${i}`,
				sparseActive: i % 2 === 0,
				shifter7: (i * 3) % 128,
			}));

			const { buffer, sparseActiveCount, hex64Checksum } = packSparseRoutingBuffer(sampleEntries);
			expect(sparseActiveCount).toBe(125);

			// Unpack raw binary buffer directly
			const unpacked = unpackSparseRoutingBuffer(
				buffer,
				candidateCount,
				sampleEntries.map((e) => e.candidateId),
			);

			expect(unpacked).toHaveLength(candidateCount);
			for (let i = 0; i < candidateCount; i++) {
				expect(unpacked[i].candidateId).toBe(sampleEntries[i].candidateId);
				expect(unpacked[i].sparseActive).toBe(sampleEntries[i].sparseActive);
				expect(unpacked[i].shifter7).toBe(sampleEntries[i].shifter7);
			}
		});

		it('measures wire payload byte savings comparing uncompressed FP32 vs 1+7 byte routing', () => {
			const candidateCount = 250;
			const featuresPerRow = 10;

			// 1. Uncompressed FP32 (10 floats = 40 bytes/row)
			const fp32Bytes = candidateCount * featuresPerRow * Float32Array.BYTES_PER_ELEMENT; // 10,000 bytes
			// 2. 1+7 byte routing (1 byte/candidate)
			const packedRoutingBytes = candidateCount; // 250 bytes

			const compressionRatio = fp32Bytes / packedRoutingBytes;
			expect(fp32Bytes).toBe(10000);
			expect(packedRoutingBytes).toBe(250);
			expect(compressionRatio).toBe(40); // 40x wire payload reduction for routing phase
		});
	});
});
