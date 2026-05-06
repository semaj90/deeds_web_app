import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { getRedis } from '$lib/server/redis.js';

/**
 * GET /api/codebase-index/topology-hits
 *
 * Returns RAG hits persisted to Redis by logRagHitWithTopology().
 *
 * Query params:
 *   limit   – max hits to return (default 50, max 200)
 *   since   – unix ms; only hits newer than this (default: last 6 hours)
 *   cluster – integer; filter hits whose top_cluster matches
 */
export const GET: RequestHandler = async ({ url, locals }) => {
  if (!locals.user) {
    return json({ hits: [], total: 0 }, { status: 401 });
  }

  const limitParam = Math.min(Number(url.searchParams.get('limit') ?? '50'), 200);
  const sinceParam = Number(url.searchParams.get('since') ?? '0');
  const clusterParam = url.searchParams.get('cluster');

  const minScore = sinceParam > 0 ? sinceParam : Date.now() - 6 * 60 * 60 * 1000;

  try {
    const redis = getRedis();

    // Read sha8 keys from the sorted set, newest-first
    const members = await redis.zrangebyscore(
      'hg:rag_hits',
      minScore,
      '+inf',
      'WITHSCORES',
      'LIMIT',
      0,
      limitParam
    );

    if (members.length === 0) {
      return json({ hits: [], total: 0, windowStart: minScore });
    }

    // members alternates: [sha8, score, sha8, score, ...]
    const pairs: Array<{ sha8: string; ts: number }> = [];
    for (let i = 0; i < members.length; i += 2) {
      pairs.push({ sha8: members[i], ts: Number(members[i + 1]) });
    }

    // Fetch blobs in parallel (pipeline would be ideal but mget is simpler)
    const keys = pairs.map((p) => `rag:hit:${p.sha8}`);
    const blobs = await redis.mget(...keys);

    // simdjson AVX2 fast-parse for ≥10/≥5KB aggregate. RAG hit blobs carry
    // chunk content + cluster metadata + retrieval breakdown ~2-10KB each.
    const totalChars = blobs.reduce((sum, b) => sum + (b?.length ?? 0), 0);
    let parseFn: (s: string) => Record<string, unknown> =
      (s) => JSON.parse(s) as Record<string, unknown>;
    if (blobs.length >= 10 && totalChars >= 5_000) {
      try {
        const { fastJsonParse, isSimdJsonAvailable } = await import('$lib/server/gpu/simdjson-bridge.js');
        if (isSimdJsonAvailable()) parseFn = fastJsonParse<Record<string, unknown>>;
      } catch { /* addon unavailable — keep V8 */ }
    }

    const hits: Array<Record<string, unknown>> = [];
    for (let i = 0; i < pairs.length; i++) {
      const raw = blobs[i];
      if (!raw) continue;
      try {
        const parsed = parseFn(raw);
        if (clusterParam !== null) {
          const c = parsed.top_cluster;
          if (c === undefined || String(c) !== clusterParam) continue;
        }
        hits.push({ ...parsed, sha8: pairs[i].sha8, ts: pairs[i].ts });
      } catch {
        // skip malformed blobs
      }
    }

    // Sort newest-first
    hits.sort((a, b) => (b.ts as number) - (a.ts as number));

    return json({
      hits,
      total: hits.length,
      windowStart: minScore,
    });
  } catch (err) {
    console.error('[topology-hits] Redis error:', err);
    return json({ hits: [], total: 0, windowStart: minScore });
  }
};
