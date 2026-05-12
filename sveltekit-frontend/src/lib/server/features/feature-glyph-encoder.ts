/**
 * src/lib/server/features/feature-glyph-encoder.ts
 *
 * Encodes FeatureMap state into bit flags and visual 8x8 glyphs.
 */

import type { FeatureMap, FeatureGlyph, FeatureGlyphBits } from './feature-map.types.js';

export const FeatureFlags = {
  HAS_TYPES: 1n << 0n,
  HAS_SERVICES: 1n << 1n,
  HAS_ROUTES: 1n << 2n,
  HAS_TOOLS: 1n << 3n,
  HAS_TESTS: 1n << 4n,
  HAS_DOCS: 1n << 5n,
  HAS_SVG: 1n << 6n,
  HAS_PROTO: 1n << 7n,
  STABLE: 1n << 8n,
  DRAFT: 1n << 9n,
  DEPRECATED: 1n << 10n,
  // ... more flags can be added up to 64
} as const;

export function encodeFeatureGlyph(feature: FeatureMap): FeatureGlyph {
  let flags = 0;

  const hasTypes = (feature.pathGroups.types?.length ?? 0) > 0;
  const hasServices = (feature.pathGroups.services?.length ?? 0) > 0;
  const hasRoutes = (feature.pathGroups.routes?.length ?? 0) > 0;
  const hasTools = (feature.pathGroups.tools?.length ?? 0) > 0;
  const hasTests = (feature.pathGroups.tests?.length ?? 0) > 0;
  const hasDocs = (feature.pathGroups.docs?.length ?? 0) > 0;
  const hasSvg = (feature.pathGroups.svg?.length ?? 0) > 0;
  const hasProto = (feature.pathGroups.proto?.length ?? 0) > 0;
  const hasGraphEdges = (feature.graphEdges?.length ?? 0) > 0;
  const hasGrpoMemory = !!feature.memoryStick;

  if (hasTypes) flags |= 1 << 0;
  if (hasServices) flags |= 1 << 1;
  if (hasRoutes) flags |= 1 << 2;
  if (hasTools) flags |= 1 << 3;
  if (hasTests) flags |= 1 << 4;
  if (hasDocs) flags |= 1 << 5;
  if (hasSvg) flags |= 1 << 6;
  if (hasProto) flags |= 1 << 7;
  if (hasGraphEdges) flags |= 1 << 8;
  if (hasGrpoMemory) flags |= 1 << 9;

  const bits: FeatureGlyphBits = {
    flags,
    hasTypes,
    hasServices,
    hasRoutes,
    hasTools,
    hasTests,
    hasDocs,
    hasSvg,
    hasProto,
    hasGraphEdges,
    hasGrpoMemory,
  };

  // Generate 8x8 glyph from bits
  const glyph = new Uint8Array(64);
  for (let i = 0; i < 64; i++) {
    const bit = 1 << i;
    if ((flags & bit) !== 0) {
      glyph[i] = 255;
    } else {
      const hash = simpleHash(feature.featureId + i);
      glyph[i] = hash % 2 === 0 ? 0 : 40;
    }
  }

  return {
    featureId: feature.featureId,
    label: feature.featureName,
    bits,
    glyph,
    svg: glyphToSvg(glyph),
    debugText: glyphToString(glyph),
  };
}

export function glyphToSvg(glyph: FeatureGlyph, size = 128): string {
  const cellSize = size / 8;
  let svg = `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">`;
  
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const val = glyph[y * 8 + x];
      if (val > 0) {
        const opacity = val / 255;
        svg += `<rect x="${x * cellSize}" y="${y * cellSize}" width="${cellSize}" height="${cellSize}" fill="currentColor" fill-opacity="${opacity}" />`;
      }
    }
  }
  
  svg += '</svg>';
  return svg;
}

export function glyphToString(glyph: FeatureGlyph): string {
  let res = '';
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const val = glyph[y * 8 + x];
      res += val === 255 ? '█' : val > 0 ? '░' : ' ';
    }
    res += '\n';
  }
  return res;
}

function simpleHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}
