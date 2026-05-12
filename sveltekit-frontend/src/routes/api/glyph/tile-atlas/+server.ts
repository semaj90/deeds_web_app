/**
 * GET  /api/glyph/tile-atlas?caseId=…&skipCache=1
 *   Returns the GlyphTileAtlas for a case (Redis cache → build).
 *
 * POST /api/glyph/tile-atlas
 *   Body: { caseId, points?, reason?, skipCache? }
 *   Triggers async atlas rebuild via RabbitMQ (glyph.tile.rebuild) and
 *   immediately returns the current (possibly stale) atlas.
 *   When `points` is supplied, also calls buildGlyphTileAtlas() synchronously
 *   and returns the freshly built atlas inline (for small point sets).
 *
 * DELETE /api/glyph/tile-atlas?caseId=…
 *   Invalidates the Redis cache entry for the atlas.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { requireAuth } from '$lib/server/auth-helpers.js';
import {
  buildGlyphTileAtlas,
  invalidateGlyphAtlas,
  publishGlyphRebuild,
  type EmbeddingPoint,
} from '$lib/server/cartridge/glyph-tile-engine.js';

// ── Input schemas ─────────────────────────────────────────────────────────

const _getSchema = z.object({
  caseId:    z.string().uuid('Invalid caseId'),
  skipCache: z.string().optional(),
  gridW:     z.string().optional(),
  gridH:     z.string().optional(),
});

const _postSchema = z.object({
  caseId:    z.string().uuid('Invalid caseId'),
  points:    z.array(z.object({
    embedding: z.array(z.number()).min(1),
    entities:  z.array(z.string()).optional(),
    sourceId:  z.string().optional(),
  })).optional(),
  reason:    z.string().optional(),
  skipCache: z.boolean().optional(),
  gridW:     z.number().int().min(4).max(64).optional(),
  gridH:     z.number().int().min(4).max(64).optional(),
});

// ── GET ───────────────────────────────────────────────────────────────────

export const GET: RequestHandler = async (event) => {
  const { locals, url } = event;
  if (!locals.user) {
    return json({ atlas: null, error: 'Unauthorized' }, { status: 401 });
  }


  const parsed = _getSchema.safeParse({
    caseId:    url.searchParams.get('caseId') ?? '',
    skipCache: url.searchParams.get('skipCache') ?? undefined,
    gridW:     url.searchParams.get('gridW')     ?? undefined,
    gridH:     url.searchParams.get('gridH')     ?? undefined,
  });

  if (!parsed.success) {
    return json(
      { atlas: null, error: parsed.error.issues[0]?.message ?? 'Bad request' },
      { status: 400 }
    );
  }

  const { caseId, skipCache, gridW: gridWStr, gridH: gridHStr } = parsed.data;
  const gridW = gridWStr ? parseInt(gridWStr, 10) : 16;
  const gridH = gridHStr ? parseInt(gridHStr, 10) : 16;

  try {
    const atlas = await buildGlyphTileAtlas(
      caseId,
      [],
      gridW,
      gridH,
      skipCache === '1' || skipCache === 'true',
    );
    return json({ atlas, error: null });
  } catch (err) {
    console.error('[glyph/tile-atlas GET]', (err as Error).message);
    return json({ atlas: null, error: null });
  }
}

// ── POST ──────────────────────────────────────────────────────────────────

export const POST: RequestHandler = async (event) => {
  const { locals } = event;
  if (!locals.user) {
    return json({ atlas: null, queued: false, error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await event.request.json();
  } catch {
    return json({ atlas: null, queued: false, error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = _postSchema.safeParse(body);
  if (!parsed.success) {
    return json(
      { atlas: null, queued: false, error: parsed.error.issues[0]?.message ?? 'Bad request' },
      { status: 400 }
    );
  }

  const {
    caseId,
    points,
    reason = 'api-request',
    skipCache = false,
    gridW = 16,
    gridH = 16,
  } = parsed.data;

  try {
    let atlas = null;
    let queued = false;

    if (points && points.length > 0) {
      atlas = await buildGlyphTileAtlas(
        caseId,
        points as EmbeddingPoint[],
        gridW,
        gridH,
        skipCache,
      );
    } else {
      const [cachedAtlas, published] = await Promise.all([
        buildGlyphTileAtlas(caseId, [], gridW, gridH, false),
        publishGlyphRebuild(caseId, reason),
      ]);
      atlas  = cachedAtlas;
      queued = published;
    }

    return json({ atlas, queued, error: null });
  } catch (err) {
    console.error('[glyph/tile-atlas POST]', (err as Error).message);
    return json({ atlas: null, queued: false, error: null });
  }
}

// ── DELETE ────────────────────────────────────────────────────────────────

export const DELETE: RequestHandler = async (event) => {
  const { locals } = event;
  if (!locals.user) {
    return json({ invalidated: false, error: 'Unauthorized' }, { status: 401 });
  }

  const caseId = event.url.searchParams.get('caseId') ?? '';
  if (!z.string().uuid().safeParse(caseId).success) {
    return json({ invalidated: false, error: 'Invalid caseId' }, { status: 400 });
  }

  try {
    await invalidateGlyphAtlas(caseId);
    return json({ invalidated: true, error: null });
  } catch (err) {
    console.error('[glyph/tile-atlas DELETE]', (err as Error).message);
    return json({ invalidated: false, error: null });
  }
}
