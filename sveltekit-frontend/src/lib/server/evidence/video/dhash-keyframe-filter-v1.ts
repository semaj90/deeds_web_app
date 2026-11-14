import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { types } from 'node:util';

export const DEFAULT_SCENE_CUT_HAMMING_THRESHOLD_V1 = 12;

export type DhashEngineKindV1 = 'turbovec-napi' | 'ts-fallback';

export interface FrameDhashResultV1 {
	dhashHex: string;
	word64: bigint;
	engine: DhashEngineKindV1;
}

export interface KeyframeCandidateInputV1 {
	frameIndex: number;
	timestampMs: number;
	gray9x8: Uint8Array;
}

export interface SelectedSceneCutKeyframeV1 {
	frameIndex: number;
	timestampMs: number;
	dhashHex: string;
	word64: bigint;
	hammingFromPrev: number;
}

export interface SceneCutKeyframeResultV1 {
	keyframes: SelectedSceneCutKeyframeV1[];
	corpusWordsLe: Uint8Array;
	engine: DhashEngineKindV1;
}

interface TurbovecNapiBinding {
	computeDhash64: (gray9x8: Uint8Array) => string;
	batchHammingSearchTopK: (
		queryWords: BigUint64Array | Uint8Array,
		corpusFlatWords: BigUint64Array | Uint8Array,
		wordsPerVec: number,
		topK: number
	) => Array<{ index: number; distance: number }>;
}

const require = createRequire(import.meta.url);
let cachedBinding: TurbovecNapiBinding | null | undefined;

function loadTurbovecBinding(): TurbovecNapiBinding | null {
	if (cachedBinding !== undefined) return cachedBinding;

	const here = dirname(fileURLToPath(import.meta.url));
	const candidatePaths = [
		resolve(here, '../../../../../../crates/turbovec-napi/wrapper.js'),
		resolve(process.cwd(), '../crates/turbovec-napi/wrapper.js'),
		resolve(process.cwd(), 'crates/turbovec-napi/wrapper.js')
	];

	for (const candidate of candidatePaths) {
		if (!existsSync(candidate)) continue;
		try {
			const loaded = require(candidate) as Partial<TurbovecNapiBinding>;
			if (
				typeof loaded.computeDhash64 === 'function' &&
				typeof loaded.batchHammingSearchTopK === 'function'
			) {
				cachedBinding = loaded as TurbovecNapiBinding;
				return cachedBinding;
			}
		} catch {
			// Try next candidate path or fall back cleanly to pure-TS implementation.
		}
	}

	cachedBinding = null;
	return null;
}

function toLeUint8View(wordsOrBytes: BigUint64Array | Uint8Array): Uint8Array {
	if (types.isBigUint64Array(wordsOrBytes)) {
		return new Uint8Array(wordsOrBytes.buffer, wordsOrBytes.byteOffset, wordsOrBytes.byteLength);
	}
	if (types.isUint8Array(wordsOrBytes)) {
		return new Uint8Array(wordsOrBytes.buffer, wordsOrBytes.byteOffset, wordsOrBytes.byteLength);
	}
	throw new TypeError('EXPECTED_UINT8ARRAY_OR_BIGUINT64ARRAY');
}

function computeDhash64TsFallback(gray9x8: Uint8Array): bigint {
	let bits = 0n;
	let bitIdx = 0n;
	for (let row = 0; row < 8; row += 1) {
		const rowOffset = row * 9;
		for (let col = 0; col < 8; col += 1) {
			if (gray9x8[rowOffset + col] < gray9x8[rowOffset + col + 1]) {
				bits |= 1n << bitIdx;
			}
			bitIdx += 1n;
		}
	}
	return bits;
}

function popcount64(word: bigint): number {
	let v = BigInt.asUintN(64, word);
	let count = 0;
	while (v !== 0n) {
		v &= v - 1n;
		count += 1;
	}
	return count;
}

export function hammingDistance64V1(a: bigint, b: bigint): number {
	return popcount64(BigInt.asUintN(64, a ^ b));
}

export function computeFrameDhash64V1(gray9x8: Uint8Array): FrameDhashResultV1 {
	if (!types.isUint8Array(gray9x8) || gray9x8.byteLength !== 72) {
		throw new Error('DHASH_INPUT_MUST_BE_72_BYTES');
	}
	const view = new Uint8Array(gray9x8.buffer, gray9x8.byteOffset, gray9x8.byteLength);
	const binding = loadTurbovecBinding();
	if (binding) {
		try {
			const dhashHex = binding.computeDhash64(view);
			return {
				dhashHex,
				word64: BigInt(`0x${dhashHex}`),
				engine: 'turbovec-napi'
			};
		} catch {
			// Fall back to bit-identical TS implementation on native failure.
		}
	}

	const word64 = computeDhash64TsFallback(view);
	return {
		dhashHex: word64.toString(16).padStart(16, '0'),
		word64,
		engine: 'ts-fallback'
	};
}

export const RAW_GRAY9X8_FRAME_BYTES_V1 = 72;

export function sliceRawGray9x8StreamV1(
	rawGrayBytes: Uint8Array,
	options?: { intervalMs?: number }
): KeyframeCandidateInputV1[] {
	if (!types.isUint8Array(rawGrayBytes)) {
		throw new TypeError('RAW_GRAY9X8_STREAM_MUST_BE_UINT8ARRAY');
	}
	if (rawGrayBytes.byteLength % RAW_GRAY9X8_FRAME_BYTES_V1 !== 0) {
		throw new Error('RAW_GRAY9X8_STREAM_NOT_MULTIPLE_OF_72');
	}
	const intervalMs = options?.intervalMs ?? 1000;
	if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
		throw new Error('INVALID_KEYFRAME_INTERVAL_MS');
	}
	const frameCount = rawGrayBytes.byteLength / RAW_GRAY9X8_FRAME_BYTES_V1;
	const frames: KeyframeCandidateInputV1[] = [];
	for (let i = 0; i < frameCount; i += 1) {
		const offset = rawGrayBytes.byteOffset + i * RAW_GRAY9X8_FRAME_BYTES_V1;
		frames.push({
			frameIndex: i,
			timestampMs: Math.round(i * intervalMs),
			gray9x8: new Uint8Array(rawGrayBytes.buffer, offset, RAW_GRAY9X8_FRAME_BYTES_V1)
		});
	}
	return frames;
}

export function selectSceneCutKeyframesV1(
	frames: readonly KeyframeCandidateInputV1[],
	options?: { minHammingDistance?: number }
): SceneCutKeyframeResultV1 {
	const threshold = options?.minHammingDistance ?? DEFAULT_SCENE_CUT_HAMMING_THRESHOLD_V1;
	if (!Number.isInteger(threshold) || threshold < 0 || threshold > 64) {
		throw new Error('INVALID_HAMMING_THRESHOLD');
	}

	const bindingLoaded = loadTurbovecBinding() !== null;
	if (frames.length === 0) {
		return {
			keyframes: [],
			corpusWordsLe: new Uint8Array(0),
			engine: bindingLoaded ? 'turbovec-napi' : 'ts-fallback'
		};
	}

	const keyframes: SelectedSceneCutKeyframeV1[] = [];
	let prevWord: bigint | null = null;
	let usedEngine: DhashEngineKindV1 = bindingLoaded ? 'turbovec-napi' : 'ts-fallback';

	for (const frame of frames) {
		const { dhashHex, word64, engine } = computeFrameDhash64V1(frame.gray9x8);
		if (engine === 'ts-fallback') usedEngine = 'ts-fallback';

		const hammingFromPrev = prevWord === null ? 64 : hammingDistance64V1(prevWord, word64);
		if (prevWord === null || hammingFromPrev >= threshold) {
			keyframes.push({
				frameIndex: frame.frameIndex,
				timestampMs: frame.timestampMs,
				dhashHex,
				word64,
				hammingFromPrev
			});
			prevWord = word64;
		}
	}

	const corpusWordsLe = new Uint8Array(keyframes.length * 8);
	const view = new DataView(corpusWordsLe.buffer, corpusWordsLe.byteOffset, corpusWordsLe.byteLength);
	for (let i = 0; i < keyframes.length; i += 1) {
		view.setBigUint64(i * 8, keyframes[i].word64, true);
	}

	return {
		keyframes,
		corpusWordsLe,
		engine: usedEngine
	};
}

function searchBitsetTsFallback(
	queryLe: Uint8Array,
	corpusLe: Uint8Array,
	wordsPerVec: number,
	topK: number
): Array<{ index: number; distance: number }> {
	if (wordsPerVec <= 0) throw new Error('WORDS_PER_VEC_MUST_BE_POSITIVE');
	if (wordsPerVec > 1023) throw new Error('WORDS_PER_VEC_EXCEEDS_U16_DISTANCE_BOUND');
	if (queryLe.byteLength % 8 !== 0) throw new Error('QUERY_BYTES_NOT_U64_ALIGNED');
	if (corpusLe.byteLength % 8 !== 0) throw new Error('CORPUS_BYTES_NOT_U64_ALIGNED');
	const expectedQueryBytes = wordsPerVec * 8;
	if (queryLe.byteLength !== expectedQueryBytes) throw new Error('QUERY_WORDS_LENGTH_MISMATCH');
	if (corpusLe.byteLength % expectedQueryBytes !== 0) throw new Error('CORPUS_WORDS_LENGTH_MISMATCH');

	const numVecs = corpusLe.byteLength / expectedQueryBytes;
	if (numVecs === 0 || topK <= 0) return [];

	const qView = new DataView(queryLe.buffer, queryLe.byteOffset, queryLe.byteLength);
	const cView = new DataView(corpusLe.buffer, corpusLe.byteOffset, corpusLe.byteLength);
	const scores: Array<{ index: number; distance: number }> = [];

	for (let idx = 0; idx < numVecs; idx += 1) {
		let distance = 0;
		const baseBytes = idx * expectedQueryBytes;
		for (let w = 0; w < wordsPerVec; w += 1) {
			const qWord = qView.getBigUint64(w * 8, true);
			const cWord = cView.getBigUint64(baseBytes + w * 8, true);
			distance += popcount64(qWord ^ cWord);
		}
		scores.push({ index: idx, distance });
	}

	scores.sort((a, b) => a.distance - b.distance || a.index - b.index);
	return scores.slice(0, Math.min(topK, numVecs));
}

export function searchKeyframesByBitsetTopKV1(
	queryWords: BigUint64Array | Uint8Array,
	corpusFlatWords: BigUint64Array | Uint8Array,
	wordsPerVec: number,
	topK: number
): Array<{ index: number; distance: number }> {
	const queryLe = toLeUint8View(queryWords);
	const corpusLe = toLeUint8View(corpusFlatWords);

	const binding = loadTurbovecBinding();
	if (binding) {
		return binding.batchHammingSearchTopK(queryLe, corpusLe, wordsPerVec, topK);
	}
	return searchBitsetTsFallback(queryLe, corpusLe, wordsPerVec, topK);
}
