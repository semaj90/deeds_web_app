/**
 * src/lib/server/glyph — public barrel
 *
 * Exports only the stable public API for glyph creation, mapping, tiling,
 * and prompt caching. Internal implementation details (class bodies, private
 * helpers) stay in their source files.
 */

// ── Mappers (RuneData ↔ GlyphRecord) ────────────────────────────────────────
export { runeToGlyphRecord, glyphToRuneData, derivedManifold4 } from './glyph-mappers.js';

// ── Tile atlas (kMeans → 2D NES grid → CouchDB/Redis) ───────────────────────
export {
  buildGlyphTileAtlas,
  getGlyphTileAtlas,
} from '$lib/server/cartridge/glyph-tile-engine.js';

// ── In-process prompt fragment cache (L0.5) ──────────────────────────────────
export {
  getFragment  as getGlyphPromptCache,
  setFragment  as setGlyphPromptCache,
  invalidateConversation as invalidateGlyphConversation,
  invalidateCase         as invalidateGlyphCase,
  getGlyphCacheMetrics,
  FragmentType,
} from '$lib/server/glyph-prompt-cache.js';

// ── CHR97 bridge + staged search ─────────────────────────────────────────────
export { glyphBridge } from '$lib/server/cartridge/glyph-record.js';
export {
  searchCartridgeStaged,
  type StagedSearchResult,
} from '$lib/server/cache/cartridge-tensor-bridge.js';
