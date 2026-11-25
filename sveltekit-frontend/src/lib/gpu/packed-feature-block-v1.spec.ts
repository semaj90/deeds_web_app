import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
	PFB1_HEADER_BYTES,
	decodePackedFeatureBlockV1,
	readBitWindowV1,
	readNibbleWindowV1,
	rotl32,
} from './packed-feature-block-v1.js';

function buildPfb1Fixture(opts: {
	featureMapRev: number;
	candidateCount: number;
	featureCount: number;
	bits: number[];
	nibbles: number[];
}): Uint8Array {
	const maskBytes = new Uint8Array(Math.ceil(opts.bits.length / 8));
	opts.bits.forEach((b, i) => {
		if (b) maskBytes[i >> 3] |= 1 << (i & 7);
	});
	const nibbleBytes = new Uint8Array(Math.ceil(opts.nibbles.length / 2));
	opts.nibbles.forEach((n, i) => {
		nibbleBytes[i >> 1] |= (n & 0x0f) << (i & 1 ? 4 : 0);
	});

	const maskSha = createHash('sha256').update(maskBytes).digest();
	const nibSha = createHash('sha256').update(nibbleBytes).digest();

	const out = new Uint8Array(PFB1_HEADER_BYTES + maskBytes.byteLength + nibbleBytes.byteLength);
	out.set([0x50, 0x46, 0x42, 0x31], 0); // 'PFB1'
	const view = new DataView(out.buffer);
	view.setUint32(4, 1, true);
	view.setUint32(8, opts.featureMapRev, true);
	view.setUint32(12, opts.candidateCount, true);
	view.setUint32(16, opts.featureCount, true);
	view.setBigUint64(24, BigInt(opts.bits.length), true);
	view.setBigUint64(32, BigInt(opts.nibbles.length), true);
	out.set(maskSha, 40);
	out.set(nibSha, 72);
	out.set(maskBytes, PFB1_HEADER_BYTES);
	out.set(nibbleBytes, PFB1_HEADER_BYTES + maskBytes.byteLength);
	return out;
}

describe('packed-feature-block-v1 (PFB1)', () => {
	it('decodes PFB1 and reads cross-byte bit and nibble sliding windows', async () => {
		const bits = [1, 0, 1, 1, 0, 0, 1, 0, 1, 1, 1, 0, 1, 0, 0, 1, 1];
		const nibbles = [3, 12, 7, 15, 5];
		const blob = buildPfb1Fixture({
			featureMapRev: 17,
			candidateCount: 2,
			featureCount: 9,
			bits,
			nibbles,
		});

		const decoded = await decodePackedFeatureBlockV1(blob, 17);
		expect(decoded.logicalBitCount).toBe(17);
		expect(decoded.nibbleCount).toBe(5);
		expect(readBitWindowV1(decoded.maskBytes, 5, 12, 17)).toEqual(bits.slice(5, 17));
		expect(readNibbleWindowV1(decoded.nibbleBytes, 1, 4, 5)).toEqual(nibbles.slice(1, 5));
	});

	it('rejects non-zero unused tail bits and matches rotl32', async () => {
		expect(rotl32(0x80000001, 1)).toBe(0x00000003);
		const blob = buildPfb1Fixture({
			featureMapRev: 17,
			candidateCount: 1,
			featureCount: 4,
			bits: [1, 0, 1],
			nibbles: [2, 9, 4],
		});
		blob[PFB1_HEADER_BYTES] |= 0x80;
		await expect(decodePackedFeatureBlockV1(blob)).rejects.toThrow(/UNUSED_TAIL_BITS_NON_ZERO/);
	});
});
