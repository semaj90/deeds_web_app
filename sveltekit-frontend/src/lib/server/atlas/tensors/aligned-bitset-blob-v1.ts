/**
 * AlignedBitsetBlobV1 — 64-byte-padded bitset BLOB codec
 *
 * Implements the Parent Atlas Bitset BLOB Contract:
 *
 * +-----------------------------------------------------------------------+
 * |                       64-BYTE HEADER LAYOUT                           |
 * | magic: 'ATLASBIT' (8B) | version: uint32 (4B) | bit_count: uint32 (4B)|
 * | word_count: uint64 (8B)| sha256_checksum: 32B | padding: 8B           |
 * +-----------------------------------------------------------------------+
 * |                       CONTIGUOUS 64-BIT WORDS                         |
 * | uint64_t word_0  (bits 0..63)                                         |
 * | uint64_t word_1  (bits 64..127)                                       |
 * | ...                                                                   |
 * | uint64_t word_7  (bits 448..511) -> 8 words = 64 bytes (1 cache line) |
 * | ...                                                                   |
 * | uint64_t word_k  (padded with zeros to exact 64-byte boundary)        |
 * +-----------------------------------------------------------------------+
 *
 * The payload offset and total length are padded; JavaScript cannot prove the
 * backing allocation's physical address alignment.
 * TotalBytes = 64 (header) + 8 * (ceil(word_count / 8) * 8)
 *
 * Bit Indexing:
 * - Word index: i >> 6 (floor(i / 64))
 * - Bit position: i & 63 (i % 64)
 * - Check membership: (words[i >> 6] & (1n << BigInt(i & 63))) !== 0n
 */

import { createHash } from 'node:crypto';
import { z } from 'zod';

export const ALIGNED_BITSET_BLOB_V1_SCHEMA = 'atlas.aligned-bitset-blob.v1' as const;
export const ALIGNMENT_BYTES = 64;
export const HEADER_BYTES = 64;
export const MAGIC_ATLASBIT_STRING = 'ATLASBIT'; // 8-byte ASCII magic
export const MAGIC_ATLASBIT_U64 = 0x54494253414c5441n; // 'ATLASBIT' as uint64 LE
export const CURRENT_VERSION = 1;
export const BITS_PER_WORD = 64;
export const BYTES_PER_WORD = 8;
export const WORDS_PER_CACHE_LINE = 8; // 8 words * 8 bytes = 64 bytes = 512 bits

export const AlignedBitsetBlobHeaderSchema = z.object({
  magic: z.literal(MAGIC_ATLASBIT_STRING),
  version: z.number().int().min(1),
  bitCount: z.number().int().nonnegative(),
  wordCount: z.bigint().nonnegative(),
  sha256Hex: z.string().length(64),
  capacityWords: z.number().int().nonnegative(),
  totalByteLength: z.number().int().nonnegative(),
});

export type AlignedBitsetBlobHeader = z.infer<typeof AlignedBitsetBlobHeaderSchema>;

export interface AlignedBitsetBlobV1 {
  readonly schema: typeof ALIGNED_BITSET_BLOB_V1_SCHEMA;
  readonly bitCount: number;
  readonly wordCount: number;
  readonly capacityWords: number;
  readonly totalByteLength: number;
  readonly sha256Hex: string;
  /** 64-bit typed view over the payload at a logically aligned byte offset */
  readonly words: BigUint64Array;
  /** Raw backing byte buffer (header + payload) */
  readonly rawBuffer: ArrayBuffer;
}

export interface AlignedBitsetLayoutProofV1 {
  readonly payloadByteOffset: number;
  readonly payloadOffsetDivisibleBy8: boolean;
  readonly totalByteLengthDivisibleBy64: boolean;
  readonly physicalBaseAddressAlignment: 'NOT_INSPECTABLE_IN_JAVASCRIPT';
  readonly deviceBindingAlignment: 'NOT_PROVEN';
}

export function inspectAlignedBitsetLayoutV1(blob: AlignedBitsetBlobV1): AlignedBitsetLayoutProofV1 {
  const proof: AlignedBitsetLayoutProofV1 = {
    payloadByteOffset: blob.words.byteOffset,
    payloadOffsetDivisibleBy8: blob.words.byteOffset % BYTES_PER_WORD === 0,
    totalByteLengthDivisibleBy64: blob.totalByteLength % ALIGNMENT_BYTES === 0,
    physicalBaseAddressAlignment: 'NOT_INSPECTABLE_IN_JAVASCRIPT',
    deviceBindingAlignment: 'NOT_PROVEN',
  };
  if (blob.words.buffer !== blob.rawBuffer
    || blob.words.byteOffset !== HEADER_BYTES
    || blob.words.byteLength !== blob.capacityWords * BYTES_PER_WORD
    || blob.rawBuffer.byteLength !== blob.totalByteLength
    || !proof.payloadOffsetDivisibleBy8
    || !proof.totalByteLengthDivisibleBy64) {
    throw new Error('ALIGNED_BITSET_LOGICAL_LAYOUT_INVALID');
  }
  return proof;
}

/**
 * Computes 32-byte SHA256 digest over the active words payload (wordCount * 8 bytes).
 */
export function computePayloadSha256(rawBuffer: ArrayBuffer, wordCount: number): Buffer {
  const activeBytes = wordCount * BYTES_PER_WORD;
  const payloadView = new Uint8Array(rawBuffer, HEADER_BYTES, activeBytes);
  return createHash('sha256').update(payloadView).digest();
}

/**
 * Calculates the required 64-byte padded word capacity for a given number of bits.
 * TotalBytes = 64 (header) + 8 * (ceil(word_count / 8) * 8)
 */
export function calculateCapacityWords(bitCount: number): { wordCount: number; capacityWords: number; totalBytes: number } {
  const wordCount = Math.ceil(bitCount / BITS_PER_WORD);
  const remainder = wordCount % WORDS_PER_CACHE_LINE;
  const capacityWords = remainder === 0 ? Math.max(WORDS_PER_CACHE_LINE, wordCount) : wordCount + (WORDS_PER_CACHE_LINE - remainder);
  const totalBytes = HEADER_BYTES + capacityWords * BYTES_PER_WORD;
  return { wordCount, capacityWords, totalBytes };
}

/**
 * Allocates and initializes a logically padded bitset blob using the ATLASBIT contract.
 */
export function createAlignedBitsetBlob(
  bitCount: number,
  initialSetBits: readonly number[] = []
): AlignedBitsetBlobV1 {
  if (bitCount < 0) {
    throw new Error(`ALIGNED_BITSET_INVALID_BIT_COUNT: ${bitCount}`);
  }

  const { wordCount, capacityWords, totalBytes } = calculateCapacityWords(bitCount);
  const rawBuffer = new ArrayBuffer(totalBytes);
  const headerView = new DataView(rawBuffer, 0, HEADER_BYTES);
  const headerBytes = new Uint8Array(rawBuffer, 0, HEADER_BYTES);

  // [0..7]: magic 'ATLASBIT'
  for (let i = 0; i < 8; i++) {
    headerBytes[i] = MAGIC_ATLASBIT_STRING.charCodeAt(i);
  }

  // [8..11]: version (uint32 LE)
  headerView.setUint32(8, CURRENT_VERSION, true);

  // [12..15]: bit_count (uint32 LE)
  headerView.setUint32(12, bitCount, true);

  // [16..23]: word_count (uint64 LE)
  headerView.setBigUint64(16, BigInt(wordCount), true);

  // Payload words view begins at byte offset 64
  const words = new BigUint64Array(rawBuffer, HEADER_BYTES, capacityWords);

  // Populate initial bits using bit indexing formula: i >> 6, i & 63
  for (const bit of initialSetBits) {
    if (bit >= 0 && bit < bitCount) {
      const wordIdx = bit >> 6;
      const bitOffset = BigInt(bit & 63);
      words[wordIdx] |= (1n << bitOffset);
    }
  }

  // [24..55]: sha256_checksum (32 bytes)
  const checksum = computePayloadSha256(rawBuffer, wordCount);
  new Uint8Array(rawBuffer, 24, 32).set(checksum);

  // [56..63]: padding (8 bytes zeros)
  new Uint8Array(rawBuffer, 56, 8).fill(0);

  const blob = {
    schema: ALIGNED_BITSET_BLOB_V1_SCHEMA,
    bitCount,
    wordCount,
    capacityWords,
    totalByteLength: totalBytes,
    sha256Hex: checksum.toString('hex'),
    words,
    rawBuffer,
  } satisfies AlignedBitsetBlobV1;
  inspectAlignedBitsetLayoutV1(blob);
  return blob;
}

/**
 * Gets the boolean value of a bit at candidate ordinal i:
 * Word index: i >> 6
 * Bit position: i & 63
 * Check: (words[i >> 6] & (1ULL << (i & 63))) != 0
 */
export function getBit(blob: AlignedBitsetBlobV1, i: number): boolean {
  if (i < 0 || i >= blob.bitCount) {
    return false;
  }
  const wordIdx = i >> 6;
  const bitOffset = BigInt(i & 63);
  return (blob.words[wordIdx] & (1n << bitOffset)) !== 0n;
}

/**
 * Sets or clears a bit at candidate ordinal i, updating the header sha256 checksum.
 */
export function setBit(blob: AlignedBitsetBlobV1, i: number, value: boolean = true): void {
  if (i < 0 || i >= blob.bitCount) {
    throw new RangeError(`ALIGNED_BITSET_OUT_OF_BOUNDS: index ${i} outside [0, ${blob.bitCount})`);
  }
  const wordIdx = i >> 6;
  const bitOffset = BigInt(i & 63);

  if (value) {
    blob.words[wordIdx] |= (1n << bitOffset);
  } else {
    blob.words[wordIdx] &= ~(1n << bitOffset);
  }

  // Update header sha256 checksum
  const newChecksum = computePayloadSha256(blob.rawBuffer, blob.wordCount);
  new Uint8Array(blob.rawBuffer, 24, 32).set(newChecksum);
  (blob as { sha256Hex: string }).sha256Hex = newChecksum.toString('hex');
}

/**
 * Toggles a bit at candidate ordinal i and returns the new value.
 */
export function toggleBit(blob: AlignedBitsetBlobV1, i: number): boolean {
  const current = getBit(blob, i);
  setBit(blob, i, !current);
  return !current;
}

/**
 * Branchless 32-bit population count (Hamming weight).
 */
export function popcount32(v: number): number {
  v = (v - ((v >>> 1) & 0x55555555)) >>> 0;
  v = (((v & 0x33333333) + ((v >>> 2) & 0x33333333))) >>> 0;
  return (((((v + (v >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 0) >>> 24);
}

/**
 * Popcount: Constant-time bit-parallel population count (Hamming weight) across all words.
 * Emulates SIMD vector popcount with O(wordCount) zero-heap allocations.
 */
export function popcount(blob: AlignedBitsetBlobV1): number {
  let totalCount = 0;
  const words = blob.words;
  const wordCount = blob.wordCount;

  for (let i = 0; i < wordCount; i++) {
    let w = words[i];
    if (w === 0n) continue;

    // Mask out bits beyond bitCount for the last partial word
    if (i === wordCount - 1) {
      const activeBitsInLastWord = blob.bitCount & 63;
      if (activeBitsInLastWord > 0) {
        const mask = (1n << BigInt(activeBitsInLastWord)) - 1n;
        w &= mask;
      }
    }

    const low = Number(w & 0xffffffffn);
    const high = Number((w >> 32n) & 0xffffffffn);
    totalCount += popcount32(low) + popcount32(high);
  }

  return totalCount;
}

/**
 * Fast Intersection: Pairwise candidate intersection (e.g., AST_DEFINED & SOURCE_PROVEN)
 * executes 8 words per cycle, followed by sha256 update.
 */
export function bitwiseAnd(a: AlignedBitsetBlobV1, b: AlignedBitsetBlobV1): AlignedBitsetBlobV1 {
  const minBits = Math.min(a.bitCount, b.bitCount);
  const result = createAlignedBitsetBlob(minBits);
  const wordsToProcess = Math.min(a.wordCount, b.wordCount);

  for (let i = 0; i < wordsToProcess; i++) {
    result.words[i] = a.words[i] & b.words[i];
  }

  const checksum = computePayloadSha256(result.rawBuffer, result.wordCount);
  new Uint8Array(result.rawBuffer, 24, 32).set(checksum);
  (result as { sha256Hex: string }).sha256Hex = checksum.toString('hex');

  return result;
}

/**
 * Fast Union: Pairwise candidate union across all active words.
 */
export function bitwiseOr(a: AlignedBitsetBlobV1, b: AlignedBitsetBlobV1): AlignedBitsetBlobV1 {
  const maxBits = Math.max(a.bitCount, b.bitCount);
  const result = createAlignedBitsetBlob(maxBits);

  for (let i = 0; i < a.wordCount; i++) {
    result.words[i] |= a.words[i];
  }
  for (let i = 0; i < b.wordCount; i++) {
    result.words[i] |= b.words[i];
  }

  const checksum = computePayloadSha256(result.rawBuffer, result.wordCount);
  new Uint8Array(result.rawBuffer, 24, 32).set(checksum);
  (result as { sha256Hex: string }).sha256Hex = checksum.toString('hex');

  return result;
}

/**
 * Computes Jaccard Similarity between two bitsets: |A ∩ B| / |A ∪ B|.
 */
export function jaccardSimilarity(a: AlignedBitsetBlobV1, b: AlignedBitsetBlobV1): number {
  const intersectionCount = popcount(bitwiseAnd(a, b));
  const unionCount = popcount(bitwiseOr(a, b));
  if (unionCount === 0) return 1.0;
  return intersectionCount / unionCount;
}

/**
 * Returns an array of all candidate ordinals where the bit is set (1).
 */
export function getSetBits(blob: AlignedBitsetBlobV1): number[] {
  const indices: number[] = [];
  const words = blob.words;
  const wordCount = blob.wordCount;

  for (let wIdx = 0; wIdx < wordCount; wIdx++) {
    let w = words[wIdx];
    if (w === 0n) continue;

    const baseOffset = wIdx << 6;
    for (let b = 0; b < BITS_PER_WORD; b++) {
      const bitIndex = baseOffset + b;
      if (bitIndex >= blob.bitCount) break;
      if ((w & (1n << BigInt(b))) !== 0n) {
        indices.push(bitIndex);
      }
    }
  }

  return indices;
}

/**
 * Serializes the aligned bitset blob into a standard byte buffer suitable for PostgreSQL bytea insertion.
 */
export function toPostgresBytea(blob: AlignedBitsetBlobV1): Buffer {
  return Buffer.from(blob.rawBuffer);
}

/**
 * Deserializes an aligned bitset blob from a binary buffer (PostgreSQL bytea or network buffer).
 * Handles:
 * 1. Postgres varlena header detection: VARDATA begins at offset 4. If byte 0 is not 'ATLASBIT'
 *    but byte 4 is 'ATLASBIT', skips the 4-byte vl_len_ header.
 * 2. Exact Uint8Array view bounds (copies only the supplied bytes).
 * 3. Header verification (Magic: 'ATLASBIT', Version: 1, SHA256 checksum).
 */
export function fromPostgresBytea(input: Buffer | Uint8Array | ArrayBuffer): AlignedBitsetBlobV1 {
  const inputLength = input instanceof ArrayBuffer ? input.byteLength : input.byteLength;
  const rawBuffer = new ArrayBuffer(inputLength);
  let bytesView = new Uint8Array(rawBuffer);
  if (input instanceof ArrayBuffer) {
    bytesView.set(new Uint8Array(input));
  } else {
    bytesView.set(new Uint8Array(input.buffer, input.byteOffset, input.byteLength));
  }
  let effectiveOffset = 0;

  // Check magic 'ATLASBIT' at offset 0
  let isAtlasBitAt0 = bytesView.length >= 8 &&
    String.fromCharCode(...bytesView.slice(0, 8)) === MAGIC_ATLASBIT_STRING;

  // Check PostgreSQL varlena header: if byte 0 is not ATLASBIT, check byte 4
  if (!isAtlasBitAt0 && bytesView.length >= HEADER_BYTES + 4) {
    const isAtlasBitAt4 = String.fromCharCode(...bytesView.slice(4, 12)) === MAGIC_ATLASBIT_STRING;
    if (isAtlasBitAt4) {
      effectiveOffset += 4;
      bytesView = new Uint8Array(rawBuffer, effectiveOffset);
      isAtlasBitAt0 = true;
    }
  }

  if (!isAtlasBitAt0) {
    const foundMagic = String.fromCharCode(...bytesView.slice(0, Math.min(8, bytesView.length)));
    throw new Error(`ALIGNED_BITSET_INVALID_MAGIC: expected '${MAGIC_ATLASBIT_STRING}', got '${foundMagic}'`);
  }

  const headerView = new DataView(rawBuffer, effectiveOffset, HEADER_BYTES);
  const version = headerView.getUint32(8, true);
  if (version !== CURRENT_VERSION) {
    throw new Error(`ALIGNED_BITSET_UNSUPPORTED_VERSION: expected ${CURRENT_VERSION}, got ${version}`);
  }

  const bitCount = headerView.getUint32(12, true);
  const wordCount = Number(headerView.getBigUint64(16, true));
  const storedSha256 = Buffer.from(rawBuffer, effectiveOffset + 24, 32);

  const { capacityWords, totalBytes } = calculateCapacityWords(bitCount);
  if (!Number.isSafeInteger(wordCount)
    || wordCount !== Math.ceil(bitCount / BITS_PER_WORD)
    || effectiveOffset + totalBytes > rawBuffer.byteLength) {
    throw new Error('ALIGNED_BITSET_CORRUPT_HEADER');
  }

  // Ensure 8-byte alignment for BigUint64Array view over payload
  let finalBuffer: ArrayBuffer;
  if (effectiveOffset % 8 === 0 && rawBuffer.byteLength >= effectiveOffset + totalBytes) {
    if (effectiveOffset === 0 && rawBuffer.byteLength === totalBytes) {
      finalBuffer = rawBuffer;
    } else {
      finalBuffer = rawBuffer.slice(effectiveOffset, effectiveOffset + totalBytes);
    }
  } else {
    // Re-align unaligned buffer slice into a clean ArrayBuffer
    const alignedBuffer = new ArrayBuffer(totalBytes);
    new Uint8Array(alignedBuffer).set(
      new Uint8Array(rawBuffer, effectiveOffset, totalBytes)
    );
    finalBuffer = alignedBuffer;
  }

  const words = new BigUint64Array(finalBuffer, HEADER_BYTES, capacityWords);
  const computedSha256 = computePayloadSha256(finalBuffer, wordCount);

  if (!storedSha256.equals(computedSha256)) {
    throw new Error(`ALIGNED_BITSET_CHECKSUM_MISMATCH: stored sha256:${storedSha256.toString('hex')} vs computed sha256:${computedSha256.toString('hex')}`);
  }

  const blob = {
    schema: ALIGNED_BITSET_BLOB_V1_SCHEMA,
    bitCount,
    wordCount,
    capacityWords,
    totalByteLength: totalBytes,
    sha256Hex: computedSha256.toString('hex'),
    words,
    rawBuffer: finalBuffer,
  } satisfies AlignedBitsetBlobV1;
  inspectAlignedBitsetLayoutV1(blob);
  return blob;
}

/**
 * Returns the padded byte layout; it does not prove physical or device-binding alignment.
 */
export function toWebGpuAlignedBuffer(blob: AlignedBitsetBlobV1): ArrayBuffer {
  if (blob.totalByteLength % ALIGNMENT_BYTES !== 0) {
    throw new Error(`ALIGNED_BITSET_WEBGPU_ALIGNMENT_ERROR: length ${blob.totalByteLength} not multiple of ${ALIGNMENT_BYTES}`);
  }
  return blob.rawBuffer;
}
