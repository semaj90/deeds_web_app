/**
 * Cartridge barrel — public API for the CHR97 / glyph system.
 *
 * ONLY export types and helpers that are safe to consume from other
 * server modules.  Internal implementation details (binary encode/decode
 * helpers, private cache state) must NOT be re-exported here.
 *
 * G46 audit gate: rg "from './glyph|from './cartridge|export.*Glyph" verifies
 * this barrel is the single stable export surface.
 */

// ── Canonical schema (types live in src/lib/server/types/glyph.ts) ───────
export type {
  GlyphRecord,
  GlyphBridge,
  GlyphSection,
  GlyphKind,
  GlyphSemanticLayer,
  GlyphVectorLayer,
  GlyphTopologyLayer,
  GlyphRenderLayer,
  GlyphSearchHit,
  GlyphSearchOptions,
} from '$lib/server/types/glyph.js';

export { hmmStateToGlyphSection } from '$lib/server/types/glyph.js';

// ── Implementation (staged search + ACE assembly + CHR97 pack) ───────────
export {
  glyphBridge,
  glyphRecordToRuneData,
} from './glyph-record.js';

// ── Backward-compat mappers ───────────────────────────────────────────────
export {
  runeToGlyphRecord,
  runeBatchToGlyphRecords,
  parsedRuneToGlyphRecord,
  glyphRecordToDbRow,
  dbRowToGlyphRecord,
  glyphIdFromSource,
  glyphRecordToProto,
  protoToGlyphRecord,
} from './glyph-mappers.js';

export type { GlyphRecordDbRow, GlyphRecordProtoLike } from './glyph-mappers.js';

// ── Tile atlas (server-side GPU build) ───────────────────────────────────
export {
  buildGlyphTileAtlas,
  searchGlyphTiles,
  invalidateGlyphAtlas,
  publishGlyphRebuild,
} from './glyph-tile-engine.js';

export type {
  GlyphTile,
  GlyphTileAtlas,
  EmbeddingPoint,
} from './glyph-tile-engine.js';

// ── CHR97 binary transport (low-level, use GlyphBridge for high-level) ───
export type {
  RuneData,
  CartridgeMetadata,
  ParsedCartridge,
} from './chr97-builder.js';
