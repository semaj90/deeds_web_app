/**
 * POST /api/evidence/search-by-image/feedback
 *
 * Thumbs up/down on a visual search result.
 *
 * Layer 1 — Redis HINCRBY aggregation (every vote, O(1)):
 *   ace:img:feedback:{queryHash}  hash  pointId → net_score (int, +1/-1 accumulated)
 *   ace:img:votes:{queryHash}     hash  pointId → total_votes
 *   TTL: 7 days per key
 *
 * Layer 2 — Qdrant setPayload (only when net_votes ≥ PROMOTE_THRESHOLD):
 *   Batches Qdrant writes to avoid 1-vote-per-write amplification.
 *   Writes trust_score, user_approved, user_rejected to the point payload.
 *
 * Layer 3 — rl-signal (fire-and-forget, always):
 *   Feeds GRPO reward pipeline.
 */

import { json, error }             from '@sveltejs/kit';
import type { RequestHandler }      from './$types';
import { QdrantManager }            from '$lib/server/vector/qdrant-manager.js';
import { getRedis }                 from '$lib/server/redis.js';
import { z }                        from 'zod';
import { createHash }               from 'node:crypto';

// Promote to Qdrant only after this many total votes on a point
const PROMOTE_THRESHOLD = 3;
const REDIS_TTL_S       = 60 * 60 * 24 * 7;  // 7 days

const Schema = z.object({
  pointId:    z.union([z.string(), z.number()]),
  collection: z.string().default('evidence_items'),
  approved:   z.boolean(),
  query:      z.string().max(500).optional(),
});

function queryHash(q: string): string {
  return createHash('sha256').update(q.trim().toLowerCase()).digest('hex').slice(0, 16);
}

export const POST: RequestHandler = async ({ request, locals, fetch }) => {
  if (!locals.user) throw error(401, 'Unauthorized');

  const body   = await request.json().catch(() => null);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) throw error(400, parsed.error.message);

  const { pointId, collection, approved, query } = parsed.data;
  const pid   = String(pointId);
  const vote  = approved ? 1 : -1;
  const qhash = queryHash(query ?? pid);

  // ── Layer 1: Redis HINCRBY (always, O(1)) ──────────────────────────────────
  const redis        = getRedis();
  const feedbackKey  = `ace:img:feedback:${qhash}`;
  const votesKey     = `ace:img:votes:${qhash}`;

  const [netScore, totalVotes] = await Promise.all([
    redis.hincrby(feedbackKey, pid, vote),
    redis.hincrby(votesKey,    pid, 1),
  ]);
  // Refresh TTL on both keys
  redis.expire(feedbackKey, REDIS_TTL_S).catch(() => {});
  redis.expire(votesKey,    REDIS_TTL_S).catch(() => {});

  // ── Layer 2: Qdrant setPayload (only at threshold) ─────────────────────────
  if (totalVotes >= PROMOTE_THRESHOLD) {
    const trustScore = Math.max(0, Math.min(1, (netScore / totalVotes + 1) / 2)); // map [-1,1]→[0,1]
    const qdrant = new QdrantManager();
    qdrant.client.setPayload(collection, {
      payload: {
        trust_score:   trustScore,
        user_approved: netScore > 0,
        user_rejected: netScore < 0,
        vote_count:    totalVotes,
      },
      points: [pid],
    }).catch((e: unknown) => {
      console.warn('[image-feedback] Qdrant promote failed:', String(e).slice(0, 200));
    });
  }

  // ── Layer 3: rl-signal (fire-and-forget) ──────────────────────────────────
  fetch('/api/analytics/rl-signal', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      eventType:     approved ? 'thumbs_up' : 'thumbs_down',
      pipeline:      'image_search',
      hyperedgeHash: pid,
      query:         query ?? '',
      userId:        locals.user.id,
    }),
  }).catch(() => {});

  return json({
    ok:          true,
    pointId:     pid,
    approved,
    netScore,
    totalVotes,
    promoted:    totalVotes >= PROMOTE_THRESHOLD,
  });
};
