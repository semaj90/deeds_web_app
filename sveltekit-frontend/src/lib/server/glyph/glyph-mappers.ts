/**
 * GlyphRecord ↔ RuneData mappers — backward-compat bridge.
 *
 * RuneData  = compact CHR97 binary transport (chr97-builder.ts)
 * GlyphRecord = canonical schema (src/lib/server/types/glyph.ts)
 *
 * runeToGlyphRecord  — promote a lean RuneData into a full GlyphRecord
 * glyphToRuneData    — compact a GlyphRecord back to RuneData for CHR97 packing
 */

import type { RuneData } from '$lib/server/cartridge/chr97-builder.js';
import type {
  GlyphRecord,
  GlyphKind,
  GlyphSection,
} from '$lib/server/types/glyph.js';

// ─── RuneData → GlyphRecord ───────────────────────────────────────────────────

/**
 * Promote a lean RuneData into a full canonical GlyphRecord.
 * Caller supplies any enrichment fields (section, tags, KAG neighbors, etc.)
 * via the optional `overrides` arg; defaults fill in the rest.
 *
 * @example
 * const glyph = runeToGlyphRecord(rune, {
 *   semantic: { section: 'FACTS', tags: ['hearsay', 'exhibit-A'] },
 *   vector:   { grpoRewardScore: 0.87 },
 *   topology: { somCluster: 4 },
 * });
 */
export function runeToGlyphRecord(
  rune: RuneData,
  overrides?: DeepPartial<GlyphRecord>
): GlyphRecord {
  const emb =
    rune.embedding instanceof Float32Array
      ? rune.embedding
      : new Float32Array(rune.embedding);

  return {
    glyphId: overrides?.glyphId ?? String(rune.id),
    sourceId: overrides?.sourceId ?? rune.sourceId ?? String(rune.id),
    caseId: overrides?.caseId ?? null,
    kind: (overrides?.kind ?? 'chunk') as GlyphKind,
    schemaVersion: overrides?.schemaVersion ?? 1,

    semantic: {
      summary: overrides?.semantic?.summary ?? rune.text.slice(0, 500),
      content: overrides?.semantic?.content ?? rune.text,
      title: overrides?.semantic?.title,
      tags: overrides?.semantic?.tags ?? [],
      entities: [...(rune.entities ?? []), ...(overrides?.semantic?.entities ?? [])],
      section: (overrides?.semantic?.section ?? 'UNKNOWN') as GlyphSection,
      dominantState: overrides?.semantic?.dominantState ?? null,
      jsonbKeyHints: overrides?.semantic?.jsonbKeyHints ?? [],
      kagNeighbors: overrides?.semantic?.kagNeighbors ?? [],
      dagPrev: overrides?.semantic?.dagPrev ?? [],
      dagNext: overrides?.semantic?.dagNext ?? [],
    },

    vector: {
      embedding768: emb,
      embeddingModel: overrides?.vector?.embeddingModel ?? 'embeddinggemma:latest',
      centroidId: overrides?.vector?.centroidId ?? rune.clusterId ?? null,
      quantized: (overrides?.vector?.quantized as Uint8Array | undefined) ?? null,
      norm: overrides?.vector?.norm ?? null,
      grpoRewardScore: overrides?.vector?.grpoRewardScore ?? null,
    },

    topology: {
      somCluster: overrides?.topology?.somCluster ?? null,
      manifold4:
        (overrides?.topology?.manifold4 as [number, number, number, number] | undefined) ?? null,
      gridX: overrides?.topology?.gridX ?? null,
      gridY: overrides?.topology?.gridY ?? null,
      normX: overrides?.topology?.normX ?? null,
      normY: overrides?.topology?.normY ?? null,
      confidence: overrides?.topology?.confidence ?? null,
      runeCount: overrides?.topology?.runeCount ?? null,
    },

    render: {
      cartridgeId: overrides?.render?.cartridgeId ?? null,
      pageIndex: overrides?.render?.pageIndex ?? null,
      tileIndex: overrides?.render?.tileIndex ?? null,
      promptCacheKey: overrides?.render?.promptCacheKey ?? `glyph:${overrides?.glyphId ?? rune.id}`,
      atlasKey: overrides?.render?.atlasKey ?? null,
    },

    createdAt: overrides?.createdAt,
    updatedAt: overrides?.updatedAt,
  };
}

// ─── GlyphRecord → RuneData ───────────────────────────────────────────────────

/**
 * Compact a canonical GlyphRecord back to lean RuneData for CHR97 packing.
 * Uses semantic.section + tags + entities as the combined entity list.
 */
export function glyphToRuneData(g: GlyphRecord, index: number): RuneData {
  return {
    id:         index,
    clusterId:  g.vector.centroidId ?? g.topology.somCluster ?? 0,
    embedding:  Array.from(g.vector.embedding768),
    text:       g.semantic.summary,
    sourceId:   g.sourceId,
    sourceName: undefined,
    entities: [
      ...g.semantic.tags,
      ...g.semantic.entities,
      ...(g.semantic.section !== 'UNKNOWN' ? [g.semantic.section] : []),
    ],
  };
}

// ─── Utility: derive manifold4 from embedding ─────────────────────────────────

/**
 * Derive topo manifold4 from the first 4 dims of an embedding.
 * Mirrors the convention in chr97-builder.ts so cartridge topology and
 * GlyphRecord.topology.manifold4 are always consistent.
 */
export function derivedManifold4(
  emb: Float32Array | number[]
): [number, number, number, number] {
  return [emb[0] ?? 0, emb[1] ?? 0, emb[2] ?? 0, emb[3] ?? 0];
}

// ─── DeepPartial helper (local, no external dep) ──────────────────────────────

type DeepPartial<T> = T extends object
  ? { [P in keyof T]?: DeepPartial<T[P]> }
  : T;
