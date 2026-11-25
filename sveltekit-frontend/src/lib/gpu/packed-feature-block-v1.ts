/**
 * packed-feature-block-v1.ts
 *
 * TypeScript / Browser / WebGPU counterpart to Python `packed_feature_block_v1.py` (`PFB1`).
 * Enforces identical 104-byte little-endian header, LSB0 bit order, LOW_THEN_HIGH nibble order,
 * zeroed unused tail bits/high nibble, bounded logical sliding windows, and explicit-width rotlW.
 */

export const PFB1_MAGIC = [0x50, 0x46, 0x42, 0x31] as const; // 'PFB1'
export const PFB1_SCHEMA_VERSION = 1;
export const PFB1_HEADER_BYTES = 104;

export const BIT_ORDER_LSB0 = 0;
export const NIBBLE_ORDER_LOW_THEN_HIGH = 0;
export const INTEGER_ENDIAN_LITTLE = 0;

export interface DecodedPackedFeatureBlockV1 {
	featureMapRev: number;
	candidateCount: number;
	featureCount: number;
	logicalBitCount: number;
	nibbleCount: number;
	maskBytes: Uint8Array;
	nibbleBytes: Uint8Array;
	maskSha256: Uint8Array;
	nibbleSha256: Uint8Array;
}

export function rotl32(x: number, r: number): number {
	const shift = ((r % 32) + 32) % 32;
	if (shift === 0) return x >>> 0;
	return (((x << shift) | (x >>> (32 - shift))) >>> 0);
}

export function unpackBitLsb0(buf: Uint8Array, index: number, logicalCount: number): 0 | 1 {
	if (!Number.isInteger(index) || index < 0 || index >= logicalCount) {
		throw new RangeError(`BIT_INDEX_OUT_OF_RANGE:${index}`);
	}
	return (((buf[index >> 3] >> (index & 7)) & 1) as 0 | 1);
}

export function unpackNibble(buf: Uint8Array, index: number, logicalCount: number): number {
	if (!Number.isInteger(index) || index < 0 || index >= logicalCount) {
		throw new RangeError(`NIBBLE_INDEX_OUT_OF_RANGE:${index}`);
	}
	const b = buf[index >> 1];
	return (b >> (index & 1 ? 4 : 0)) & 0x0f;
}

export function readBitWindowV1(
	buf: Uint8Array,
	start: number,
	length: number,
	logicalCount: number
): Array<0 | 1> {
	if (start < 0 || length < 0 || start + length > logicalCount) {
		throw new Error(`BIT_WINDOW_OUT_OF_BOUNDS:start=${start}:len=${length}:logical=${logicalCount}`);
	}
	const out: Array<0 | 1> = [];
	for (let i = start; i < start + length; i++) {
		out.push(unpackBitLsb0(buf, i, logicalCount));
	}
	return out;
}

export function readNibbleWindowV1(
	buf: Uint8Array,
	start: number,
	length: number,
	logicalCount: number
): number[] {
	if (start < 0 || length < 0 || start + length > logicalCount) {
		throw new Error(`NIBBLE_WINDOW_OUT_OF_BOUNDS:start=${start}:len=${length}:logical=${logicalCount}`);
	}
	const out: number[] = [];
	for (let i = start; i < start + length; i++) {
		out.push(unpackNibble(buf, i, logicalCount));
	}
	return out;
}

async function sha256Bytes(data: Uint8Array): Promise<Uint8Array> {
	const copy = new Uint8Array(data.byteLength);
	copy.set(data);
	const digest = await crypto.subtle.digest('SHA-256', copy);
	return new Uint8Array(digest);
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
	if (a.byteLength !== b.byteLength) return false;
	for (let i = 0; i < a.byteLength; i++) {
		if (a[i] !== b[i]) return false;
	}
	return true;
}

export async function decodePackedFeatureBlockV1(
	blob: Uint8Array,
	expectedFeatureMapRev?: number
): Promise<DecodedPackedFeatureBlockV1> {
	if (blob.byteLength < PFB1_HEADER_BYTES) {
		throw new Error('PFB1_HEADER_TRUNCATED');
	}
	for (let i = 0; i < 4; i++) {
		if (blob[i] !== PFB1_MAGIC[i]) {
			throw new Error('PFB1_INVALID_MAGIC');
		}
	}

	const view = new DataView(blob.buffer, blob.byteOffset, blob.byteLength);
	const schemaVersion = view.getUint32(4, true);
	const featureMapRev = view.getUint32(8, true);
	const candidateCount = view.getUint32(12, true);
	const featureCount = view.getUint32(16, true);
	const bitOrder = view.getUint8(20);
	const nibbleOrder = view.getUint8(21);
	const integerEndian = view.getUint8(22);
	const logicalBitCount = Number(view.getBigUint64(24, true));
	const nibbleCount = Number(view.getBigUint64(32, true));

	if (schemaVersion !== PFB1_SCHEMA_VERSION) {
		throw new Error(`PFB1_UNSUPPORTED_VERSION:${schemaVersion}`);
	}
	if (
		bitOrder !== BIT_ORDER_LSB0 ||
		nibbleOrder !== NIBBLE_ORDER_LOW_THEN_HIGH ||
		integerEndian !== INTEGER_ENDIAN_LITTLE
	) {
		throw new Error('PFB1_UNSUPPORTED_ENCODING_FLAGS');
	}
	if (expectedFeatureMapRev !== undefined && featureMapRev !== expectedFeatureMapRev) {
		throw new Error(`PFB1_FEATURE_MAP_REV_MISMATCH:${featureMapRev}!=${expectedFeatureMapRev}`);
	}

	const capacity = candidateCount * featureCount;
	if (logicalBitCount > capacity || nibbleCount > capacity) {
		throw new Error('PFB1_LOGICAL_COUNT_EXCEEDS_CAPACITY');
	}

	const bitBytesLen = Math.ceil(logicalBitCount / 8);
	const nibbleBytesLen = Math.ceil(nibbleCount / 2);
	const expectedTotal = PFB1_HEADER_BYTES + bitBytesLen + nibbleBytesLen;
	if (blob.byteLength !== expectedTotal) {
		throw new Error(`PFB1_PAYLOAD_LENGTH_MISMATCH:${blob.byteLength}!=${expectedTotal}`);
	}

	const maskSha256 = blob.subarray(40, 72);
	const nibbleSha256 = blob.subarray(72, 104);
	const maskBytes = blob.subarray(PFB1_HEADER_BYTES, PFB1_HEADER_BYTES + bitBytesLen);
	const nibbleBytes = blob.subarray(PFB1_HEADER_BYTES + bitBytesLen);

	const bitRem = logicalBitCount & 7;
	if (bitRem !== 0 && maskBytes.byteLength > 0) {
		const unusedMask = (~((1 << bitRem) - 1)) & 0xff;
		if ((maskBytes[maskBytes.byteLength - 1] & unusedMask) !== 0) {
			throw new Error('UNUSED_TAIL_BITS_NON_ZERO');
		}
	}
	if ((nibbleCount & 1) === 1 && nibbleBytes.byteLength > 0) {
		if ((nibbleBytes[nibbleBytes.byteLength - 1] >> 4) !== 0) {
			throw new Error('UNUSED_FINAL_HIGH_NIBBLE_NON_ZERO');
		}
	}

	if (!bytesEqual(await sha256Bytes(maskBytes), maskSha256)) {
		throw new Error('PFB1_MASK_SHA256_MISMATCH');
	}
	if (!bytesEqual(await sha256Bytes(nibbleBytes), nibbleSha256)) {
		throw new Error('PFB1_NIBBLE_SHA256_MISMATCH');
	}

	return {
		featureMapRev,
		candidateCount,
		featureCount,
		logicalBitCount,
		nibbleCount,
		maskBytes,
		nibbleBytes,
		maskSha256,
		nibbleSha256,
	};
}
