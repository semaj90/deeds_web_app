/**
 * ACE Hit Tagger — marks Qdrant codebase chunks that are selected by ACE synthesis.
 *
 * Two stores are updated fire-and-forget after every ACE response:
 *   Redis  — `ace:chunk:hits:{filePath}` INCR  (atomic, authoritative count)
 *   Qdrant — `llm_synthesis_used: true`  setPayload filtered by `path` field
 *
 * The Redis counts feed the token-budget predictor and "did you mean" ranking.
 * Qdrant tags let Graphify / nightly GDS jobs detect high-reuse chunks without
 * scanning Redis.
 */

import { getRedis } from '$lib/server/redis.js';
import { qdrant } from '$lib/server/db/unified-client.js';
import type { ACEContext } from './types.js';

const COLLECTION = 'codebase_chunks_768';
const REDIS_PREFIX = 'ace:chunk:hits:';

export interface AceHitSummary {
  tagged: number;
  skipped: number;
  fromCache: boolean;
  durationMs: number;
}

/**
 * Tag all chunks in an ACE codebase context response.
 * Call fire-and-forget from writeAceCodeCache / persistACEChunks.
 *
 * @param chunks  codebaseContext array from the assembled ACEContext
 * @param opts.fromCache  true when the chunks came from the Redis ace:code cache hit
 */
export async function tagAceHits(
  chunks: NonNullable<ACEContext['codebaseContext']>,
  opts: { fromCache?: boolean } = {},
): Promise<AceHitSummary> {
  const t0 = Date.now();
  if (!chunks.length) return { tagged: 0, skipped: 0, fromCache: Boolean(opts.fromCache), durationMs: 0 };

  const filePaths = [...new Set(
    chunks
      .map((c) => c.filePath)
      .filter((p): p is string => typeof p === 'string' && p.length > 0),
  )];

  if (!filePaths.length) {
    return { tagged: 0, skipped: 0, fromCache: Boolean(opts.fromCache), durationMs: Date.now() - t0 };
  }

  // ── 1. Redis: increment hit counts (atomic, one pipeline) ──────────────────
  try {
    const redis = getRedis();
    const pipe = redis.pipeline();
    for (const fp of filePaths) pipe.incr(`${REDIS_PREFIX}${fp}`);
    await pipe.exec();
  } catch {
    // non-fatal
  }

  // ── 2. Qdrant: set synthesis tags on all matching chunk payloads ────────────
  // Filter on `path` (the Qdrant payload field used during indexing).
  // Each filePath may cover multiple chunk points (different line ranges).
  let tagged = 0;
  let skipped = 0;
  try {
    if (!qdrant) throw new Error('Qdrant client unavailable');
    const payload: Record<string, unknown> = {
      llm_synthesis_used: true,
      llm_synthesis_last_used_ms: Date.now(),
    };
    if (opts.fromCache) {
      payload.ace_cache_hit = true;
      payload.ace_cache_hit_last_ms = Date.now();
    }

    // Batch all filePaths into a single setPayload call using an OR filter
    await qdrant.setPayload(COLLECTION, {
      payload,
      filter: {
        should: filePaths.map((fp) => ({
          key: 'path',
          match: { value: fp },
        })),
      },
      wait: false,
    });
    tagged = filePaths.length;
  } catch {
    skipped = filePaths.length;
  }

  return { tagged, skipped, fromCache: Boolean(opts.fromCache), durationMs: Date.now() - t0 };
}

/**
 * Return the Redis hit count for a single filePath.
 * 0 if unavailable or not yet seen.
 */
export async function getChunkHitCount(filePath: string): Promise<number> {
  try {
    const val = await getRedis().get(`${REDIS_PREFIX}${filePath}`);
    return val ? parseInt(val, 10) : 0;
  } catch {
    return 0;
  }
}

/**
 * Bulk read Redis hit counts for multiple filePaths.
 * Returns a Map<filePath, count> — missing keys map to 0.
 */
export async function getChunkHitCountBulk(filePaths: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (!filePaths.length) return out;
  try {
    const keys = filePaths.map((fp) => `${REDIS_PREFIX}${fp}`);
    const vals = await getRedis().mget(...keys);
    filePaths.forEach((fp, i) => {
      out.set(fp, vals[i] ? parseInt(vals[i]!, 10) : 0);
    });
  } catch {
    filePaths.forEach((fp) => out.set(fp, 0));
  }
  return out;
}

/**
 * Flush Redis hit counts → Qdrant `ace_cache_hit_count` payload field.
 * Intended for a nightly / low-frequency background job — not per-request.
 * Groups filePaths by count to minimise Qdrant API calls.
 */
export async function syncHitCountsToQdrant(filePaths: string[]): Promise<void> {
  if (!filePaths.length) return;
  if (!qdrant) return;
  const countMap = await getChunkHitCountBulk(filePaths);

  // Group by count to batch into fewer setPayload calls
  const byCount = new Map<number, string[]>();
  for (const [fp, count] of countMap) {
    if (count <= 0) continue;
    if (!byCount.has(count)) byCount.set(count, []);
    byCount.get(count)!.push(fp);
  }

  for (const [count, fps] of byCount) {
    try {
      await qdrant.setPayload(COLLECTION, {
        payload: { ace_cache_hit_count: count },
        filter: {
          should: fps.map((fp) => ({ key: 'path', match: { value: fp } })),
        },
        wait: false,
      });
    } catch {
      // non-fatal — will retry next sync cycle
    }
  }
}
