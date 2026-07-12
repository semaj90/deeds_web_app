/**
 * POST /api/cartridge/tile-atlas
 *
 * Build (or retrieve) the NES CHR97 glyph tile atlas for a case, with
 * optional GlyphAtlas conditioning for image synthesis (FLUX/Wan spatial hints).
 *
 * Body:
 *   caseId          — case UUID
 *   queryEmbedding  — optional 768-dim vector; triggers conditioning output
 *   gridW / gridH   — tile grid dimensions (default 16×16)
 *   skipCache       — force rebuild, bypass Redis (default false)
 *   collection      — Qdrant collection (default "evidence_items")
 *
 * Response (no queryEmbedding):
 *   { atlas: GlyphTileAtlas }              ← slim tiles (no centroids)
 *
 * Response (with queryEmbedding):
 *   { atlas: GlyphTileAtlas,              ← full tiles (centroids included)
 *     conditioning: {
 *       attentionWeights: number[],        ← softmax over tiles.length
 *       conditioningVector: number[],      ← 768-dim weighted centroid sum
 *       source: 'grpc' | 'cpu'
 *     }
 *   }
 *
 * Notes:
 *   - queryEmbedding forces a full kMeans rebuild (Redis slim omits centroids).
 *   - Without queryEmbedding the Redis slim cache is used when available.
 *   - Centroids are included in the response tiles only when queryEmbedding
 *     is present (avoids ~196KB of JSON for atlas-only fetches).
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getQdrantClient } from '$lib/server/vector/qdrant-singleton.js';
import {
  buildGlyphTileAtlas,
  type EmbeddingPoint,
} from '$lib/server/cartridge/glyph-tile-engine.js';
import { conditionGlyphAtlas } from '$lib/server/grpc/graph-ml-client.js';
import { z } from 'zod';

// ── Input schema ──────────────────────────────────────────────────────────────

const tileAtlasSchema = z.object({
  caseId: z.string().min(1).max(500),
  /** Pre-embedded 768-dim query vector; activates conditioning output. */
  queryEmbedding: z.array(z.number()).length(768).optional(),
  gridW: z.number().int().min(4).max(64).optional(),
  gridH: z.number().int().min(4).max(64).optional(),
  /** Force rebuild, bypassing Redis slim cache. */
  skipCache: z.boolean().optional(),
  collection: z.string().max(200).optional(),
});

// ── Handler ───────────────────────────────────────────────────────────────────

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = tileAtlasSchema.safeParse(raw);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
  }

  const {
    caseId,
    queryEmbedding,
    gridW = 16,
    gridH = 16,
    skipCache = false,
    collection,
  } = parsed.data;

  // When conditioning is requested we must have full centroids.
  // Redis slim cache omits them (too large for Redis), so force a rebuild.
  const needsFullBuild = !!queryEmbedding;
  const effectiveSkipCache = skipCache || needsFullBuild;

  // ── Scroll Qdrant for embedding points ──────────────────────────────────────
  const collectionName = collection ?? 'evidence_items';
  const points: EmbeddingPoint[] = [];

  try {
    const qdrant = getQdrantClient();
    let nextOffset: string | number | undefined;

    for (let page = 0; page < 100; page++) {
      const result = await qdrant.scroll(collectionName, {
        filter: { must: [{ key: 'case_id', match: { value: caseId } }] },
        limit: 100,
        offset: nextOffset,
        with_vector: true,
        with_payload: true,
      });

      if (!result.points?.length) break;

      for (const point of result.points) {
        let vector: number[];
        if (Array.isArray(point.vector)) {
          vector = point.vector as number[];
        } else if (
          point.vector &&
          typeof point.vector === 'object' &&
          'content' in point.vector
        ) {
          vector = (point.vector as Record<string, number[]>).content;
        } else {
          continue;
        }

        if (vector.length < 768) continue;

        points.push({
          embedding: vector,
          entities: Array.isArray(point.payload?.entities)
            ? (point.payload!.entities as unknown[]).map(String)
            : [],
          sourceId: String(point.payload?.evidence_id ?? point.id),
        });
      }

      nextOffset =
        (result.next_page_offset as string | number | undefined) ?? undefined;
      if (!nextOffset) break;
    }
  } catch (err) {
    console.error('[tile-atlas] Qdrant scroll error:', err);
    return json({ error: 'Qdrant scroll failed' }, { status: 502 });
  }

  if (points.length === 0) {
    return json(
      { error: 'No embedding points found for this caseId', caseId },
      { status: 404 }
    );
  }

  // ── Build / load atlas ───────────────────────────────────────────────────────
  let atlas: Awaited<ReturnType<typeof buildGlyphTileAtlas>>;
  try {
    atlas = await buildGlyphTileAtlas(
      caseId,
      points,
      gridW,
      gridH,
      effectiveSkipCache
    );
  } catch (err) {
    console.error('[tile-atlas] buildGlyphTileAtlas error:', err);
    return json({ error: 'Atlas build failed' }, { status: 500 });
  }

  // ── Strip centroids from slim response ────────────────────────────────────
  // Return full centroids only when conditioning is requested to keep
  // the atlas-only response lean (~16KB vs ~196KB for 64 tiles).
  const responseTiles = atlas.tiles.map((t) =>
    needsFullBuild ? t : { ...t, centroid: [] as number[] }
  );

  // ── Conditioning (FLUX/Wan spatial hint) ─────────────────────────────────
  let conditioning:
    | {
        attentionWeights: number[];
        conditioningVector: number[];
        source: string;
      }
    | undefined;

  if (queryEmbedding && atlas.tiles.length > 0) {
    try {
      const queryVec = new Float32Array(queryEmbedding);
      const result = await conditionGlyphAtlas(atlas, queryVec);
      conditioning = {
        attentionWeights: Array.from(result.attentionWeights),
        conditioningVector: Array.from(result.conditioningVector),
        source: result.source,
      };
    } catch (err) {
      console.warn('[tile-atlas] conditionGlyphAtlas error (non-fatal):', err);
      // Return atlas without conditioning rather than failing the whole request
    }
  }

  return json({
    atlas: { ...atlas, tiles: responseTiles },
    ...(conditioning && { conditioning }),
  });
};
