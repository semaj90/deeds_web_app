/**
 * POST /api/graph/fetch-rerank
 *
 * Re-ranks Qdrant candidates using graph signals:
 *   - SOM BMU adjacency bonus
 *   - Neo4j PageRank (pre-fetched in payload or enriched here)
 *   - Redis hyperedge weight (hg:edge:* keys)
 *   - fast_ast_score from payload
 *   - manifold4_q quaternion dot-similarity (HMM-biased when hmm.state is present)
 *
 * Request body: FetchRerankRequest (see below)
 * Response: { results: RerankResult[], retrievalTrace: {...} }
 *
 * Auth: requires locals.user
 */

import { json }     from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z }        from 'zod';
import {
  rerankHits,
  type QdrantHit,
  type QuerySom,
} from '$lib/server/ai/graph-reranker.js';
import { mlaFusionRerank }  from '$lib/server/search/mla-kv-compress.js';
import {
  toStandardizedBiasedQuaternion,
  hmmAxisMultiplierTuple,
  biasedUnitQuaternionTuple,
} from '$lib/server/search/quaternion-manifold.js';
import { hmmStateToGlyphSection } from '$lib/server/types/glyph.js';

// ── Request schema ─────────────────────────────────────────────────────────

const qdrantHitSchema = z.object({
  chunkId: z.string().min(1).max(200),
  score:   z.number().min(0).max(1),
  payload: z.object({
    som_bmu_row:     z.number().int().nullable().optional(),
    som_bmu_col:     z.number().int().nullable().optional(),
    manifold4:       z.array(z.number()).length(4).nullable().optional(),
    manifold4_q:     z.array(z.number()).length(4).nullable().optional(),
    fast_ast_score:  z.number().min(0).max(1).nullable().optional(),
    tags:            z.array(z.string()).optional(),
    path:            z.string().optional(),
    pagerank:        z.number().min(0).nullable().optional(),
    hyperedgeWeight: z.number().min(0).max(1).nullable().optional(),
  }).optional(),
});

const querySomSchema = z.object({
  row:         z.number().int().nullable().optional(),
  col:         z.number().int().nullable().optional(),
  manifold4_q: z.array(z.number()).length(4).nullable().optional(),
});

const hmmSchema = z.object({
  intent:     z.string().optional(),
  state:      z.string().optional(),
  confidence: z.number().min(0).max(1).optional(),
  signals:    z.array(z.string()).optional(),
});

const requestSchema = z.object({
  query:          z.string().min(1).max(4000),
  qdrantHits:     z.array(qdrantHitSchema).min(1).max(200),
  hmm:            hmmSchema.optional(),
  querySom:       querySomSchema.optional(),
  /** Full 768-dim query embedding — enables MLA latent reranking (optional) */
  queryEmbedding: z.array(z.number()).length(768).optional(),
  limit:          z.number().int().min(1).max(100).optional().default(20),
});

// ── Handler ────────────────────────────────────────────────────────────────

export const POST: RequestHandler = async ({ locals, request }) => {
  if (!locals.user?.id) {
    return json({ error: { code: 'unauthorized', message: 'Login required' } }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: { code: 'invalid_json', message: 'Request body must be JSON' } }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: { code: 'invalid_params', issues: parsed.error.issues } }, { status: 400 });
  }

  const { query, qdrantHits, hmm, querySom, queryEmbedding, limit } = parsed.data;
  const t0 = Date.now();

  // ── 1. Enrich hits with Redis hyperedge weights ──────────────────────────
  let enrichedHits: QdrantHit[] = qdrantHits as QdrantHit[];
  try {
    const { getRedis } = await import('$lib/server/redis.js');
    const redis = getRedis();

    const needsEnrich = qdrantHits.filter((h) => h.payload?.hyperedgeWeight == null);
    if (needsEnrich.length) {
      const keys = needsEnrich.map((h) => `hg:edge:chunk:${h.chunkId}`);
      const raws = await redis.mget(...keys).catch(() => keys.map(() => null));
      const weightMap = new Map(
        needsEnrich.map((h, i) => [h.chunkId, raws[i] ? (JSON.parse(raws[i]!)?.weight ?? null) : null])
      );
      enrichedHits = qdrantHits.map((h) =>
        h.payload?.hyperedgeWeight != null
          ? (h as QdrantHit)
          : ({ ...h, payload: { ...h.payload, hyperedgeWeight: weightMap.get(h.chunkId) ?? null } } as QdrantHit)
      );
    }
  } catch { /* non-fatal */ }

  // ── 2. Ensure manifold4_q unit quaternions are populated ─────────────────
  // Standardise raw SOM coordinates before L2-normalisation: raw values like
  // som_x=421 would otherwise crush the reward/semantic axes to < 0.5% of
  // the quaternion direction, making HMM axis multipliers effectively inert.
  enrichedHits = enrichedHits.map((hit) => {
    const p = hit.payload;
    if (!p || p.manifold4_q?.length === 4) return hit;
    if (!p.manifold4?.length) return hit;
    const q = toStandardizedBiasedQuaternion(p.manifold4 as [number, number, number, number]);
    return { ...hit, payload: { ...p, manifold4_q: q } };
  });

  // ── 2b. HMM-bias the query quaternion when section + confidence are present
  //
  // manifold4_q = [w=grpo_w, x=som_x, y=som_y, z=semantic_z]
  // Manifold4Point = [som_x, som_y, semantic_z, grpo_w]  (index mapping: [1,2,3,0])
  //
  // hmmAxisMultiplierTuple returns [wScale, xScale, yScale, zScale] confidence-gated
  // so confidence=0 → all ones (neutral), confidence=1 → full HMM_AXIS_TABLE bias.
  let effectiveQuerySom = querySom as QuerySom | undefined;
  let hmmBiasApplied = false;
  let hmmBiasSection: string | null = null;
  let hmmBiasMultiplier: [number, number, number, number] | null = null;

  if (hmm?.state && (hmm.confidence ?? 0) > 0 && querySom?.manifold4_q?.length === 4) {
    const section    = hmmStateToGlyphSection(hmm.state);
    const confidence = hmm.confidence!;
    const multiplier = hmmAxisMultiplierTuple(section, confidence);

    // Convert [w,x,y,z] quaternion back to Manifold4Point [som_x,som_y,semantic_z,grpo_w]
    const q = querySom.manifold4_q as [number, number, number, number];
    const rawM4 = [q[1], q[2], q[3], q[0]] as [number, number, number, number];
    const biasedQ = biasedUnitQuaternionTuple(rawM4, multiplier);

    effectiveQuerySom = { ...querySom, manifold4_q: biasedQ };
    hmmBiasApplied    = true;
    hmmBiasSection    = section;
    hmmBiasMultiplier = multiplier;
  }

  // ── 3. MLA latent rerank (async, only when queryEmbedding provided) ───────
  let mlaScoreByChunk: Map<string, number> | null = null;
  if (queryEmbedding) {
    try {
      const mlaCandidates = enrichedHits.map((h) => ({
        stable_key:  h.chunkId,
        pre_score:   h.score,
        som_bmu_col: h.payload?.som_bmu_col,
        som_bmu_row: h.payload?.som_bmu_row,
      }));
      const mlaResults = await mlaFusionRerank(queryEmbedding, mlaCandidates, {
        somBmuCol: querySom?.col ?? undefined,
        somBmuRow: querySom?.row ?? undefined,
        // 1-bit Hamming pre-filter when candidate set is large. Mirrors
        // TurboQuant PolarQuant: sign-pack latents → 32× compression →
        // O(n) Hamming pass narrows to top-K before Float32 dot products.
        oneBitPrefilter: mlaCandidates.length > 80 ? 64 : 0,
      });
      mlaScoreByChunk = new Map(mlaResults.map((r) => [r.stable_key, r.mla_score]));
      // Merge MLA score into payload for use by rerankHits scoreCandidate
      enrichedHits = enrichedHits.map((h) => ({
        ...h,
        payload: { ...h.payload, mla_score: mlaScoreByChunk!.get(h.chunkId) ?? h.score },
      }));
    } catch { /* non-fatal — fall back to qdrant score */ }
  }

  const results = rerankHits(
    enrichedHits,
    effectiveQuerySom,
    limit
  );

  const durationMs = Date.now() - t0;

  return json({
    results,
    retrievalTrace: {
      graphSort: {
        used:        true,
        inputCount:  qdrantHits.length,
        outputCount: results.length,
        durationMs,
        querySomRow: querySom?.row ?? null,
        querySomCol: querySom?.col ?? null,
        mlaUsed:     mlaScoreByChunk !== null,
        hmmBias: {
          applied:    hmmBiasApplied,
          section:    hmmBiasSection,
          confidence: hmm?.confidence ?? null,
          multiplier: hmmBiasMultiplier,
        },
        query,
      },
    },
  });
};
