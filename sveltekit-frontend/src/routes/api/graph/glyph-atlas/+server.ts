/**
 * GET  /api/graph/glyph-atlas         — return cached manifest + base64 atlas buffer
 * POST /api/graph/glyph-atlas         — rebuild atlas (forceRebuild, limitClusters)
 * POST /api/graph/glyph-atlas/compare — compare two cluster glyphs side-by-side
 *
 * The atlas is a minified sprite-sheet of cluster descriptors:
 *   stride=128 Float32s per cluster glyph
 *   [0..63]  BoW weights (TF-IDF normalised, top-64 terms)
 *   [64..70] pageRankMean, fileCount, auditScore, ssrRisk, somRow, somCol, pairedTest
 *   [71..127] reserved / zero-padded
 *
 * WebGPU upload pattern (client):
 *   const bytes = Uint8Array.from(atob(atlasBase64), c => c.charCodeAt(0));
 *   const f32   = new Float32Array(bytes.buffer);
 *   device.queue.writeBuffer(atlasBuffer, 0, f32);
 */

import { json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import {
  buildGlyphAtlas,
  compareGlyphs,
  ATLAS_REDIS_KEY,
  DESCRIPTOR_STRIDE,
  BOW_DIM,
} from '$lib/server/graph/glyph-atlas-builder.js';
import { getRedis } from '$lib/server/redis.js';

const buildSchema = z.object({
  forceRebuild:   z.boolean().optional().default(false),
  limitClusters:  z.number().int().min(1).max(200).optional(),
});

const compareSchema = z.object({
  clusterIdA: z.number().int().min(0),
  clusterIdB: z.number().int().min(0),
});

export const GET: RequestHandler = async ({ locals }) => {
  if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

  const redis = getRedis();
  try {
    const cached = await redis.get(ATLAS_REDIS_KEY);
    if (!cached) {
      return json({
        manifest: null,
        atlasBase64: null,
        fromCache: false,
        hint: 'Atlas not built yet. POST /api/graph/glyph-atlas to build.',
      });
    }
    const manifest = JSON.parse(cached);
    const atlasBase64 = await redis.get(`${ATLAS_REDIS_KEY}:buf`) ?? null;
    const ttl = await redis.ttl(ATLAS_REDIS_KEY);
    return json({ manifest, atlasBase64, fromCache: true, ttlSeconds: ttl });
  } catch (e) {
    return json({ error: (e as Error).message }, { status: 500 });
  }
};

export const POST: RequestHandler = async ({ request, url, locals }) => {
  if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

  // Compare mode
  if (url.pathname.endsWith('/compare')) {
    let body: unknown;
    try { body = await request.json(); } catch {
      return json({ error: 'Invalid JSON' }, { status: 400 });
    }
    const parsed = compareSchema.safeParse(body);
    if (!parsed.success) return json({ error: parsed.error.issues }, { status: 400 });

    const redis = getRedis();
    const cached = await redis.get(ATLAS_REDIS_KEY);
    if (!cached) return json({ error: 'Atlas not built. POST /api/graph/glyph-atlas first.' }, { status: 424 });

    const manifest = JSON.parse(cached) as Awaited<ReturnType<typeof buildGlyphAtlas>>['manifest'];
    const glyphA = manifest.glyphs.find((g) => g.clusterId === parsed.data.clusterIdA);
    const glyphB = manifest.glyphs.find((g) => g.clusterId === parsed.data.clusterIdB);

    if (!glyphA || !glyphB) {
      return json({ error: `Cluster not found in atlas (${parsed.data.clusterIdA}, ${parsed.data.clusterIdB})` }, { status: 404 });
    }

    const comparison = compareGlyphs(glyphA, glyphB);
    return json({ glyphA, glyphB, comparison });
  }

  // Build mode
  let body: unknown;
  try { body = await request.json(); } catch { body = {}; }
  const parsed = buildSchema.safeParse(body);
  if (!parsed.success) return json({ error: parsed.error.issues }, { status: 400 });

  const startMs = Date.now();
  try {
    const result = await buildGlyphAtlas(parsed.data);
    return json({
      ...result,
      durationMs:   Date.now() - startMs,
      stride:       DESCRIPTOR_STRIDE,
      bowDim:       BOW_DIM,
    });
  } catch (e) {
    return json({ error: (e as Error).message }, { status: 500 });
  }
};
