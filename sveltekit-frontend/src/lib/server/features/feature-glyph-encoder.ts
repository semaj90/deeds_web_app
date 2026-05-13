import { FeatureGlyphBits, type FeatureGlyph } from './feature-map.types.js';

/**
 * NES-style glyph encoder for feature state visualization.
 * Converts feature completeness into an 8-bit state mask and a 64-bit boolean array.
 */
export function encodeFeatureGlyph(input: {
  featureId: string;
  hasTypes?: boolean;
  hasService?: boolean;
  hasRoute?: boolean;
  hasTool?: boolean;
  hasTest?: boolean;
  hasDocs?: boolean;
  hasGraphEdge?: boolean;
  hasCachePacket?: boolean;
}): FeatureGlyph {
  let mask = 0;
  if (input.hasTypes) mask |= FeatureGlyphBits.HAS_TYPES;
  if (input.hasService) mask |= FeatureGlyphBits.HAS_SERVICE;
  if (input.hasRoute) mask |= FeatureGlyphBits.HAS_ROUTE;
  if (input.hasTool) mask |= FeatureGlyphBits.HAS_TOOL;
  if (input.hasTest) mask |= FeatureGlyphBits.HAS_TEST;
  if (input.hasDocs) mask |= FeatureGlyphBits.HAS_DOCS;
  if (input.hasGraphEdge) mask |= FeatureGlyphBits.HAS_GRAPH_EDGE;
  if (input.hasCachePacket) mask |= FeatureGlyphBits.HAS_CACHE_PACKET;

  // Expand the 8-bit mask into a 64-bit array (8x8 grid)
  const bits = Array.from({ length: 64 }, (_, i) => (mask >> (i % 8)) & 1);

  return {
    featureId: input.featureId,
    width: 8,
    height: 8,
    bits,
    mask
  };
}
