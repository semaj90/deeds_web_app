/**
 * POST /api/glyph/search
 *
 * 3-stage staged glyph search:
 *   Stage 1 — tile atlas fast-path: query embedding → searchGlyphTiles() top-K tiles
 *   Stage 2 — load glyph records for matched tile clusters from Postgres
 *   Stage 3 — glyphBridge.search() (topo L2 → attentionScoreGPU → rewardScoreGPU)
 *   ACE    — glyphBridge.assembleACE() on top-K results (checks prompt-cache)
 *
 * Redis/Bifrost cache path:
 *   - Tile atlas read from Redis (< 1ms on hit)
 *   - GlyphRecord topology from Postgres (no 768-dim fetch needed for Stage 1/2)
 *   - Embedding fetched from Qdrant only if DB row has empty embedding768
 *
 * Response contract (always 200 — degraded on error):
 *   { hits, context, source, atlas, tileMatches, metrics }
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import { db } from '$lib/server/db/client';
import { glyphRecords } from '$lib/server/db/schema-postgres.js';
import { eq, and, inArray } from 'drizzle-orm';
import { glyphBridge } from '$lib/server/cartridge/glyph-record.js';
import { buildGlyphTileAtlas, searchGlyphTiles } from '$lib/server/cartridge/glyph-tile-engine.js';
import { dbRowToGlyphRecord } from '$lib/server/cartridge/glyph-mappers.js';
import { generateEmbedding } from '$lib/server/grpc/embedding-client.js';
import type { GlyphRecord, GlyphSection } from '$lib/server/types/glyph.js';

const _schema = z.object({
  query:       z.string().min(1).max(2000),
  caseId:      z.string().uuid(),
  topK:        z.number().int().min(1).max(50).optional(),
  sectionBias: z.enum([
    'FACTS','LEGAL_AUTHORITY','CLAIMS','PRAYER_HOLDING','PARTIES','JURISDICTION','UNKNOWN',
  ]).optional(),
  minReward:   z.number().min(0).max(1).optional(),
  skipAtlas:   z.boolean().optional(),
});

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) return json({ hits: [], context: '', source: 'error', error: 'Unauthorized' }, { status: 401 });

  let body: unknown;
  try { body = await request.json(); } catch {
    return json({ hits: [], context: '', source: 'error', error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = _schema.safeParse(body);
  if (!parsed.success) {
    return json({
      hits: [], context: '', source: 'error',
      error: parsed.error.issues[0]?.message ?? 'Invalid input',
    }, { status: 400 });
  }

  const { query, caseId, topK = 10, sectionBias, minReward = 0.25, skipAtlas = false } = parsed.data;
  const t0 = performance.now();
  const metrics: Record<string, number> = {};

  // ── 1. Query embedding ────────────────────────────────────────────────────
  const embedding = await generateEmbedding(query);
  if (!embedding || embedding.length === 0) {
    return json({ hits: [], context: '', source: 'degraded', error: 'Embedding unavailable', metrics });
  }
  const queryEmb = new Float32Array(embedding);
  metrics.embedMs = Math.round(performance.now() - t0);

  // ── 2. Tile atlas fast-path ───────────────────────────────────────────────
  let tileMatches: number[] = []; // matched clusterId list
  let atlasSource = 'skipped';

  if (!skipAtlas) {
    try {
      const t1 = performance.now();
      const atlas = await buildGlyphTileAtlas(caseId, [], 16, 16, false);
      atlasSource = atlas.source;
      if (atlas.tiles.length > 0) {
        const matched = searchGlyphTiles(queryEmb, atlas, Math.ceil(topK / 2));
        tileMatches = matched.map(t => t.clusterId);
      }
      metrics.atlasMs = Math.round(performance.now() - t1);
    } catch {
      // atlas unavailable — fall through to full DB scan
    }
  }

  // ── 3. Load GlyphRecords from Postgres ───────────────────────────────────
  const t2 = performance.now();
  let rows;
  try {
    const conditions = [eq(glyphRecords.caseId, caseId)];
    if (tileMatches.length > 0) {
      conditions.push(inArray(glyphRecords.centroidId, tileMatches));
    }
    if (sectionBias) {
      conditions.push(eq(glyphRecords.section, sectionBias));
    }

    rows = await db
      .select()
      .from(glyphRecords)
      .where(and(...conditions))
      .limit(200);
  } catch {
    rows = [];
  }
  metrics.dbMs = Math.round(performance.now() - t2);

  if (rows.length === 0) {
    return json({ hits: [], context: '', source: 'empty', atlas: atlasSource, tileMatches, metrics });
  }

  // ── 4. Reconstruct GlyphRecord objects ────────────────────────────────────
  // embedding768 left as empty Float32Array — topology.manifold4 drives Stage 1
  const glyphs: GlyphRecord[] = rows.map(row => {
    const topology = (row.topology as Record<string, unknown>) ?? {};
    const render   = (row.render   as Record<string, unknown>) ?? {};
    const topo4d   = Array.isArray(topology['manifold4'])
      ? topology['manifold4'] as [number, number, number, number]
      : [0, 0, 0, 0] as [number, number, number, number];

    return {
      glyphId:       row.glyphId,
      sourceId:      row.sourceId,
      caseId:        row.caseId ?? null,
      kind:          row.kind as GlyphRecord['kind'],
      schemaVersion: row.schemaVersion,
      semantic: {
        summary:       row.summary,
        tags:          (row.tags as string[]) ?? [],
        entities:      (row.entities as string[]) ?? [],
        section:       (row.section ?? 'UNKNOWN') as GlyphSection,
        kagNeighbors:  (row.kagNeighbors as string[]) ?? [],
        dagPrev:       (row.dagPrev as string[]) ?? [],
        dagNext:       (row.dagNext as string[]) ?? [],
        jsonbKeyHints: [],
      },
      vector: {
        embedding768:    new Float32Array(0),
        embeddingModel:  'embeddinggemma:latest',
        centroidId:      row.centroidId,
        grpoRewardScore: row.grpoRewardScore,
      },
      topology: {
        manifold4:  topo4d,
        somCluster: row.somCluster,
        gridX:      null,
        gridY:      null,
        normX:      null,
        normY:      null,
      },
      render: {
        cartridgeId:    (render['cartridgeId'] as string | null) ?? null,
        pageIndex:      (render['pageIndex'] as number | null) ?? null,
        tileIndex:      (render['tileIndex'] as number | null) ?? null,
        promptCacheKey: (render['promptCacheKey'] as string | null) ?? `glyph:${row.glyphId}`,
        atlasKey:       (render['atlasKey'] as string | null) ?? null,
      },
    };
  });

  // ── 5. 3-stage staged search via glyphBridge ─────────────────────────────
  const t3 = performance.now();
  let hits;
  try {
    hits = await glyphBridge.search(queryEmb, glyphs as any, {
      topK,
      sectionBias: sectionBias as any,
      minReward,
    });
  } catch {
    hits = [];
  }
  metrics.searchMs = Math.round(performance.now() - t3);

  // ── 6. ACE context assembly ───────────────────────────────────────────────
  const topGlyphs = hits
    .slice(0, Math.min(hits.length, 8))
    .map(h => glyphs.find(g => g.glyphId === h.glyphId))
    .filter((g): g is GlyphRecord => g !== undefined);

  let context = '';
  let contextSource: 'cache' | 'fresh' = 'fresh';
  try {
    const t4 = performance.now();
    const ace = await glyphBridge.assembleACE(topGlyphs);
    context = ace.context;
    contextSource = ace.source;
    metrics.aceMs = Math.round(performance.now() - t4);
  } catch { /* non-fatal */ }

  metrics.totalMs = Math.round(performance.now() - t0);

  return json({
    hits,
    context,
    contextSource,
    source:     tileMatches.length > 0 ? 'tile-atlas' : 'full-scan',
    atlas:      atlasSource,
    tileMatches,
    glyphCount: glyphs.length,
    metrics,
  });
};