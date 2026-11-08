/**
 * quantized-feature-block-v1.ts
 *
 * Implements the atlas.quantized-feature-block.v1 binary contract:
 * - LSB-first bit-level packing for 2-bit, 3-bit, and 4-bit unsigned quantization codes.
 * - Distinct from atlas.packed-sparse-routing.v1 (which uses bit 7 for active flag, bits 0-6 for shifter).
 * - Exact byte-for-byte deterministic packing for vector dimensions 64, 128, 256, 512.
 */

export const QUANTIZED_FEATURE_BLOCK_SCHEMA_V1 = 'atlas.quantized-feature-block.v1' as const;

export type BitWidth = 2 | 3 | 4;

export interface QuantizedFeatureBlockMetadata {
	schema: typeof QUANTIZED_FEATURE_BLOCK_SCHEMA_V1;
	representation: string;
	bitWidth: BitWidth;
	dimensions: number;
	rowCount: number;
	rowStrideBytes: number;
	totalPayloadBytes: number;
	endianness: 'little-endian';
	scaleFormat: 'float32-per-vector' | 'float32-per-block';
	rotationVariant: 'none' | 'isoquant_fast' | 'isoquant_full';
	rotationRevision?: string;
	sha256: string;
}

/**
 * Packs an array of integer codes into an LSB-first bitstream.
 */
export function packCodes(codes: Uint8Array, bits: BitWidth): Uint8Array {
	const mask = (1 << bits) - 1;
	const out = new Uint8Array(Math.ceil((codes.length * bits) / 8));

	for (let i = 0; i < codes.length; i++) {
		const value = codes[i];
		if (value > mask) {
			throw new Error(`QUANT_CODE_OUT_OF_RANGE: value ${value} exceeds ${bits}-bit mask ${mask}`);
		}

		const bitOffset = i * bits;
		const byteIndex = bitOffset >>> 3;
		const shift = bitOffset & 7;

		out[byteIndex] |= (value << shift) & 0xff;

		if (shift + bits > 8) {
			out[byteIndex + 1] |= value >>> (8 - shift);
		}
	}

	return out;
}

/**
 * Unpacks a single code at index from an LSB-first bitstream.
 */
export function unpackCode(bytes: Uint8Array, index: number, bits: BitWidth): number {
	if (!Number.isInteger(index) || index < 0 || (index + 1) * bits > bytes.length * 8) {
		throw new Error(
			`QUANT_INDEX_OUT_OF_RANGE: index ${index} at ${bits}-bit exceeds ${bytes.length * 8} bits`
		);
	}

	const bitOffset = index * bits;
	const byteIndex = bitOffset >>> 3;
	const shift = bitOffset & 7;

	const word = bytes[byteIndex] | ((bytes[byteIndex + 1] ?? 0) << 8);

	return (word >>> shift) & ((1 << bits) - 1);
}

/**
 * Unpacks an array of count codes from an LSB-first bitstream.
 */
export function unpackCodes(bytes: Uint8Array, count: number, bits: BitWidth): Uint8Array {
	const out = new Uint8Array(count);
	for (let i = 0; i < count; i++) {
		out[i] = unpackCode(bytes, i, bits);
	}
	return out;
}

/**
 * Symmetric uniform floating-point quantizer mapping continuous float32 values
 * to unsigned integer codes [0 .. 2^bits - 1].
 */
export function quantizeFloatVector(
	vec: Float32Array,
	bits: BitWidth,
	fixedScale?: number
): { codes: Uint8Array; scale: number; zeroPoint: number } {
	const qmax = (1 << bits) - 1; // 3 for 2-bit, 7 for 3-bit, 15 for 4-bit
	const halfRange = qmax / 2; // e.g. 1.5, 3.5, 7.5

	let maxAbs = 0;
	if (fixedScale !== undefined && fixedScale > 0) {
		maxAbs = fixedScale;
	} else {
		for (let i = 0; i < vec.length; i++) {
			maxAbs = Math.max(maxAbs, Math.abs(vec[i]));
		}
		if (maxAbs === 0) maxAbs = 1.0;
	}

	const scale = maxAbs / halfRange;
	const codes = new Uint8Array(vec.length);

	for (let i = 0; i < vec.length; i++) {
		// Map [-maxAbs, +maxAbs] to [0, qmax]
		const normalized = (vec[i] + maxAbs) / (2 * maxAbs);
		const clamped = Math.max(0, Math.min(1, normalized));
		codes[i] = Math.round(clamped * qmax);
	}

	return { codes, scale, zeroPoint: Math.round(halfRange) };
}

/**
 * Dequantizes unsigned integer codes back to continuous float32 values.
 */
export function dequantizeFloatVector(
	codes: Uint8Array,
	scale: number,
	zeroPoint: number,
	bits: BitWidth
): Float32Array {
	const out = new Float32Array(codes.length);
	for (let i = 0; i < codes.length; i++) {
		out[i] = (codes[i] - zeroPoint) * scale;
	}
	return out;
}
