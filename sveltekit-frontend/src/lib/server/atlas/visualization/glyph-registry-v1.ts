import { z } from 'zod';

/**
 * GLYPH-REGISTRY-V1
 * 
 * Visualization codes for WebGPU / HTML5 Canvas debugging:
 * Maps archetypes (0x01..0x0A) to 1-byte sprite codes and instance attributes:
 * - 0x01: Source File
 * - 0x02: AST Symbol
 * - 0x03: Task
 * - 0x04: Receipt
 * - 0x05: Concept
 * - 0x06: Entity
 * - 0x07: Error
 * - 0x08: Patch Candidate
 * - 0x09: Test
 * - 0x0A: Model Adapter
 */

export const AtlasArchetypeCode: Record<string, number> = {
  SOURCE_FILE: 0x01,
  AST_SYMBOL: 0x02,
  TASK: 0x03,
  RECEIPT: 0x04,
  CONCEPT: 0x05,
  ENTITY: 0x06,
  ERROR: 0x07,
  PATCH_CANDIDATE: 0x08,
  TEST: 0x09,
  MODEL_ADAPTER: 0x0a,
};

export const GlyphInstanceDescriptorSchema = z
  .object({
    glyphOrdinal: z.number().int().min(1).max(255),
    domainOrdinal: z.number().int().min(0).max(255),
    stateFlags: z.number().int().min(0).max(255),
    lod: z.number().int().min(0).max(7),
  })
  .strict();

export type GlyphInstanceDescriptor = z.infer<typeof GlyphInstanceDescriptorSchema>;

export function buildGlyphInstance(
  archetype: keyof typeof AtlasArchetypeCode,
  domainOrdinal: number,
  stateFlags = 0,
  lod = 0,
): GlyphInstanceDescriptor {
  const glyphOrdinal = AtlasArchetypeCode[archetype];
  if (!glyphOrdinal) {
    throw new Error(`Unknown archetype: ${archetype}`);
  }
  return GlyphInstanceDescriptorSchema.parse({
    glyphOrdinal,
    domainOrdinal,
    stateFlags,
    lod,
  });
}

export function encodeGlyphVertex(descriptor: GlyphInstanceDescriptor): Uint8Array {
  const bytes = new Uint8Array(4);
  bytes[0] = descriptor.glyphOrdinal;
  bytes[1] = descriptor.domainOrdinal;
  bytes[2] = descriptor.stateFlags;
  bytes[3] = descriptor.lod;
  return bytes;
}

export function decodeGlyphVertex(bytes: Uint8Array): GlyphInstanceDescriptor {
  if (bytes.length < 4) throw new Error('Glyph vertex must have at least 4 bytes');
  return {
    glyphOrdinal: bytes[0],
    domainOrdinal: bytes[1],
    stateFlags: bytes[2],
    lod: bytes[3],
  };
}
