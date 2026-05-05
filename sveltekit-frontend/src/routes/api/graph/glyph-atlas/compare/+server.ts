/**
 * POST /api/graph/glyph-atlas/compare
 *
 * Compare two cluster glyphs from the cached atlas.
 * Body: { clusterIdA: number, clusterIdB: number }
 */
import { json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import { compareGlyphs, ATLAS_REDIS_KEY } from '$lib/server/graph/glyph-atlas-builder.js';
import { getRedis } from '$lib/server/redis.js';
import type { GlyphAtlasManifest } from '$lib/server/graph/glyph-atlas-builder.js';

const compareSchema = z.object({
  clusterIdA: z.number().int().min(0),
  clusterIdB: z.number().int().min(0),
});

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

  let body: unknown;
  try { body = await request.json(); } catch {
    return json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const parsed = compareSchema.safeParse(body);
  if (!parsed.success) return json({ error: parsed.error.issues }, { status: 400 });

  const redis = getRedis();
  const cached = await redis.get(ATLAS_REDIS_KEY);
  if (!cached) {
    return json({ error: 'Atlas not built. POST /api/graph/glyph-atlas first.' }, { status: 424 });
  }

  const manifest = JSON.parse(cached) as GlyphAtlasManifest;
  const glyphA = manifest.glyphs.find((g) => g.clusterId === parsed.data.clusterIdA);
  const glyphB = manifest.glyphs.find((g) => g.clusterId === parsed.data.clusterIdB);

  if (!glyphA || !glyphB) {
    return json({
      error: `Cluster not found: ${parsed.data.clusterIdA}, ${parsed.data.clusterIdB}`,
    }, { status: 404 });
  }

  const comparison = compareGlyphs(glyphA, glyphB);
  return json({ glyphA, glyphB, comparison });
};
