/**
 * POST /api/synthesis/typing-context/feedback
 *
 * Records which prompt pill the user clicked — the signal used to improve:
 *   - buildPrompts() section templates
 *   - section weights in the HMM
 *   - BMU neighbor count
 *   - Atlas freshness thresholds
 *
 * Body: { caseId?, section, promptText, promptSource, atlasSource? }
 *
 * Storage (fire-and-forget, non-fatal):
 *   Redis sorted set:
 *     pill:clicks:case:{caseId}:{section}  score=count  member=promptHash
 *     pill:clicks:global:{section}          score=count  member=promptHash
 *   Redis hash (human-readable lookup):
 *     pill:text:{promptHash}  →  promptText
 *
 * TTL: 90 days (matches HMM section affinity TTL).
 *
 * Response (always 200 — degraded contract):
 *   { ok: true } on success
 *   { ok: false } on validation error or storage failure
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { createHash } from 'crypto';
import { getRedis } from '$lib/server/redis.js';

const SECTIONS = ['FACTS', 'LEGAL_AUTHORITY', 'CLAIMS', 'PRAYER_HOLDING', 'PARTIES', 'JURISDICTION', 'UNKNOWN'] as const;
const TTL_S = 90 * 24 * 60 * 60; // 90 days

const schema = z.object({
  caseId:       z.string().uuid().optional(),
  section:      z.enum(SECTIONS),
  promptText:   z.string().min(1).max(500),
  promptSource: z.enum(['som', 'keyword_fallback', 'no_atlas']),
  atlasSource:  z.string().max(100).optional(),
});

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) return json({ ok: false }, { status: 401 });

  let raw: unknown;
  try { raw = await request.json(); } catch { return json({ ok: false }); }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) return json({ ok: false });

  const { caseId, section, promptText, promptSource } = parsed.data;

  // Deterministic hash so the same pill text maps to the same key
  const promptHash = createHash('sha256')
    .update(`${section}:${promptText}`)
    .digest('hex')
    .slice(0, 16);

  // Fire-and-forget — feedback must never block the UI
  Promise.resolve().then(async () => {
    try {
      const redis = getRedis();
      const pipeline = redis.pipeline();

      // Global section click counter
      pipeline.zincrby(`pill:clicks:global:${section}`, 1, promptHash);
      pipeline.expire(`pill:clicks:global:${section}`, TTL_S);

      // Per-case section click counter
      if (caseId) {
        pipeline.zincrby(`pill:clicks:case:${caseId}:${section}`, 1, promptHash);
        pipeline.expire(`pill:clicks:case:${caseId}:${section}`, TTL_S);
      }

      // Per-source counter (tracks how often SOM pills vs keyword pills get clicked)
      pipeline.zincrby(`pill:clicks:source:${promptSource}`, 1, promptHash);
      pipeline.expire(`pill:clicks:source:${promptSource}`, TTL_S);

      // Human-readable text lookup (set if missing — won't overwrite)
      pipeline.hsetnx(`pill:text:${promptHash}`, 'text', promptText);
      pipeline.hsetnx(`pill:text:${promptHash}`, 'section', section);
      pipeline.expire(`pill:text:${promptHash}`, TTL_S);

      // Per-user section affinity (matches HMM affinity tracking pattern)
      const userId = locals.user.id ?? locals.user.email ?? '';
      if (userId) {
        pipeline.zincrby(`hmm:user:${userId}:sections`, 1, section);
        pipeline.expire(`hmm:user:${userId}:sections`, TTL_S);
      }

      await pipeline.exec();
    } catch {
      // Non-fatal — analytics should never surface errors to the user
    }
  }).catch(() => {});

  return json({ ok: true });
};