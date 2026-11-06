/**
 * SPZ v4 Gaussian-splat loader (Niantic Labs format, https://github.com/nianticlabs/spz).
 *
 * Decodes an SPZ v4 byte array into typed arrays. Engine-agnostic: no Three/Babylon/PlayCanvas.
 * Transcribed from the reference decoder (src/cc/load-spz.cc, src/cc/splat-utils.h, MIT, Niantic Labs / Adobe).
 *
 * Fail-closed by design. Anything outside the verified subset throws an SpzError with a stable code:
 *   - legacy versions 1-3 (gzip) and any version other than 4
 *   - extension records (header flag 0x2): the reference warns that decoding may be wrong without them
 *   - anything but the six standard streams, a TOC that does not line up, or trailing bytes
 *   - a decompressed stream whose size does not match numPoints and shDegree
 *
 * Output coordinate system is RUB (the reference default when no extension is present). The caller must
 * record that in its manifest; it is not inferred from the file.
 */
import { decompress } from 'fzstd';

export class SpzError extends Error {
	constructor(
		public readonly code: string,
		message?: string
	) {
		super(message ?? code);
		this.name = 'SpzError';
	}
}

/** Operator-chosen safety cap on points, not a format limit. Raise it only with a memory budget. */
export const SPZ_DEFAULT_MAX_POINTS = 5_000_000;
/** Hard compressed-input cap applied before hashing or decompression. Override only with a reviewed memory budget. */
export const SPZ_DEFAULT_MAX_SOURCE_BYTES = 64 * 1024 * 1024;
/** Hard decoded typed-array cap, checked from the SPZ header before any Zstandard stream is decompressed. */
export const SPZ_DEFAULT_MAX_DECODED_BYTES = 512 * 1024 * 1024;

const SPZ_MAGIC = 0x5053474e; // bytes "NGSP" in file order, read as little-endian uint32
const SPZ_VERSION = 4;
const HEADER_BYTES = 32;
const STREAM_COUNT = 6;
const FLAG_ANTIALIASED = 0x1;
const FLAG_HAS_EXTENSIONS = 0x2;
const SQRT1_2 = 0.707106781186547524401;
const COLOR_SCALE = 0.15;

export interface SpzData {
	numPoints: number;
	shDegree: number;
	fractionalBits: number;
	antialiased: boolean;
	coordinateSystem: 'RUB';
	/** numPoints * 3, world-space positions (RUB). */
	positions: Float32Array;
	/** numPoints, opacity as a logit (pre-sigmoid). */
	alphas: Float32Array;
	/** numPoints * 3, SH degree-0 color term. */
	colors: Float32Array;
	/** numPoints * 3, log-scale per axis. */
	scales: Float32Array;
	/** numPoints * 4, unit quaternion as xyzw. */
	rotations: Float32Array;
	/** numPoints * shCoeffs * 3, coefficient-major with RGB interleaved: index = point*(coeffs*3) + k*3 + channel. */
	sh: Float32Array;
	/** Number of SH coefficients per channel, (degree+1)^2 - 1. */
	shCoeffs: number;
}

export interface SpzParseOptions {
	maxPoints?: number;
	maxSourceBytes?: number;
	maxDecodedBytes?: number;
}

/** fzstd (0.1.1) supports back-reference distances up to 2^25 bytes. README: larger windows may fail. */
export const FZSTD_MAX_WINDOW = 2 ** 25;

/**
 * Window size in bytes from a ZSTD frame header (RFC 8878, section 3.1.1.1).
 * Single-segment frames use the content size as the window. Otherwise the window descriptor gives it.
 * Throws SPZ_ZSTD_DECODE_FAILED if the magic or the header is truncated.
 */
export function zstdWindowSize(frame: Uint8Array): number {
	if (frame.length < 5 || frame[0] !== 0x28 || frame[1] !== 0xb5 || frame[2] !== 0x2f || frame[3] !== 0xfd) {
		throw new SpzError('SPZ_ZSTD_DECODE_FAILED', 'bad ZSTD magic');
	}
	const fhd = frame[4];
	const singleSegment = (fhd >> 5) & 1;
	const fcsFlag = fhd >> 6;
	const dictFlag = fhd & 3;
	let pos = 5;
	let window = 0;
	if (!singleSegment) {
		if (pos >= frame.length) throw new SpzError('SPZ_ZSTD_DECODE_FAILED', 'truncated window descriptor');
		const wd = frame[pos++];
		const base = 2 ** (10 + (wd >> 3));
		window = base + (base / 8) * (wd & 7);
	}
	pos += [0, 1, 2, 4][dictFlag];
	const fcsBytes = fcsFlag === 0 ? (singleSegment ? 1 : 0) : [0, 2, 4, 8][fcsFlag];
	if (pos + fcsBytes > frame.length) throw new SpzError('SPZ_ZSTD_DECODE_FAILED', 'truncated frame header');
	if (singleSegment) {
		let fcs = 0;
		for (let i = 0; i < fcsBytes; i++) fcs += frame[pos + i] * 2 ** (8 * i);
		if (fcsFlag === 1) fcs += 256;
		window = fcs;
	}
	return window;
}

/** Coefficients per channel for an SH degree: (d+1)^2 - 1. Matches the reference dimForDegree. */
export function shCoeffsForDegree(degree: number): number {
	return (degree + 1) * (degree + 1) - 1;
}

/** Predict the total decoded Float32Array payload from the fixed SPZ v4 header. */
export function estimateSpzDecodedByteLength(bytes: Uint8Array, maxPoints = SPZ_DEFAULT_MAX_POINTS): number {
	if (bytes.length < HEADER_BYTES) throw new SpzError('SPZ_TRUNCATED_HEADER');
	const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	if (dv.getUint32(0, true) !== SPZ_MAGIC) throw new SpzError('SPZ_BAD_MAGIC');
	const version = dv.getUint32(4, true);
	if (version !== SPZ_VERSION) throw new SpzError('SPZ_VERSION_UNSUPPORTED', `version ${version}`);
	const numPoints = dv.getUint32(8, true);
	const shDegree = bytes[12];
	if (numPoints > maxPoints) throw new SpzError('SPZ_TOO_MANY_POINTS', `${numPoints} > ${maxPoints}`);
	if (shDegree > 4) throw new SpzError('SPZ_SH_DEGREE_INVALID', `degree ${shDegree}`);
	// positions(3), alpha(1), colors(3), scales(3), rotations(4), SH(3 * coeffs), all Float32.
	const floatComponentsPerPoint = 14 + 3 * shCoeffsForDegree(shDegree);
	return numPoints * floatComponentsPerPoint * Float32Array.BYTES_PER_ELEMENT;
}

/** Decode SPZ v4 bytes. Throws SpzError on anything outside the verified subset. */
export function parseSpz(bytes: Uint8Array, options: SpzParseOptions = {}): SpzData {
	const maxPoints = options.maxPoints ?? SPZ_DEFAULT_MAX_POINTS;
	const maxSourceBytes = options.maxSourceBytes ?? SPZ_DEFAULT_MAX_SOURCE_BYTES;
	const maxDecodedBytes = options.maxDecodedBytes ?? SPZ_DEFAULT_MAX_DECODED_BYTES;
	if (bytes.byteLength > maxSourceBytes) {
		throw new SpzError('SPZ_SOURCE_TOO_LARGE', `${bytes.byteLength} > ${maxSourceBytes}`);
	}

	if (bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b) {
		throw new SpzError('SPZ_LEGACY_GZIP_UNSUPPORTED', 'legacy gzip SPZ (v1-3) is not supported');
	}
	if (bytes.length < HEADER_BYTES) throw new SpzError('SPZ_TRUNCATED_HEADER');

	const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	if (dv.getUint32(0, true) !== SPZ_MAGIC) throw new SpzError('SPZ_BAD_MAGIC');

	const version = dv.getUint32(4, true);
	if (version !== SPZ_VERSION) throw new SpzError('SPZ_VERSION_UNSUPPORTED', `version ${version}`);

	const numPoints = dv.getUint32(8, true);
	const shDegree = bytes[12];
	const fractionalBits = bytes[13];
	const flags = bytes[14];
	const numStreams = bytes[15];
	const tocByteOffset = dv.getUint32(16, true);

	if (numPoints > maxPoints) throw new SpzError('SPZ_TOO_MANY_POINTS', `${numPoints} > ${maxPoints}`);
	if (shDegree > 4) throw new SpzError('SPZ_SH_DEGREE_INVALID', `degree ${shDegree}`);
	const decodedByteLength = estimateSpzDecodedByteLength(bytes, maxPoints);
	if (decodedByteLength > maxDecodedBytes) throw new SpzError('SPZ_DECODED_TOO_LARGE', `${decodedByteLength} > ${maxDecodedBytes}`);
	if (flags & FLAG_HAS_EXTENSIONS) throw new SpzError('SPZ_EXTENSIONS_UNSUPPORTED');
	// The reference writer omits zero-size streams, so degree 0 has no SH stream (verified against
	// ply_to_spz output from Niantic's official C++ encoder: numStreams = 5 for shDegree 0).
	const expectedStreams = shDegree === 0 ? 5 : STREAM_COUNT;
	if (numStreams !== expectedStreams) throw new SpzError('SPZ_STREAM_COUNT_UNEXPECTED', `${numStreams}`);
	if (tocByteOffset !== HEADER_BYTES) throw new SpzError('SPZ_TOC_OFFSET_UNEXPECTED', `${tocByteOffset}`);
	for (let i = 20; i < HEADER_BYTES; i++) {
		if (bytes[i] !== 0) throw new SpzError('SPZ_RESERVED_NONZERO');
	}

	const tocEnd = tocByteOffset + numStreams * 16;
	if (tocEnd > bytes.length) throw new SpzError('SPZ_TRUNCATED_TOC');

	const shCoeffs = shCoeffsForDegree(shDegree);
	const expected = [
		numPoints * 9, // positions: 3 x 24-bit
		numPoints, // alphas
		numPoints * 3, // colors
		numPoints * 3, // scales
		numPoints * 4, // rotations: smallest-three, 4 bytes
		numPoints * shCoeffs * 3 // sh
	];

	// TOC entries: u64 compressed size, u64 uncompressed size. Streams follow the TOC back to back.
	const streams: Uint8Array[] = [];
	let cursor = tocEnd;
	for (let i = 0; i < numStreams; i++) {
		const e = tocByteOffset + i * 16;
		const compressedSize = toSafeNumber(dv.getBigUint64(e, true));
		const uncompressedSize = toSafeNumber(dv.getBigUint64(e + 8, true));
		if (uncompressedSize !== expected[i]) {
			throw new SpzError('SPZ_STREAM_SIZE_MISMATCH', `stream ${i}: ${uncompressedSize} != ${expected[i]}`);
		}
		if (compressedSize > bytes.length - cursor) throw new SpzError('SPZ_TRUNCATED_STREAM', `stream ${i}`);
		const frame = bytes.subarray(cursor, cursor + compressedSize);
		// fzstd only supports back-references up to 2^25 bytes; larger windows may decode incorrectly.
		if (zstdWindowSize(frame) > FZSTD_MAX_WINDOW) throw new SpzError('SPZ_ZSTD_WINDOW_TOO_LARGE', `stream ${i}`);
		let out: Uint8Array;
		try {
			out = decompress(frame);
		} catch {
			throw new SpzError('SPZ_ZSTD_DECODE_FAILED', `stream ${i}`);
		}
		if (out.length !== uncompressedSize) {
			throw new SpzError('SPZ_STREAM_SIZE_MISMATCH', `stream ${i} decoded ${out.length}`);
		}
		streams.push(out);
		cursor += compressedSize;
	}
	if (cursor !== bytes.length) throw new SpzError('SPZ_TRAILING_BYTES', `${bytes.length - cursor}`);

	const [pos, alp, col, scl, rot, shStream] = streams;
	const sh = shStream ?? new Uint8Array(0);
	const fixedScale = 1 / 2 ** fractionalBits;

	const positions = new Float32Array(numPoints * 3);
	for (let i = 0; i < numPoints * 3; i++) {
		const b = i * 3;
		// 24-bit signed fixed point: build int32 from the top bits, then shift back down with sign extension.
		const v = ((pos[b + 2] << 24) | (pos[b + 1] << 16) | (pos[b] << 8)) >> 8;
		positions[i] = v * fixedScale;
	}

	const alphas = new Float32Array(numPoints);
	for (let i = 0; i < numPoints; i++) {
		const x = alp[i] / 255;
		alphas[i] = Math.log(x / (1 - x)); // reference invSigmoid; 0 and 255 map to -inf / +inf as in the reference
	}

	const colors = new Float32Array(numPoints * 3);
	for (let i = 0; i < numPoints * 3; i++) colors[i] = (col[i] / 255 - 0.5) / COLOR_SCALE;

	const scales = new Float32Array(numPoints * 3);
	for (let i = 0; i < numPoints * 3; i++) scales[i] = scl[i] / 16 - 10;

	const rotations = new Float32Array(numPoints * 4);
	for (let p = 0; p < numPoints; p++) decodeSmallestThree(rot, p * 4, rotations, p * 4);

	const shOut = new Float32Array(sh.length);
	for (let i = 0; i < sh.length; i++) shOut[i] = (sh[i] - 128) / 128;

	return {
		numPoints,
		shDegree,
		fractionalBits,
		antialiased: (flags & FLAG_ANTIALIASED) !== 0,
		coordinateSystem: 'RUB',
		positions,
		alphas,
		colors,
		scales,
		rotations,
		sh: shOut,
		shCoeffs
	};
}

/**
 * Smallest-three quaternion, 4 bytes per point. Mirrors unpackQuaternionSmallestThree in splat-utils.h.
 * The top 2 bits give the dropped (largest) component index. Each other component is a sign bit plus
 * a 9-bit magnitude scaled by sqrt(1/2). The largest component is reconstructed as non-negative.
 */
function decodeSmallestThree(src: Uint8Array, srcOff: number, dst: Float32Array, dstOff: number): void {
	const comp0 = (src[srcOff] | (src[srcOff + 1] << 8) | (src[srcOff + 2] << 16) | (src[srcOff + 3] << 24)) >>> 0;
	const largest = comp0 >>> 30;
	let comp = comp0;
	let sumSquares = 0;
	const q = [0, 0, 0, 0];
	for (let i = 3; i >= 0; i--) {
		if (i === largest) continue;
		const mag = comp & 0x1ff;
		const negbit = (comp >>> 9) & 1;
		comp >>>= 10;
		let v = (SQRT1_2 * mag) / 511;
		if (negbit === 1) v = -v;
		q[i] = v;
		sumSquares += v * v;
	}
	q[largest] = Math.sqrt(Math.max(0, 1 - sumSquares));
	dst[dstOff] = q[0];
	dst[dstOff + 1] = q[1];
	dst[dstOff + 2] = q[2];
	dst[dstOff + 3] = q[3];
}

function toSafeNumber(v: bigint): number {
	if (v > BigInt(Number.MAX_SAFE_INTEGER)) throw new SpzError('SPZ_SIZE_OUT_OF_RANGE');
	return Number(v);
}

/** SHA-256 hex of the raw SPZ bytes, for the manifest. Works in browsers and Node 18+. */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
	const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes as BufferSource);
	return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}
