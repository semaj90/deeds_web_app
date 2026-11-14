// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
	computeFrameDhash64V1,
	hammingDistance64V1,
	searchKeyframesByBitsetTopKV1,
	selectSceneCutKeyframesV1,
	sliceRawGray9x8StreamV1
} from './dhash-keyframe-filter-v1.js';

function makeHorizontalRampFrame(): Uint8Array {
	const buf = new Uint8Array(72);
	for (let row = 0; row < 8; row += 1) {
		for (let col = 0; col < 9; col += 1) {
			buf[row * 9 + col] = col * 16;
		}
	}
	return buf;
}

function makeFlatFrame(value = 42): Uint8Array {
	return new Uint8Array(72).fill(value);
}

describe('dhash-keyframe-filter-v1 (turbovec-napi native integration)', () => {
	it('computes 64-bit LSB horizontal gradient dHash via turbovec-napi and rejects invalid lengths', () => {
		const flat = computeFrameDhash64V1(makeFlatFrame());
		expect(flat.engine).toBe('turbovec-napi');
		expect(flat.dhashHex).toBe('0000000000000000');
		expect(flat.word64).toBe(0n);

		const ramp = computeFrameDhash64V1(makeHorizontalRampFrame());
		expect(ramp.engine).toBe('turbovec-napi');
		expect(ramp.dhashHex).toBe('ffffffffffffffff');
		expect(ramp.word64).toBe(0xffffffffffffffffn);

		expect(() => computeFrameDhash64V1(new Uint8Array(71))).toThrow('DHASH_INPUT_MUST_BE_72_BYTES');
	});

	it('suppresses near-duplicate frames (< 12 bits changed) and emits scene cuts (>= 12 bits)', () => {
		const baseFrame = makeFlatFrame(10);

		// Perturb only 1 row * 2 pairs = 2 gradient bits -> Hamming distance 2 (< 12, suppressed)
		const nearDuplicate = makeFlatFrame(10);
		nearDuplicate[1] = 80; // pair (0<1)=1
		nearDuplicate[3] = 80; // pair (2<3)=1

		// Full horizontal ramp -> 64 bits toggled vs flat frame (Hamming distance 64 >= 12, emitted)
		const cutFrame = makeHorizontalRampFrame();

		expect(hammingDistance64V1(0n, 0b101n)).toBe(2);

		const result = selectSceneCutKeyframesV1([
			{ frameIndex: 0, timestampMs: 0, gray9x8: baseFrame },
			{ frameIndex: 1, timestampMs: 333, gray9x8: nearDuplicate },
			{ frameIndex: 2, timestampMs: 667, gray9x8: cutFrame }
		]);

		expect(result.engine).toBe('turbovec-napi');
		expect(result.keyframes).toHaveLength(2);
		expect(result.keyframes[0]).toMatchObject({
			frameIndex: 0,
			timestampMs: 0,
			dhashHex: '0000000000000000',
			hammingFromPrev: 64
		});
		expect(result.keyframes[1]).toMatchObject({
			frameIndex: 2,
			timestampMs: 667,
			dhashHex: 'ffffffffffffffff',
			hammingFromPrev: 64
		});
		expect(result.corpusWordsLe.byteLength).toBe(16);
	});

	it('ranks 1-word dHash corpora and 12-word (768-bit) bitset corpora with ascending index tie-breaking', () => {
		const singleQuery = new BigUint64Array([0n]);
		const singleCorpus = new BigUint64Array([0b111n, 0b1n, 0b10n, 0xffffffffffffffffn]);
		expect(searchKeyframesByBitsetTopKV1(singleQuery, singleCorpus, 1, 3)).toEqual([
			{ index: 1, distance: 1 },
			{ index: 2, distance: 1 },
			{ index: 0, distance: 3 }
		]);

		const wordsPerVec = 12;
		const query768 = new BigUint64Array(wordsPerVec);
		const corpus768 = new BigUint64Array(5 * wordsPerVec);
		corpus768[0] = 0b1111n; // idx 0 -> dist 4
		corpus768[wordsPerVec] = 0b11n; // idx 1 -> dist 2
		corpus768[2 * wordsPerVec] = 0xffn; // idx 2 -> dist 8
		corpus768[3 * wordsPerVec] = 0b101n; // idx 3 -> dist 2 (tie with idx 1)
		corpus768[4 * wordsPerVec] = 0xffffffffffffffffn; // idx 4 -> dist 64

		expect(searchKeyframesByBitsetTopKV1(query768, corpus768, wordsPerVec, 3)).toEqual([
			{ index: 1, distance: 2 },
			{ index: 3, distance: 2 },
			{ index: 0, distance: 4 }
		]);
	});

	it('slices concatenated FFmpeg rawvideo 9x8 gray streams and filters scene cuts end-to-end', () => {
		const baseFrame = makeFlatFrame(10);
		const nearDuplicate = makeFlatFrame(10);
		nearDuplicate[1] = 80;
		nearDuplicate[3] = 80;
		const rampFrame = makeHorizontalRampFrame();

		const concatenated = new Uint8Array(216);
		concatenated.set(baseFrame, 0);
		concatenated.set(nearDuplicate, 72);
		concatenated.set(rampFrame, 144);

		const candidates = sliceRawGray9x8StreamV1(concatenated, { intervalMs: 500 });
		expect(candidates).toHaveLength(3);
		expect(candidates.map((c) => c.timestampMs)).toEqual([0, 500, 1000]);

		const result = selectSceneCutKeyframesV1(candidates);
		expect(result.engine).toBe('turbovec-napi');
		expect(result.keyframes).toHaveLength(2);
		expect(result.keyframes[0]).toMatchObject({ frameIndex: 0, timestampMs: 0 });
		expect(result.keyframes[1]).toMatchObject({ frameIndex: 2, timestampMs: 1000 });

		expect(
			searchKeyframesByBitsetTopKV1(new BigUint64Array([0xffffffffffffffffn]), result.corpusWordsLe, 1, 2)
		).toEqual([
			{ index: 1, distance: 0 },
			{ index: 0, distance: 64 }
		]);

		expect(() => sliceRawGray9x8StreamV1(new Uint8Array(73))).toThrow(
			'RAW_GRAY9X8_STREAM_NOT_MULTIPLE_OF_72'
		);
	});
});
