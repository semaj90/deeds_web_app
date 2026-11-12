/**
 * Engram Memory — Redis-backed bigram transition store for ACE retrieval.
 *
 * After every ACE query:
 *   - Records the current query text by hash
 *   - Links prev → current as a bigram transition (sorted set, score = frequency)
 *   - Links current query to its SOM BMU cell (for spatial DYM)
 *
 * Redis keys:
 *   ace:engram:query:{hash16}      STRING  — original query text (TTL 7d)
 *   ace:engram:bigram:{prevHash}   ZSET    — next-query hashes, score = frequency
 *   ace:engram:bmu:{row}:{col}     ZSET    — query hashes near this BMU, score = visits
 *   ace:engram:query-bmu:{hash16}  STRING  — "row:col" of the query's BMU (TTL 7d)
 */

import { qHash, recordEngramTransition as recordCanonicalEngramTransition } from '$lib/server/search/engram-bigram.js';
import type { Redis } from 'ioredis';

const QUERY_TTL    = 60 * 60 * 24 * 7;  // 7 days
const BMU_TTL      = 60 * 60 * 24 * 7;

/** Same normalization as the canonical writer (search/engram-bigram.ts) so keys never split. */
export function hashQuery(query: string): string {
  return qHash(query);
}

export async function recordEngramTransition(
  redis: Redis,
  args: {
    previousQuery?: string | null;
    currentQuery:   string;
    somRow?:        number | null;
    somCol?:        number | null;
  }
): Promise<{ currentHash: string }> {
  const currentHash = hashQuery(args.currentQuery);

  // Canonical writer (search/engram-bigram.ts) owns the bigram + query-text keys and their TTL/trim policy.
  if (args.previousQuery) {
    await recordCanonicalEngramTransition(args.previousQuery, args.currentQuery);
  } else {
    // No transition to record: keep the current query text recoverable for DYM.
    await redis.set(`ace:engram:query:${currentHash}`, args.currentQuery, 'EX', QUERY_TTL);
  }

  // Map query -> BMU cell (spatial locality for DYM). This is the only part unique to this module.
  if (Number.isFinite(args.somRow) && Number.isFinite(args.somCol)) {
    const bmuKey = `${args.somRow}:${args.somCol}`;
    await redis.set(`ace:engram:query-bmu:${currentHash}`, bmuKey, 'EX', BMU_TTL);
    await redis.zincrby(`ace:engram:bmu:${bmuKey}`, 1, currentHash);
    await redis.expire(`ace:engram:bmu:${bmuKey}`, BMU_TTL);
  }

  return { currentHash };
}

/**
 * Retrieve the 64-dim Karpathy-encoded vector for a file path from Redis.
 * Populated by karpathy-gpu-enrich.mjs (H6 encode pass, TTL 7d).
 * Returns null when the key is absent or weights haven't been run yet.
 */
export async function getKarpathyEncoded(
  redis: Redis,
  filePath: string
): Promise<Float32Array | null> {
  const csv = await redis.hget('gpu:karpathy:encoded', filePath).catch(() => null);
  if (!csv) return null;
  const vals = csv.split(',').map(Number);
  if (vals.length !== 64 || vals.some(Number.isNaN)) return null;
  return new Float32Array(vals);
}

/**
 * Seed the engram L1 KV cache with the 64-dim encoded vector for a file.
 * Stores as ace:engram:vec64:{normalizedPath} with the same 7-day TTL.
 * Consumers (e.g. synthesis lane reranker) can read it to avoid a second
 * Redis round-trip to gpu:karpathy:encoded.
 */
export async function seedEngramVec64(
  redis: Redis,
  filePath: string
): Promise<boolean> {
  const vec = await getKarpathyEncoded(redis, filePath);
  if (!vec) return false;
  await redis.set(
    `ace:engram:vec64:${filePath}`,
    Array.from(vec).join(','),
    'EX',
    QUERY_TTL
  );
  return true;
}

/**
 * Return DYM suggestions for a query using two sources:
 *   1. Bigram transitions — what users queried AFTER this exact query
 *   2. BMU spatial locality — what other queries landed in the same SOM cell
 *
 * Results are deduped and ranked by frequency (ZSET score).
 */
export async function getDidYouMeanFromEngram(
  redis:  Redis,
  query:  string,
  limit = 5
): Promise<Array<{ suggestion: string; hitCount: number }>> {
  const queryHash16 = hashQuery(query);

  // 1. Direct bigram: top-N hashes that followed this query
  const bigramHashes = await redis
    .zrevrange(`ace:engram:bigram:${queryHash16}`, 0, limit - 1, 'WITHSCORES')
    .catch(() => [] as string[]);

  // 2. BMU-local: queries near the same SOM cell
  const bmu       = await redis.get(`ace:engram:query-bmu:${queryHash16}`).catch(() => null);
  const bmuHashes  = bmu
    ? await redis
        .zrevrange(`ace:engram:bmu:${bmu}`, 0, limit - 1, 'WITHSCORES')
        .catch(() => [] as string[])
    : [];

  // WITHSCORES returns [member, score, member, score, ...]
  function parseZrevWithScores(raw: string[]): Array<{ hash: string; score: number }> {
    const out: Array<{ hash: string; score: number }> = [];
    for (let i = 0; i < raw.length - 1; i += 2) {
      out.push({ hash: raw[i], score: Number(raw[i + 1]) });
    }
    return out;
  }

  const seen     = new Set<string>();
  const combined = [
    ...parseZrevWithScores(bigramHashes),
    ...parseZrevWithScores(bmuHashes),
  ];

  // Sort by score desc, deduplicate, drop the query itself
  combined.sort((a, b) => b.score - a.score);

  const suggestions: Array<{ suggestion: string; hitCount: number }> = [];

  for (const { hash, score } of combined) {
    if (seen.has(hash)) continue;
    seen.add(hash);

    const text = await redis.get(`ace:engram:query:${hash}`).catch(() => null);
    if (!text || text === query) continue;

    suggestions.push({ suggestion: text, hitCount: Math.round(score) });
    if (suggestions.length >= limit) break;
  }

  return suggestions;
}
