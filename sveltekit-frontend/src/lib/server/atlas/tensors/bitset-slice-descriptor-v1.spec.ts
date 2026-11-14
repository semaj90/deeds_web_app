import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  assertBitsetSliceBindingV1,
  BitsetSliceDescriptorV1Schema,
  convertPackedBitOrderV1,
  verifyBitsetSliceBytesV1,
  type BitsetSliceDescriptorV1,
} from './bitset-slice-descriptor-v1.js';

const revision = (letter: string) => `sha256:${letter.repeat(64)}`;
const bytesHash = (bytes: Uint8Array) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;

function descriptor(bytes = new Uint8Array(16), overrides: Record<string, unknown> = {}): BitsetSliceDescriptorV1 {
  return BitsetSliceDescriptorV1Schema.parse({
    schema: 'atlas.bitset-slice-descriptor.v1',
    format: 'mmap_raw',
    mmapPath: 'bitsets/workspace-a/feature-rows.bin',
    offset: 64,
    length: bytes.byteLength,
    alignmentBytes: 64,
    bitCount: bytes.byteLength * 8,
    bitOrder: 'LSB0',
    endianness: 'LE',
    sha256: bytesHash(bytes),
    workspaceRevision: revision('a'),
    sourceRevision: revision('b'),
    candidateSnapshotRevision: revision('c'),
    representationRevision: revision('d'),
    ordinalMapChecksum: revision('e'),
    canonicalAuthority: false,
    writesPerformed: false,
    ...overrides,
  });
}

describe('BitsetSliceDescriptorV1', () => {
  it('validates a read-only, revision-bound mmap byte slice', () => {
    const bytes = Uint8Array.from({ length: 16 }, (_, index) => index);
    const parsed = descriptor(bytes);
    expect(parsed.format).toBe('mmap_raw');
    expect(parsed.bitOrder).toBe('LSB0');
    expect(parsed.endianness).toBe('LE');
    expect(() => verifyBitsetSliceBytesV1(parsed, bytes)).not.toThrow();
  });

  it.each(['../secret.bin', '/absolute/file.bin', 'C:/private/file.bin', 'folder\\file.bin', 'a//b.bin'])(
    'rejects unsafe or non-normalized artifact paths: %s',
    (mmapPath) => {
      expect(BitsetSliceDescriptorV1Schema.safeParse({ ...descriptor(), mmapPath }).success).toBe(false);
    },
  );

  it('rejects an offset that violates the declared 64-byte alignment', () => {
    const parsed = BitsetSliceDescriptorV1Schema.safeParse({ ...descriptor(), offset: 65 });
    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(parsed.error.issues.some((issue) => issue.message === 'BITSET_SLICE_OFFSET_MISALIGNED')).toBe(true);
  });

  it('rejects a slice range that overflows safe integer addressing', () => {
    const parsed = BitsetSliceDescriptorV1Schema.safeParse({
      ...descriptor(),
      offset: Number.MAX_SAFE_INTEGER - 63,
      length: 128,
      bitCount: 1024,
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(parsed.error.issues.some((issue) => issue.message === 'BITSET_SLICE_RANGE_OVERFLOW')).toBe(true);
  });

  it('requires the byte extent to exactly cover the declared bits', () => {
    const parsed = BitsetSliceDescriptorV1Schema.safeParse({ ...descriptor(), bitCount: 129 });
    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(parsed.error.issues.some((issue) => issue.message === 'BITSET_SLICE_LENGTH_MISMATCH')).toBe(true);
  });

  it('requires an Arrow field locator and validates its buffer alignment', () => {
    const base = descriptor();
    const missingField = BitsetSliceDescriptorV1Schema.safeParse({ ...base, format: 'arrow_ipc', alignmentBytes: 8 });
    expect(missingField.success).toBe(false);
    if (!missingField.success) expect(missingField.error.issues.some((issue) => issue.message === 'ARROW_BITSET_FIELD_REF_REQUIRED')).toBe(true);

    expect(BitsetSliceDescriptorV1Schema.safeParse({
      ...base,
      format: 'arrow_ipc',
      fieldRef: 'candidate_signatures',
      alignmentBytes: 8,
    }).success).toBe(true);
  });

  it('hashes only the referenced Uint8Array view and rejects tampered bytes', () => {
    const backing = Uint8Array.from([0xee, 0x12, 0x34, 0xdd]);
    const view = backing.subarray(1, 3);
    const slice = descriptor(view, { length: 2, bitCount: 16, sha256: bytesHash(view) });
    expect(() => verifyBitsetSliceBytesV1(slice, view)).not.toThrow();
    expect(() => verifyBitsetSliceBytesV1(slice, backing)).toThrow('BITSET_SLICE_BYTE_LENGTH_MISMATCH');
    expect(() => verifyBitsetSliceBytesV1(slice, Uint8Array.from([0x12, 0x35]))).toThrow('BITSET_SLICE_CHECKSUM_MISMATCH');
  });

  it('rejects nonzero unused high bits in the final LSB0 byte', () => {
    const bytes = Uint8Array.from([0b1000_0011]);
    const value = descriptor(bytes, { length: 1, bitCount: 2, sha256: bytesHash(bytes) });
    expect(() => verifyBitsetSliceBytesV1(value, bytes)).toThrow('BITSET_SLICE_NONZERO_PADDING_BITS');
  });

  it('rejects a descriptor from a different workspace or representation revision', () => {
    const value = descriptor();
    expect(() => assertBitsetSliceBindingV1(value, {
      workspaceRevision: revision('f'),
      sourceRevision: value.sourceRevision,
      candidateSnapshotRevision: value.candidateSnapshotRevision,
      representationRevision: value.representationRevision,
      ordinalMapChecksum: value.ordinalMapChecksum,
    })).toThrow('BITSET_SLICE_BINDING_MISMATCH:workspaceRevision');
    expect(() => assertBitsetSliceBindingV1(value, {
      workspaceRevision: value.workspaceRevision,
      sourceRevision: value.sourceRevision,
      candidateSnapshotRevision: value.candidateSnapshotRevision,
      representationRevision: revision('f'),
      ordinalMapChecksum: value.ordinalMapChecksum,
    })).toThrow('BITSET_SLICE_BINDING_MISMATCH:representationRevision');
  });

  it('converts TurboVec MSB0 bytes to Atlas LSB0 without changing logical indices', () => {
    const msb0 = new Uint8Array(16);
    msb0[0] = 0b1000_0001; // bits 0 and 7
    msb0[1] = 0b1000_0000; // bit 8
    msb0[15] = 0b0000_0001; // bit 127
    const lsb0 = convertPackedBitOrderV1(msb0, 128, 'MSB0', 'LSB0');
    expect(Array.from(lsb0)).toEqual(expect.arrayContaining([0b1000_0001, 0b0000_0001]));
    expect(lsb0[0]).toBe(0b1000_0001);
    expect(lsb0[1]).toBe(0b0000_0001);
    expect(lsb0[15]).toBe(0b1000_0000);
    expect(convertPackedBitOrderV1(lsb0, 128, 'LSB0', 'MSB0')).toEqual(msb0);
    expect(lsb0).not.toBe(msb0);
  });

  it('rejects nonzero tail padding in either bit order', () => {
    expect(() => convertPackedBitOrderV1(Uint8Array.of(0b0000_0001), 1, 'MSB0', 'LSB0')).toThrow('BIT_ORDER_NONZERO_PADDING');
    expect(() => convertPackedBitOrderV1(Uint8Array.of(0b1000_0000), 1, 'LSB0', 'MSB0')).toThrow('BIT_ORDER_NONZERO_PADDING');
  });
});
