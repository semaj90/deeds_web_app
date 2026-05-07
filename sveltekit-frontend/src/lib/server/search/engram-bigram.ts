/**
 * Engram bigram index — query co-occurrence memory in Redis.
 *
 * Records query-A → query-B transitions (bigrams over whole queries, not tokens)
 * derived from per-user sequential retrieval sessions. Powers the 'engram' source
 * in getDidYouMeanSuggestions: "users who searched X tended to search Y next."
 *
 * Redis layout:
 *   ace:engram:bigram:{prevHash}   ZSET  — next queries ranked by co-occurrence count
 *   ace:engram:query:{hash}        STRING — query string keyed by hash
 *   ace:engram:last:{userId}       STRING — last query seen for this user (1h TTL)
 */

import { getRedis } from '$lib/server/redis.js';
import { createHash } from 'crypto';

// ── Constants ─────────────────────────────────────────────────────────────────

const BIGRAM_TTL  = 60 * 60 * 24 * 7;  // 7 days
const QUERY_TTL   = 60 * 60 * 24 * 3;  // 3 days
const LAST_TTL    = 60 * 60;            // 1 hour per-user cursor
const MAX_BIGRAM  = 200;               // entries per sorted set — trim oldest

// ── Helpers ───────────────────────────────────────────────────────────────────

function normalizeQuery(q: string): string {
  return q.toLowerCase().trim().replace(/\s+/g, ' ');
}

function qHash(q: string): string {
  return createHash('sha256')
    .update(normalizeQuery(q))
    .digest('hex')
    .slice(0, 16);
}

// ── Write path ────────────────────────────────────────────────────────────────

/**
 * Record that `curQuery` followed `prevQuery` in a retrieval session.
 * Fire-and-forget safe: caller should `.catch(() => {})`.
 */
export async function recordEngramTransition(
  prevQuery: string,
  curQuery:  string,
): Promise<void> {
  if (!prevQuery || !curQuery) return;
  const prevH = qHash(prevQuery);
  const curH  = qHash(curQuery);
  if (prevH === curH) return;

  const redis   = getRedis();
  const bigramK = `ace:engram:bigram:${prevH}`;
  const p       = redis.pipeline();
  p.zincrby(bigramK, 1, curH);
  p.expire(bigramK, BIGRAM_TTL);
  // Keep only the MAX_BIGRAM highest-scoring entries (trim the tail)
  p.zremrangebyrank(bigramK, 0, -(MAX_BIGRAM + 1));
  p.setex(`ace:engram:query:${prevH}`, QUERY_TTL, normalizeQuery(prevQuery));
  p.setex(`ace:engram:query:${curH}`,  QUERY_TTL, normalizeQuery(curQuery));
  await p.exec();
}

/**
 * Get the previous query for this user and atomically store the current one.
 * Returns the previous query string, or null on first call / miss.
 * Uses SET ... GET for atomic swap (avoids race between GET + SETEX).
 */
export async function recordLastQuery(
  userId: string,
  query:  string,
): Promise<string | null> {
  const redis = getRedis();
  const key   = `ace:engram:last:${userId}`;
  // SET key newValue EX ttl GET — atomically returns previous value
  const prev  = await redis.set(key, normalizeQuery(query), 'EX', LAST_TTL, 'GET') as string | null;
  return prev;
}

// ── Read path ─────────────────────────────────────────────────────────────────

export interface EngramSuggestion {
  suggestion: string;
  /** Normalised 0–1: 1 - exp(-freq/5) — smooth exponential, no hard saturation */
  score:      number;
  hitCount:   number;
  source:     'engram';
}

/**
 * Look up next-query suggestions for `query` from the bigram engram index.
 * Returns up to `limit` suggestions ordered by co-occurrence frequency.
 */
export async function getEngramSuggestions(
  query: string,
  limit = 5,
): Promise<EngramSuggestion[]> {
  const redis    = getRedis();
  const hash     = qHash(query);
  const bigramK  = `ace:engram:bigram:${hash}`;
  // ZREVRANGE with WITHSCORES: [...member, score, member, score...]
  const entries  = await redis.zrevrange(bigramK, 0, limit - 1, 'WITHSCORES');
  const results: EngramSuggestion[] = [];
  for (let i = 0; i < entries.length - 1; i += 2) {
    const nextHash   = entries[i];
    const freq       = Number(entries[i + 1]);
    const suggestion = await redis.get(`ace:engram:query:${nextHash}`);
    if (suggestion) {
      results.push({
        suggestion,
        score:    1 - Math.exp(-freq / 5),
        hitCount: Math.round(freq),
        source:   'engram',
      });
    }
  }
  return results;
}

// ── Stats ─────────────────────────────────────────────────────────────────────

async function scanCount(redis: ReturnType<typeof getRedis>, pattern: string): Promise<number> {
  let count  = 0;
  let cursor = '0';
  do {
    const [next, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
    count  += keys.length;
    cursor  = next;
  } while (cursor !== '0');
  return count;
}

export async function getEngramStats(): Promise<{
  bigramKeys:  number;
  queryKeys:   number;
  activeUsers: number;
}> {
  try {
    const redis = getRedis();
    const [bk, qk, uk] = await Promise.all([
      scanCount(redis, 'ace:engram:bigram:*'),
      scanCount(redis, 'ace:engram:query:*'),
      scanCount(redis, 'ace:engram:last:*'),
    ]);
    return { bigramKeys: bk, queryKeys: qk, activeUsers: uk };
  } catch {
    return { bigramKeys: 0, queryKeys: 0, activeUsers: 0 };
  }
}
