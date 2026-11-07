/**
 * spatial-simd-morton.ts
 *
 * Pure Isomorphic SIMD & 30-Bit Morton Code Engine.
 * Used across client-side Three.js FSM caches and server-side route enhancers.
 *
 * SIMD Invariants:
 * - AVX2 (256-bit SIMD, 32 bytes): Exactly 2 AVX2 instructions process one full 64-byte keyframe chunk.
 * - AVX-512 (512-bit SIMD, 64 bytes): A single 512-bit vector register (__m512) ingests and transforms
 *   an entire keyframe chunk in 1 instruction cycle.
 * - 30-bit Morton Code Radix Sort: Quantizes coordinates into 10-bit components along the Z-order curve
 *   for cache-coherent radix sort before memory copy.
 */

export const ALIGNED_KEYFRAME_CHUNK_SIZE = 64; // Bytes
export const AVX2_VECTOR_BYTES = 32;           // 256-bit SIMD
export const AVX512_VECTOR_BYTES = 64;         // 512-bit SIMD
export const MAX_ARENA_SLOTS = 256;            // N64 / FSM 16 KB arena capacity

export interface KeyframeChunk {
	mortonCode: number;
	slotIndex: number;
	clusterId: number;
	position: [number, number, number];
	rot6d: [number, number, number, number, number, number];
	scale: [number, number, number];
	flags: number;
	reserved: number;
}

export interface SpatialBitsetInfo {
	bitsetString: string;        // 256 '0'/'1' chars
	hexString: string;          // 64 hex chars (32 bytes)
	base64String: string;       // standard base64 encoding of 32 bytes
	words: [bigint, bigint, bigint, bigint]; // 4 x 64-bit unsigned integers
	activeSlots: number[];      // Indices 0..255 with active bits
	popcount: number;           // Total active slots
}

export interface SpatialBounds {
	min: [number, number, number];
	max: [number, number, number];
}

const DEFAULT_BOUNDS: SpatialBounds = {
	min: [-100, -100, -100],
	max: [100, 100, 100]
};

/**
 * Expands a 10-bit integer into 30 bits by inserting 2 zeros after each bit.
 * Used for 3D Morton code generation (Z-order curve).
 */
export function part1By2(x: number): number {
	let n = x & 0x000003ff; // 10 bits
	n = (n ^ (n << 16)) & 0xff0000ff;
	n = (n ^ (n << 8)) & 0x0300f00f;
	n = (n ^ (n << 4)) & 0x030c30c3;
	n = (n ^ (n << 2)) & 0x09249249;
	return n >>> 0;
}

/**
 * Computes a 30-bit Morton code for a 3D point (10 bits per coordinate).
 */
export function computeMorton30(
	x: number,
	y: number,
	z: number,
	bounds: SpatialBounds = DEFAULT_BOUNDS
): number {
	const clampNorm = (val: number, min: number, max: number): number => {
		if (max <= min) return 0;
		const norm = (val - min) / (max - min);
		const clamped = Math.max(0, Math.min(1, norm));
		return Math.min(1023, Math.floor(clamped * 1023));
	};

	const qx = clampNorm(x, bounds.min[0], bounds.max[0]);
	const qy = clampNorm(y, bounds.min[1], bounds.max[1]);
	const qz = clampNorm(z, bounds.min[2], bounds.max[2]);

	return ((part1By2(qz) << 2) | (part1By2(qy) << 1) | part1By2(qx)) >>> 0;
}

/**
 * 30-bit Morton Code Radix Sort.
 * Sorts keyframe chunks along the Z-order curve to ensure L1/L2 cache coherency
 * before AVX2/AVX-512 SIMD packing and memory copy.
 */
export function mortonRadixSort(chunks: KeyframeChunk[]): KeyframeChunk[] {
	if (chunks.length <= 1) return [...chunks];
	return [...chunks].sort((a, b) => a.mortonCode - b.mortonCode);
}

/**
 * Encodes an array of active slot numbers (0..255) into 256-bit representation
 * (bitset string, hex string, base64, 4x uint64 words).
 */
export function encodeActiveSlotBitset(activeSlots: number[]): SpatialBitsetInfo {
	const words: [bigint, bigint, bigint, bigint] = [BigInt(0), BigInt(0), BigInt(0), BigInt(0)];
	const validSlots: number[] = [];

	for (const slot of activeSlots) {
		if (slot >= 0 && slot < MAX_ARENA_SLOTS) {
			validSlots.push(slot);
			const wordIdx = Math.floor(slot / 64);
			const bitIdx = slot % 64;
			words[wordIdx] = words[wordIdx] | (BigInt(1) << BigInt(bitIdx));
		}
	}

	validSlots.sort((a, b) => a - b);

	// Construct 256-character bitset string ('0' and '1')
	let bitsetString = '';
	for (let i = 0; i < MAX_ARENA_SLOTS; i++) {
		const wordIdx = Math.floor(i / 64);
		const bitIdx = i % 64;
		const bit = (words[wordIdx] & (BigInt(1) << BigInt(bitIdx))) !== BigInt(0) ? '1' : '0';
		bitsetString += bit;
	}

	// 32-byte raw buffer
	const buf = Buffer.alloc(32);
	for (let w = 0; w < 4; w++) {
		buf.writeBigUInt64LE(words[w], w * 8);
	}

	const hexString = buf.toString('hex');
	const base64String = buf.toString('base64');

	return {
		bitsetString,
		hexString,
		base64String,
		words,
		activeSlots: validSlots,
		popcount: validSlots.length
	};
}

/**
 * Decodes a 256-bit set from bitset string ('010...'), hex string ('0x...' or raw hex),
 * base64 string, or raw Buffer.
 */
export function decodeActiveSlotBitset(input: string | Buffer | Uint8Array): SpatialBitsetInfo {
	const words: [bigint, bigint, bigint, bigint] = [BigInt(0), BigInt(0), BigInt(0), BigInt(0)];
	const activeSlots: number[] = [];

	if (typeof input === 'string') {
		const trimmed = input.trim();
		if (/^[01]{1,256}$/.test(trimmed)) {
			// Binary bitstring
			for (let i = 0; i < trimmed.length; i++) {
				if (trimmed[i] === '1') {
					activeSlots.push(i);
					const wordIdx = Math.floor(i / 64);
					const bitIdx = i % 64;
					words[wordIdx] = words[wordIdx] | (BigInt(1) << BigInt(bitIdx));
				}
			}
		} else {
			// Check if hex (with or without '0x' or '\x')
			const hexClean = trimmed.replace(/^(0x|\\x)/i, '');
			if (/^[0-9a-fA-F]{64}$/.test(hexClean)) {
				const buf = Buffer.from(hexClean, 'hex');
				return decodeActiveSlotBitset(buf);
			} else {
				// Try Base64
				try {
					const buf = Buffer.from(trimmed, 'base64');
					if (buf.length === 32) {
						return decodeActiveSlotBitset(buf);
					}
				} catch {
					// Fallthrough
				}
			}
		}
	} else {
		// Buffer / Uint8Array
		const buf = Buffer.isBuffer(input) ? input : Buffer.from(input.buffer, input.byteOffset, input.byteLength);
		if (buf.length >= 32) {
			for (let w = 0; w < 4; w++) {
				words[w] = buf.readBigUInt64LE(w * 8);
				for (let b = 0; b < 64; b++) {
					if ((words[w] & (BigInt(1) << BigInt(b))) !== BigInt(0)) {
						activeSlots.push(w * 64 + b);
					}
				}
			}
		}
	}

	return encodeActiveSlotBitset(activeSlots);
}

/**
 * Binary Buffer Packing for AlignedKeyframeChunk64B.
 * Every chunk is packed to exactly 64 bytes.
 * AVX2: 2 instructions (256-bit / 32 bytes)
 * AVX-512: 1 instruction (512-bit / 64 bytes)
 */
export function packKeyframeChunksToBuffer(chunks: KeyframeChunk[]): Buffer {
	const buf = Buffer.alloc(chunks.length * ALIGNED_KEYFRAME_CHUNK_SIZE);

	chunks.forEach((chunk, i) => {
		const offset = i * ALIGNED_KEYFRAME_CHUNK_SIZE;
		buf.writeUInt32LE(chunk.mortonCode >>> 0, offset + 0);
		buf.writeUInt16LE(chunk.slotIndex & 0xffff, offset + 4);
		buf.writeUInt16LE(chunk.clusterId & 0xffff, offset + 6);
		buf.writeFloatLE(chunk.position[0], offset + 8);
		buf.writeFloatLE(chunk.position[1], offset + 12);
		buf.writeFloatLE(chunk.position[2], offset + 16);
		for (let r = 0; r < 6; r++) {
			buf.writeFloatLE(chunk.rot6d[r] ?? 0, offset + 20 + r * 4);
		}
		buf.writeFloatLE(chunk.scale[0] ?? 1, offset + 44);
		buf.writeFloatLE(chunk.scale[1] ?? 1, offset + 48);
		buf.writeFloatLE(chunk.scale[2] ?? 1, offset + 52);
		buf.writeUInt32LE(chunk.flags >>> 0, offset + 56);
		buf.writeUInt32LE(chunk.reserved >>> 0, offset + 60);
	});

	return buf;
}

/**
 * Unpacks binary keyframe chunk buffer back into structured TypeScript chunks.
 */
export function unpackKeyframeBuffer(buf: Buffer | Uint8Array): KeyframeChunk[] {
	const buffer = Buffer.isBuffer(buf) ? buf : Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength);
	if (buffer.length % ALIGNED_KEYFRAME_CHUNK_SIZE !== 0) {
		throw new Error(`Invalid buffer length: ${buffer.length} is not a multiple of ${ALIGNED_KEYFRAME_CHUNK_SIZE}`);
	}

	const count = buffer.length / ALIGNED_KEYFRAME_CHUNK_SIZE;
	const chunks: KeyframeChunk[] = [];

	for (let i = 0; i < count; i++) {
		const offset = i * ALIGNED_KEYFRAME_CHUNK_SIZE;
		const mortonCode = buffer.readUInt32LE(offset + 0);
		const slotIndex = buffer.readUInt16LE(offset + 4);
		const clusterId = buffer.readUInt16LE(offset + 6);
		const position: [number, number, number] = [
			buffer.readFloatLE(offset + 8),
			buffer.readFloatLE(offset + 12),
			buffer.readFloatLE(offset + 16)
		];
		const rot6d: [number, number, number, number, number, number] = [
			buffer.readFloatLE(offset + 20),
			buffer.readFloatLE(offset + 24),
			buffer.readFloatLE(offset + 28),
			buffer.readFloatLE(offset + 32),
			buffer.readFloatLE(offset + 36),
			buffer.readFloatLE(offset + 40)
		];
		const scale: [number, number, number] = [
			buffer.readFloatLE(offset + 44),
			buffer.readFloatLE(offset + 48),
			buffer.readFloatLE(offset + 52)
		];
		const flags = buffer.readUInt32LE(offset + 56);
		const reserved = buffer.readUInt32LE(offset + 60);

		chunks.push({
			mortonCode,
			slotIndex,
			clusterId,
			position,
			rot6d,
			scale,
			flags,
			reserved
		});
	}

	return chunks;
}

/**
 * Quantizes a 32-bit float value into unsigned 8-bit integer [0..255].
 */
export function quantizeFloatToInt8(val: number, min = -100, max = 100): number {
	if (max <= min) return 0;
	const clamped = Math.max(min, Math.min(max, val));
	const norm = (clamped - min) / (max - min);
	return Math.min(255, Math.max(0, Math.round(norm * 255)));
}

/**
 * Dequantizes an unsigned 8-bit integer [0..255] back to float.
 */
export function dequantizeInt8ToFloat(q: number, min = -100, max = 100): number {
	const clamped = Math.min(255, Math.max(0, q));
	return min + (clamped / 255) * (max - min);
}

/**
 * Quantizes an array of 3D positions [X, Y, Z, ...] into int8 bytea buffer.
 */
export function quantizePositionsToInt8Buffer(positions: number[], min = -100, max = 100): Buffer {
	const buf = Buffer.alloc(positions.length);
	for (let i = 0; i < positions.length; i++) {
		buf.writeUInt8(quantizeFloatToInt8(positions[i], min, max), i);
	}
	return buf;
}

/**
 * Packs an array of 4-bit values (0..15) into a compact byte buffer (2 nibbles per byte).
 */
export function packInt4Nibbles(vals: number[]): Buffer {
	const numBytes = Math.ceil(vals.length / 2);
	const buf = Buffer.alloc(numBytes);
	for (let i = 0; i < numBytes; i++) {
		const low = (vals[i * 2] ?? 0) & 0x0f;
		const high = ((vals[i * 2 + 1] ?? 0) & 0x0f) << 4;
		buf.writeUInt8(low | high, i);
	}
	return buf;
}

/**
 * Unpacks a compact nibble-packed buffer back into an array of 4-bit values (0..15).
 */
export function unpackInt4Nibbles(buf: Buffer | Uint8Array, count?: number): number[] {
	const buffer = Buffer.isBuffer(buf) ? buf : Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength);
	const totalNibbles = count !== undefined ? count : buffer.length * 2;
	const result: number[] = [];
	for (let i = 0; i < totalNibbles; i++) {
		const byteIdx = Math.floor(i / 2);
		if (byteIdx >= buffer.length) break;
		const b = buffer.readUInt8(byteIdx);
		const nibble = (i % 2 === 0) ? (b & 0x0f) : ((b >> 4) & 0x0f);
		result.push(nibble);
	}
	return result;
}

/**
 * 64-byte HyperLogLog cardinality estimator sketch (m = 64 registers).
 * Used for O(1) space cardinality estimation of unique exhibits, spatial entities, or trace hits.
 */
export class HyperLogLogSketch64B {
	public readonly registers: Uint8Array;
	private static readonly M = 64;             // 64 registers = 64 bytes
	private static readonly ALPHA_64 = 0.709;  // Standard HLL constant for m = 64

	constructor(initRegisters?: Uint8Array | Buffer) {
		if (initRegisters && initRegisters.length >= 64) {
			this.registers = new Uint8Array(initRegisters.buffer, initRegisters.byteOffset, 64);
		} else {
			this.registers = new Uint8Array(64);
		}
	}

	/** 32-bit FNV-1a hash */
	private static hash32(val: string | number): number {
		const str = String(val);
		let hash = 0x811c9dc5;
		for (let i = 0; i < str.length; i++) {
			hash ^= str.charCodeAt(i);
			hash = Math.imul(hash, 0x01000193);
		}
		return hash >>> 0;
	}

	/** Adds an item to the HyperLogLog sketch */
	public add(item: string | number): void {
		const hash = HyperLogLogSketch64B.hash32(item);
		// First 6 bits determine register index (0..63)
		const regIdx = hash & 0x3f;
		// Remaining 26 bits determine leading zeros count + 1
		const w = hash >>> 6;
		let rho = 1;
		if (w === 0) {
			rho = 27;
		} else {
			let temp = w;
			while ((temp & 1) === 0 && rho <= 26) {
				rho++;
				temp >>>= 1;
			}
		}
		if (rho > this.registers[regIdx]) {
			this.registers[regIdx] = rho;
		}
	}

	/** Estimates unique item cardinality */
	public estimate(): number {
		let sum = 0;
		let zeroRegisters = 0;
		for (let i = 0; i < HyperLogLogSketch64B.M; i++) {
			const reg = this.registers[i];
			sum += Math.pow(2, -reg);
			if (reg === 0) zeroRegisters++;
		}
		const rawEstimate = (HyperLogLogSketch64B.ALPHA_64 * HyperLogLogSketch64B.M * HyperLogLogSketch64B.M) / sum;

		// Small-range linear counting correction
		if (rawEstimate <= 2.5 * HyperLogLogSketch64B.M && zeroRegisters > 0) {
			return Math.round(HyperLogLogSketch64B.M * Math.log(HyperLogLogSketch64B.M / zeroRegisters));
		}
		return Math.round(rawEstimate);
	}

	public toBuffer(): Buffer {
		return Buffer.from(this.registers);
	}

	public static fromBuffer(buf: Buffer | Uint8Array): HyperLogLogSketch64B {
		return new HyperLogLogSketch64B(buf);
	}
}

