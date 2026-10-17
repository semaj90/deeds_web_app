import { describe, it, expect } from 'vitest';
import {
  createAlignedBitsetBlob,
  getBit,
  setBit,
  toggleBit,
  popcount,
  bitwiseAnd,
  bitwiseOr,
  jaccardSimilarity,
  getSetBits,
  toPostgresBytea,
  fromPostgresBytea,
  toWebGpuAlignedBuffer,
  ALIGNMENT_BYTES,
  HEADER_BYTES,
  MAGIC_ATLASBIT_STRING,
  inspectAlignedBitsetLayoutV1,
} from './aligned-bitset-blob-v1.js';

describe('AlignedBitsetBlobV1 (Parent Atlas 64-Byte-Padded ATLASBIT BLOB Contract)', () => {
  it('enforces the 64-byte ATLASBIT header and padded total length', () => {
    // 100 bits requires 2 words (128 bits), padded to 8 words (512 bits = 64 bytes)
    const blob = createAlignedBitsetBlob(100);

    expect(blob.bitCount).toBe(100);
    expect(blob.wordCount).toBe(2);
    expect(blob.capacityWords).toBe(8); // padded to 8 words (64 bytes = 1 cache line)
    expect(blob.totalByteLength).toBe(HEADER_BYTES + 64); // 64 header + 64 payload = 128 bytes
    expect(blob.totalByteLength % ALIGNMENT_BYTES).toBe(0);

    // Verify 64-byte header magic in raw buffer: 'ATLASBIT' (8 bytes)
    const rawBytes = new Uint8Array(blob.rawBuffer, 0, 8);
    const magicStr = String.fromCharCode(...rawBytes);
    expect(magicStr).toBe(MAGIC_ATLASBIT_STRING);

    const view = new DataView(blob.rawBuffer);
    expect(view.getUint32(8, true)).toBe(1); // Version: uint32
    expect(view.getUint32(12, true)).toBe(100); // bit_count: uint32
    expect(view.getBigUint64(16, true)).toBe(2n); // word_count: uint64
    expect(blob.sha256Hex).toHaveLength(64); // 32-byte sha256 hex string
    expect(inspectAlignedBitsetLayoutV1(blob)).toMatchObject({
      payloadByteOffset: HEADER_BYTES,
      payloadOffsetDivisibleBy8: true,
      totalByteLengthDivisibleBy64: true,
      physicalBaseAddressAlignment: 'NOT_INSPECTABLE_IN_JAVASCRIPT',
      deviceBindingAlignment: 'NOT_PROVEN',
    });
  });

  it('correctly indexes candidate ordinals using i >> 6 and i & 63', () => {
    const blob = createAlignedBitsetBlob(1000);

    expect(getBit(blob, 0)).toBe(false);
    expect(getBit(blob, 63)).toBe(false);
    expect(getBit(blob, 64)).toBe(false);

    setBit(blob, 0, true);
    setBit(blob, 63, true);
    setBit(blob, 64, true);
    setBit(blob, 999, true);

    expect(getBit(blob, 0)).toBe(true);
    expect(getBit(blob, 63)).toBe(true);
    expect(getBit(blob, 64)).toBe(true);
    expect(getBit(blob, 999)).toBe(true);
    expect(getBit(blob, 500)).toBe(false);

    // Toggle bit
    const toggled = toggleBit(blob, 500);
    expect(toggled).toBe(true);
    expect(getBit(blob, 500)).toBe(true);
    expect(toggleBit(blob, 500)).toBe(false);
    expect(getBit(blob, 500)).toBe(false);

    // Out-of-bounds checking
    expect(() => setBit(blob, 1000)).toThrow(/ALIGNED_BITSET_OUT_OF_BOUNDS/);
    expect(getBit(blob, 1000)).toBe(false);
    expect(getBit(blob, -1)).toBe(false);
  });

  it('performs constant-time bit-parallel popcount accurately without overcounting padded bits', () => {
    const bitIndices = [0, 1, 7, 63, 64, 65, 127, 255, 511, 767];
    const blob = createAlignedBitsetBlob(800, bitIndices);

    expect(popcount(blob)).toBe(bitIndices.length);
    expect(getSetBits(blob)).toEqual(bitIndices);

    // Setting a bit increases popcount
    setBit(blob, 100, true);
    expect(popcount(blob)).toBe(bitIndices.length + 1);

    // Clearing a bit decreases popcount
    setBit(blob, 0, false);
    expect(popcount(blob)).toBe(bitIndices.length);
  });

  it('computes fast SIMD bitwise intersection, union, and Jaccard similarity', () => {
    // A has bits [0, 1, 2]
    // B has bits [2, 3, 4]
    // A & B has bit [2] -> 1
    // A | B has bits [0, 1, 2, 3, 4] -> 5
    // Jaccard similarity = 1 / 5 = 0.2
    const a = createAlignedBitsetBlob(10, [0, 1, 2]);
    const b = createAlignedBitsetBlob(10, [2, 3, 4]);

    const andBlob = bitwiseAnd(a, b);
    expect(getSetBits(andBlob)).toEqual([2]);
    expect(popcount(andBlob)).toBe(1);

    const orBlob = bitwiseOr(a, b);
    expect(getSetBits(orBlob)).toEqual([0, 1, 2, 3, 4]);
    expect(popcount(orBlob)).toBe(5);

    expect(jaccardSimilarity(a, b)).toBeCloseTo(0.2, 5);
  });

  it('handles PostgreSQL bytea serialization, deserialization, and varlena 4-byte offset shift', () => {
    const original = createAlignedBitsetBlob(200, [10, 42, 99, 150]);
    const byteaBuffer = toPostgresBytea(original);

    // Standard roundtrip
    const restored = fromPostgresBytea(byteaBuffer);
    expect(restored.bitCount).toBe(original.bitCount);
    expect(restored.wordCount).toBe(original.wordCount);
    expect(restored.sha256Hex).toBe(original.sha256Hex);
    expect(getSetBits(restored)).toEqual([10, 42, 99, 150]);

    // Simulate PostgreSQL varlena 4-byte header offset on disk
    // [4 bytes dummy varlena header (vl_len_)] + [original 64-byte ATLASBIT header] + [payload]
    const varlenaPrefix = Buffer.alloc(4);
    varlenaPrefix.writeUInt32LE(byteaBuffer.length + 4, 0); // simulated vl_len_
    const rawDiskBytes = Buffer.concat([varlenaPrefix, byteaBuffer]);

    const restoredFromVarlena = fromPostgresBytea(rawDiskBytes);
    expect(restoredFromVarlena.bitCount).toBe(200);
    expect(getSetBits(restoredFromVarlena)).toEqual([10, 42, 99, 150]);
  });

  it('detects SHA256 checksum corruption and rejects tampered buffers', () => {
    const original = createAlignedBitsetBlob(100, [5, 10]);
    const bytea = toPostgresBytea(original);

    // Tamper with a payload byte (at offset 64 + 2)
    bytea[HEADER_BYTES + 2] ^= 0xff;

    expect(() => fromPostgresBytea(bytea)).toThrow(/ALIGNED_BITSET_CHECKSUM_MISMATCH/);
  });

  it('respects the exact byte window of a Uint8Array view', () => {
    const valid = toPostgresBytea(createAlignedBitsetBlob(8, [2]));
    const backing = Buffer.concat([valid, Buffer.from([0, 0, 0, 0])]);
    const truncatedView = backing.subarray(0, valid.byteLength - 1);

    expect(() => fromPostgresBytea(truncatedView)).toThrow();
  });

  it('provides a WebGPU cache-line aligned buffer', () => {
    const blob = createAlignedBitsetBlob(512); // exactly 512 bits = 8 words = 64 bytes payload
    const webgpuBuffer = toWebGpuAlignedBuffer(blob);

    expect(webgpuBuffer.byteLength).toBe(128); // 64 header + 64 payload
    expect(webgpuBuffer.byteLength % 64).toBe(0);
  });
});
