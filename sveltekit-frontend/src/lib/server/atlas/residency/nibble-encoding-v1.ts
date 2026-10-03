import { z } from 'zod';
import {
  isLutRevisionCurrent,
  lutDecode,
  PacketClassLutV1Schema,
  type PacketClassLutV1,
} from './packet-class-lut-v1.js';

/**
 * NIBBLE-ENCODING-V1
 *
 * High/Low nibble packing for compact in-memory/WebGPU bitfields:
 * - High nibble (bits 4-7): sourceRole (0..15)
 * - Low nibble (bits 0-3): evidenceKind (0..15)
 *
 * Combined into a single uint8 byte (0..255).
 */

export const NibblePackedByteSchema = z
  .object({
    sourceRole: z.number().int().min(0).max(15),
    evidenceKind: z.number().int().min(0).max(15),
    packedByte: z.number().int().min(0).max(255),
  })
  .strict();

export type NibblePackedByte = z.infer<typeof NibblePackedByteSchema>;

export class NibbleRangeError extends Error {}

export function packNibbles(sourceRole: number, evidenceKind: number): number {
  if (sourceRole < 0 || sourceRole > 15 || !Number.isInteger(sourceRole)) {
    throw new NibbleRangeError(`sourceRole must be an integer in 0..15, got ${sourceRole}`);
  }
  if (evidenceKind < 0 || evidenceKind > 15 || !Number.isInteger(evidenceKind)) {
    throw new NibbleRangeError(`evidenceKind must be an integer in 0..15, got ${evidenceKind}`);
  }
  return ((sourceRole & 0x0f) << 4) | (evidenceKind & 0x0f);
}

export function unpackNibbles(packedByte: number): { sourceRole: number; evidenceKind: number } {
  if (packedByte < 0 || packedByte > 255 || !Number.isInteger(packedByte)) {
    throw new NibbleRangeError(`packedByte must be an integer in 0..255, got ${packedByte}`);
  }
  return {
    sourceRole: (packedByte >> 4) & 0x0f,
    evidenceKind: packedByte & 0x0f,
  };
}

export const RevisionQualifiedNibbleCodeV1Schema = z.object({
  schema: z.literal('atlas.revision-qualified-nibble-code.v1'),
  bytes: z.array(z.number().int().min(0).max(255)).min(1).max(2),
  sourceRoleEncodingRevision: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  evidenceKindEncodingRevision: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  canonicalAuthority: z.literal(false),
}).strict();

export type RevisionQualifiedNibbleCodeV1 = z.infer<typeof RevisionQualifiedNibbleCodeV1Schema>;

export class NibbleRevisionError extends Error {}

const EXTENDED_EVIDENCE_KIND_VERSION_V1 = 0x20;
const EXTENDED_EVIDENCE_KIND_VERSION_MASK = 0xe0;

function validateLutRevision(lut: PacketClassLutV1, label: string): void {
  if (!isLutRevisionCurrent(lut, lut.entries.map((entry) => entry.label))) {
    throw new NibbleRevisionError(`${label} LUT contents do not match encodingRevision`);
  }
}

export function packRevisionQualifiedNibblesV1(input: {
  sourceRole: number;
  evidenceKind: number;
  sourceRoleLut: PacketClassLutV1;
  evidenceKindLut: PacketClassLutV1;
}): RevisionQualifiedNibbleCodeV1 {
  const sourceLut = PacketClassLutV1Schema.parse(input.sourceRoleLut);
  const evidenceLut = PacketClassLutV1Schema.parse(input.evidenceKindLut);
  validateLutRevision(sourceLut, 'sourceRole');
  validateLutRevision(evidenceLut, 'evidenceKind');
  if (sourceLut.entries.length > 16) throw new NibbleRangeError('sourceRole LUT exceeds 16 entries');
  if (evidenceLut.entries.length > 32) throw new NibbleRangeError('evidenceKind LUT exceeds 32 entries');
  if (!sourceLut.entries.some((entry) => entry.code === input.sourceRole)) {
    throw new NibbleRangeError(`sourceRole code ${input.sourceRole} is absent from its LUT`);
  }
  if (!evidenceLut.entries.some((entry) => entry.code === input.evidenceKind)) {
    throw new NibbleRangeError(`evidenceKind code ${input.evidenceKind} is absent from its LUT`);
  }

  const bytes = input.evidenceKind <= 14
    ? [packNibbles(input.sourceRole, input.evidenceKind)]
    : [
        packNibbles(input.sourceRole, 15),
        EXTENDED_EVIDENCE_KIND_VERSION_V1 | input.evidenceKind,
      ];

  return RevisionQualifiedNibbleCodeV1Schema.parse({
    schema: 'atlas.revision-qualified-nibble-code.v1',
    bytes,
    sourceRoleEncodingRevision: sourceLut.encodingRevision,
    evidenceKindEncodingRevision: evidenceLut.encodingRevision,
    canonicalAuthority: false,
  });
}

export function unpackRevisionQualifiedNibblesV1(input: {
  code: RevisionQualifiedNibbleCodeV1;
  sourceRoleLut: PacketClassLutV1;
  evidenceKindLut: PacketClassLutV1;
}): { sourceRole: string; evidenceKind: string } {
  const code = RevisionQualifiedNibbleCodeV1Schema.parse(input.code);
  const sourceLut = PacketClassLutV1Schema.parse(input.sourceRoleLut);
  const evidenceLut = PacketClassLutV1Schema.parse(input.evidenceKindLut);
  validateLutRevision(sourceLut, 'sourceRole');
  validateLutRevision(evidenceLut, 'evidenceKind');
  if (code.sourceRoleEncodingRevision !== sourceLut.encodingRevision || code.evidenceKindEncodingRevision !== evidenceLut.encodingRevision) {
    throw new NibbleRevisionError('compact nibble code registry revision mismatch');
  }
  if (sourceLut.entries.length > 16 || evidenceLut.entries.length > 32) {
    throw new NibbleRangeError('compact nibble LUT exceeds its declared capacity');
  }

  const { sourceRole, evidenceKind: inlineEvidenceKind } = unpackNibbles(code.bytes[0]);
  let evidenceKind = inlineEvidenceKind;
  if (inlineEvidenceKind === 15) {
    if (code.bytes.length !== 2) throw new NibbleRangeError('extended evidence kind requires exactly one extension byte');
    const extension = code.bytes[1];
    if ((extension & EXTENDED_EVIDENCE_KIND_VERSION_MASK) !== EXTENDED_EVIDENCE_KIND_VERSION_V1) {
      throw new NibbleRangeError('unsupported or malformed evidence-kind extension version');
    }
    evidenceKind = extension & 0x1f;
    if (evidenceKind < 15) throw new NibbleRangeError('non-canonical extension for inline evidence kind');
  } else if (code.bytes.length !== 1) {
    throw new NibbleRangeError('inline evidence kind must not have trailing extension bytes');
  }

  const sourceRoleLabel = lutDecode(sourceLut, sourceRole);
  const evidenceKindLabel = lutDecode(evidenceLut, evidenceKind);
  if (sourceRoleLabel === null || evidenceKindLabel === null) {
    throw new NibbleRangeError('compact nibble code references a value absent from its revision-qualified LUT');
  }
  return { sourceRole: sourceRoleLabel, evidenceKind: evidenceKindLabel };
}
