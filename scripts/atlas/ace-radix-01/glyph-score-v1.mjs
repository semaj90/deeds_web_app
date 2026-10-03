#!/usr/bin/env node
/**
 * GlyphScoreV1 -- CUTILE-ACE-01 LEVEL 2 CPU oracle.
 *
 * Pure-integer (no floating point), additive-only scoring formula over
 * PacketGlyphV1 fields. Designed fresh for
 * openspec/changes/parent-atlas-cutile-ace-level2 -- no prior formula existed
 * anywhere in this repo (verified via rg before writing this).
 *
 * Deliberately excludes somCell (root CLAUDE.md: SOM is "never retrieval
 * truth") and projectionOrdinal (packet-glyph-v1.ts: "a non-canonical
 * GPU-local coordinate, same treatment as gpuNodeId") -- neither is a
 * utility signal.
 *
 * Reuses the existing glyph fixture generator (fixture-v1.mjs) rather than
 * building a new one, per this repo's Duplication Prevention rule.
 */

// Named constants -- MUST match native/cutile-ace-level2/glyph_kernels_bench.cu
// exactly (name and value), so the CPU oracle and GPU kernel stay directly
// auditable against each other (design.md Decision 1's "Weights are named
// constants" requirement).
export const GLYPH_SCORE_W_PAGERANK = 4;
export const GLYPH_SCORE_W_RECENCY = 3;
export const GLYPH_SCORE_W_RESIDENCY = 2;
export const GLYPH_SCORE_W_LOD = 1;
export const GLYPH_SCORE_W_FEATURE_POPCOUNT = 50;
export const GLYPH_SCORE_W_FLAG_POPCOUNT = 50;

/**
 * 16-bit popcount, implemented explicitly (not via a library function) so
 * the CPU oracle and GPU kernel's bit-counting algorithm are both directly
 * inspectable rather than trusting two different opaque implementations to
 * agree.
 * @param {number} value 0..65535
 * @returns {number} 0..16
 */
export function popcount16(value) {
  let v = value & 0xffff;
  let count = 0;
  while (v !== 0) {
    count += v & 1;
    v >>>= 1;
  }
  return count;
}

/**
 * @param {{ pagerankQuantized: number, recency: number, residency: number, lod: number, featureBits: number, flags: number }} glyph
 * @returns {number} the GlyphScoreV1 value (integer, max 656,950 -- see design.md Decision 1 / tasks.md 2.1)
 */
export function computeGlyphScoreV1Reference(glyph) {
  const { pagerankQuantized, recency, residency, lod, featureBits, flags } = glyph;
  return (
    pagerankQuantized * GLYPH_SCORE_W_PAGERANK +
    recency * GLYPH_SCORE_W_RECENCY +
    residency * 257 * GLYPH_SCORE_W_RESIDENCY +
    lod * 257 * GLYPH_SCORE_W_LOD +
    popcount16(featureBits) * GLYPH_SCORE_W_FEATURE_POPCOUNT +
    popcount16(flags) * GLYPH_SCORE_W_FLAG_POPCOUNT
  );
}

/**
 * @param {Array<Record<string, number>>} glyphs
 * @returns {number[]} one GlyphScoreV1 value per glyph, same order
 */
export function computeGlyphScoresV1Reference(glyphs) {
  return glyphs.map(computeGlyphScoreV1Reference);
}

/**
 * Packs each glyph into the exact 16-byte little-endian layout
 * PacketGlyphV1's own docstring specifies (~16 bytes/candidate):
 *   uint32 projectionOrdinal, uint16 featureBits, uint8 lod, uint8 residency,
 *   uint16 pagerankQuantized, uint16 recency, uint16 somCell, uint16 flags
 * This is the raw-glyph input format native/cutile-ace-level2/glyph_kernels_bench.cu
 * reads -- distinct from fixture-v1.mjs's packedKeysToBuffer(), which writes
 * ALREADY-PACKED 64-bit sort keys (a different, downstream format).
 * @param {Array<Record<string, number>>} glyphs
 * @returns {Buffer}
 */
/**
 * @param {number[]} scores
 * @returns {Buffer} little-endian uint32 array, one per score
 */
export function glyphScoresToBuffer(scores) {
  const buffer = Buffer.alloc(scores.length * 4);
  for (let i = 0; i < scores.length; i += 1) {
    buffer.writeUInt32LE(scores[i], i * 4);
  }
  return buffer;
}

export function glyphsToBuffer(glyphs) {
  const buffer = Buffer.alloc(glyphs.length * 16);
  for (let i = 0; i < glyphs.length; i += 1) {
    const g = glyphs[i];
    const offset = i * 16;
    buffer.writeUInt32LE(g.projectionOrdinal, offset + 0);
    buffer.writeUInt16LE(g.featureBits, offset + 4);
    buffer.writeUInt8(g.lod, offset + 6);
    buffer.writeUInt8(g.residency, offset + 7);
    buffer.writeUInt16LE(g.pagerankQuantized, offset + 8);
    buffer.writeUInt16LE(g.recency, offset + 10);
    buffer.writeUInt16LE(g.somCell, offset + 12);
    buffer.writeUInt16LE(g.flags, offset + 14);
  }
  return buffer;
}
