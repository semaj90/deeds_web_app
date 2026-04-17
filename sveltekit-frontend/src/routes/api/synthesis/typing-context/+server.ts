/**
 * POST /api/synthesis/typing-context
 *
 * Lightweight endpoint for the HeadlessTypingListener component.
 * Called after the user pauses typing (1.5s debounce, text > 20 chars).
 *
 * Pipeline:
 *   1. HMM classify query section  (~1ms, pure CPU)
 *   2. Load slim tile atlas from Redis cache (fast path, ~5ms)
 *   3. Embed text via gRPC embedding client (~50ms)
 *   4. 4D manifold BMU lookup: Euclidean nearest-tile in manifold4 space
 *   5. Build entity-aware contextual prompts from top SOM tiles + HMM section
 *   6. Blend prompts across top-2 sections when HMM confidence < BLEND_THRESHOLD
 *
 * The 4D BMU uses tile.manifold4 (first 4 dims of the 768-dim centroid) as
 * compressed SOM neuron weights — cheap, no full centroid rebuild needed.
 * manifold4 is guaranteed present in slim Redis atlases (centroids omitted, not manifold4).
 *
 * Body: { text, caseId?, topK? }
 *
 * Response:
 *   { section, confidence, promptSource, blended, topTiles, suggestedPrompts, atlasSource }
 *
 * promptSource: 'som'              — BMU found tiles, prompts are tile+section aware
 *               'keyword_fallback' — atlas exists but no embedding / tiles matched
 *               'no_atlas'         — no caseId or atlas not yet built
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import {
  predictChunk,
  type HMMRawState,
} from '$lib/server/analysis/hmm-section-classifier.js';
import { hmmStateToGlyphSection } from '$lib/server/types/glyph.js';
import {
  buildGlyphTileAtlas,
  type GlyphTile,
} from '$lib/server/cartridge/glyph-tile-engine.js';
import type { GlyphSection } from '$lib/server/types/glyph.js';

// ── Constants ─────────────────────────────────────────────────────────────────

/** Below this HMM confidence blend prompts from the top-2 sections */
const BLEND_THRESHOLD = 0.5;

// ── Input schema ──────────────────────────────────────────────────────────────

const schema = z.object({
  text:   z.string().min(3).max(2000),
  caseId: z.string().uuid().optional(),
  topK:   z.number().int().min(1).max(5).optional(),
});

// ── 4D manifold BMU ───────────────────────────────────────────────────────────

/**
 * Find the top-K nearest SOM tiles in 4D manifold space.
 *
 * Uses tile.manifold4 (first 4 dims of the 768-dim centroid) as the
 * compressed neuron weight vector.  Euclidean distance in 4D space is
 * sufficient for coarse cluster assignment without loading full centroids
 * from the tile atlas (centroids are omitted from the Redis slim cache, but
 * manifold4 is guaranteed present in every slim tile).
 */
function manifold4BMU(
  queryVec4: [number, number, number, number],
  tiles: GlyphTile[],
  topK: number
): GlyphTile[] {
  if (tiles.length === 0) return [];
  return tiles
    .map((t) => {
      const d0 = queryVec4[0] - t.manifold4[0];
      const d1 = queryVec4[1] - t.manifold4[1];
      const d2 = queryVec4[2] - t.manifold4[2];
      const d3 = queryVec4[3] - t.manifold4[3];
      return { tile: t, dist: d0 * d0 + d1 * d1 + d2 * d2 + d3 * d3 };
    })
    .sort((a, b) => a.dist - b.dist)
    .slice(0, topK)
    .map((x) => x.tile);
}

// ── Prompt builder ────────────────────────────────────────────────────────────

/**
 * Build 1-3 legal-domain contextual prompts from the SOM top-tile entities
 * combined with the HMM section classification.
 */
function buildPrompts(section: GlyphSection, topTiles: GlyphTile[]): string[] {
  const prompts: string[] = [];
  const allEntities = topTiles.flatMap((t) => t.entities).filter(Boolean);
  const e0 = allEntities[0];
  const e1 = allEntities[1];

  switch (section) {
    case 'FACTS':
      if (e0) prompts.push(`Build timeline for "${e0}"?`);
      prompts.push('Analyze evidence connections?');
      if (e0 && e1) prompts.push(`Relationship between ${e0} and ${e1}?`);
      break;

    case 'LEGAL_AUTHORITY':
      if (e0) prompts.push(`Find cases citing ${e0}?`);
      prompts.push('Search for supporting legal authority?');
      if (e0) prompts.push(`What defenses apply under ${e0}?`);
      break;

    case 'CLAIMS':
      if (e0) prompts.push(`What relief is available for "${e0}"?`);
      prompts.push('What is the burden of proof here?');
      prompts.push('What defenses apply?');
      break;

    case 'PRAYER_HOLDING':
      if (e0) prompts.push(`Find precedents for "${e0}"?`);
      prompts.push('Predict likely outcome?');
      prompts.push('What appeals are available?');
      break;

    case 'PARTIES':
      if (e0) prompts.push(`What claims does ${e0} have?`);
      prompts.push('Search procedural history?');
      break;

    case 'JURISDICTION':
      prompts.push('Verify venue and jurisdiction rules?');
      if (e0) prompts.push(`Check jurisdictional limits for ${e0}?`);
      break;

    default:
      if (e0) prompts.push(`Analyze connections to "${e0}"?`);
      prompts.push('Search for related cases?');
      if (e0 && e1) prompts.push(`Compare ${e0} and ${e1}?`);
  }

  return [...new Set(prompts)].slice(0, 3);
}

// ── Slim tile response (no centroid — too large for typing context) ───────────

function slimTile(t: GlyphTile) {
  return {
    clusterId:  t.clusterId,
    gridX:      t.gridX,
    gridY:      t.gridY,
    normX:      t.normX,
    normY:      t.normY,
    runeCount:  t.runeCount,
    confidence: t.confidence,
    manifold4:  t.manifold4,
    entities:   t.entities.slice(0, 5),
  };
}

// ── Handler ───────────────────────────────────────────────────────────────────

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
  }

  const { text, caseId, topK = 3 } = parsed.data;

  // ── Stage 1: HMM section classification (~1ms) ───────────────────────────
  // Use full prediction so stateProbabilities are available for blending.
  const prediction = predictChunk(text);
  const section    = hmmStateToGlyphSection(prediction.primaryState);
  const confidence = prediction.confidence;

  // ── Stages 2-4: SOM tile lookup (requires caseId + Redis atlas) ──────────
  let topTiles: GlyphTile[]             = [];
  let atlasSource                        = 'none';
  // 'som' | 'keyword_fallback' | 'no_atlas'
  let promptSource: 'som' | 'keyword_fallback' | 'no_atlas' = 'no_atlas';

  if (caseId) {
    promptSource = 'keyword_fallback'; // will upgrade to 'som' if BMU succeeds
    try {
      // Load slim atlas from Redis — centroids are empty in slim form, but
      // manifold4 is persisted and is all we need for 4D BMU.
      const atlas = await buildGlyphTileAtlas(caseId, [], 16, 16, false);

      if (atlas.tiles.length > 0) {
        atlasSource = atlas.source;

        // Embed the query text to get first 4 dims for manifold4 BMU lookup
        try {
          const { generateEmbeddings } = await import(
            '$lib/server/grpc/embedding-client.js'
          );
          const result = await generateEmbeddings([text]);
          const vec = result.vectors[0];

          if (vec && vec.length >= 4) {
            const queryManifold4: [number, number, number, number] = [
              vec[0] ?? 0,
              vec[1] ?? 0,
              vec[2] ?? 0,
              vec[3] ?? 0,
            ];
            topTiles    = manifold4BMU(queryManifold4, atlas.tiles, topK);
            promptSource = topTiles.length > 0 ? 'som' : 'keyword_fallback';
          }
        } catch {
          // Embedding service unavailable — no BMU match; HMM prompts still fire
        }
      }
    } catch {
      // Redis / atlas unavailable — non-fatal; fall back to HMM-only prompts
    }
  }

  // ── Stage 5: Prompt building (with optional section blending) ────────────
  let suggestedPrompts: string[];
  let blended = false;

  if (confidence < BLEND_THRESHOLD) {
    // Low HMM confidence: take top-2 sections by stateProbabilities and
    // interleave their prompts (2 from primary, 1 from secondary).
    const sorted = (
      Object.entries(prediction.stateProbabilities) as [HMMRawState, number][]
    )
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2);

    const sec1   = hmmStateToGlyphSection(sorted[0]?.[0] ?? prediction.primaryState);
    const sec2   = hmmStateToGlyphSection(sorted[1]?.[0] ?? prediction.primaryState);
    const pills1 = buildPrompts(sec1, topTiles);
    const pills2 = buildPrompts(sec2, topTiles);
    suggestedPrompts = [...new Set([pills1[0], pills2[0], pills1[1]].filter(Boolean))]
      .slice(0, 3) as string[];
    blended = sec1 !== sec2 && suggestedPrompts.length > 1;
  } else {
    suggestedPrompts = buildPrompts(section, topTiles);
  }

  return json({
    section,
    confidence,
    promptSource,
    blended,
    topTiles: topTiles.map(slimTile),
    suggestedPrompts,
    atlasSource,
  });
};
