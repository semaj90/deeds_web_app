import { createHash } from 'node:crypto';
import { z } from 'zod';

const digest = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const relativeArtifactPath = z.string().min(1).max(512).refine((value) => {
  if (value.includes('\\') || value.startsWith('/') || value.includes(':') || value.includes('\0')) return false;
  const segments = value.split('/');
  return segments.every((segment) => segment.length > 0 && segment !== '.' && segment !== '..');
}, 'ARTIFACT_PATH_MUST_BE_RELATIVE_POSIX');

/**
 * Descriptor for a revision-bound byte slice containing a packed LSB0 bitset.
 * It is metadata only: callers must resolve mmapPath beneath an admitted,
 * read-only artifact root before opening it. Never open caller-provided paths.
 */
export const BitsetSliceDescriptorV1Schema = z.object({
  schema: z.literal('atlas.bitset-slice-descriptor.v1'),
  format: z.enum(['mmap_raw', 'arrow_ipc']),
  mmapPath: relativeArtifactPath,
  fieldRef: z.string().min(1).max(256).optional(),
  offset: z.number().int().nonnegative().safe(),
  length: z.number().int().positive().safe(),
  alignmentBytes: z.union([z.literal(8), z.literal(64)]),
  bitCount: z.number().int().positive().safe(),
  bitOrder: z.literal('LSB0'),
  endianness: z.literal('LE'),
  sha256: digest,
  workspaceRevision: digest,
  sourceRevision: digest,
  candidateSnapshotRevision: digest,
  representationRevision: digest,
  ordinalMapChecksum: digest,
  canonicalAuthority: z.literal(false),
  writesPerformed: z.literal(false),
}).strict().superRefine((value, ctx) => {
  if (value.offset % value.alignmentBytes !== 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['offset'], message: 'BITSET_SLICE_OFFSET_MISALIGNED' });
  }
  if (!Number.isSafeInteger(value.offset + value.length)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['length'], message: 'BITSET_SLICE_RANGE_OVERFLOW' });
  }
  if (value.length !== Math.ceil(value.bitCount / 8)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['length'], message: 'BITSET_SLICE_LENGTH_MISMATCH' });
  }
  if (value.format === 'arrow_ipc' && !value.fieldRef) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['fieldRef'], message: 'ARROW_BITSET_FIELD_REF_REQUIRED' });
  }
  if (value.format === 'mmap_raw' && value.fieldRef !== undefined) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['fieldRef'], message: 'RAW_MMAP_FIELD_REF_NOT_ALLOWED' });
  }
  if (value.format === 'mmap_raw' && value.alignmentBytes !== 64) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['alignmentBytes'], message: 'RAW_MMAP_REQUIRES_64_BYTE_ALIGNMENT' });
  }
});

export type BitsetSliceDescriptorV1 = z.infer<typeof BitsetSliceDescriptorV1Schema>;

export interface BitsetSliceBindingV1 {
  workspaceRevision: string;
  sourceRevision: string;
  candidateSnapshotRevision: string;
  representationRevision: string;
  ordinalMapChecksum: string;
}

export function assertBitsetSliceBindingV1(
  descriptor: BitsetSliceDescriptorV1,
  expected: BitsetSliceBindingV1,
): void {
  for (const key of [
    'workspaceRevision',
    'sourceRevision',
    'candidateSnapshotRevision',
    'representationRevision',
    'ordinalMapChecksum',
  ] as const) {
    if (descriptor[key] !== expected[key]) throw new Error(`BITSET_SLICE_BINDING_MISMATCH:${key}`);
  }
}

/** Verify the referenced slice bytes before handing them to a CPU/GPU adapter. */
export function verifyBitsetSliceBytesV1(
  descriptor: BitsetSliceDescriptorV1,
  bytes: Uint8Array,
): void {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength !== descriptor.length) {
    throw new Error('BITSET_SLICE_BYTE_LENGTH_MISMATCH');
  }
  const actual = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
  if (actual !== descriptor.sha256) throw new Error('BITSET_SLICE_CHECKSUM_MISMATCH');

  const remainingBits = descriptor.bitCount & 7;
  if (remainingBits !== 0) {
    const unusedMask = (0xff << remainingBits) & 0xff;
    if ((bytes[bytes.byteLength - 1]! & unusedMask) !== 0) {
      throw new Error('BITSET_SLICE_NONZERO_PADDING_BITS');
    }
  }
}
