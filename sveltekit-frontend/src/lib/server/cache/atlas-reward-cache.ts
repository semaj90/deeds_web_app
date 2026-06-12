/**
 * atlas-reward-cache.ts — Three-lane semantic cache + reward sorted sets
 *
 * Adds two new cache levels on top of redis-semantic-cache.ts (query level):
 *   Lane 2: bifrost:sem:packet:{packet_key}  — packet-level result cache (TTL 1h)
 *   Lane 3: bifrost:sem:feature:{feature_id} — feature-level result cache (TTL 4h)
 *
 * Reward sorted sets (for reward-weighted K-means / XGBoost training signals):
 *   reward:zset:packet  → ZADD {reward_score} {packet_key}
 *   reward:zset:feature → ZADD {avg_reward}   {feature_id}
 *   reward:zset:query   → ZADD {score}         {query_hash}
 *
 * All writes are fire-and-forget. All reads degrade silently on Redis error.
 */

import type Redis from 'ioredis';
import { createHash } from 'node:crypto';

// ── Key builders ──────────────────────────────────────────────────────────────

export const PACKET_KEY_PREFIX  = 'bifrost:sem:packet:';
export const FEATURE_KEY_PREFIX = 'bifrost:sem:feature:';

export const REWARD_ZSET_PACKET  = 'reward:zset:packet';
export const REWARD_ZSET_FEATURE = 'reward:zset:feature';
export const REWARD_ZSET_QUERY   = 'reward:zset:query';

// Max entries to keep in reward sorted sets (prune oldest when exceeded)
const REWARD_ZSET_MAX = 10_000;

function packetCacheKey(packetKey: string): string {
  return `${PACKET_KEY_PREFIX}${packetKey}`;
}

function featureCacheKey(featureId: string): string {
  return `${FEATURE_KEY_PREFIX}${featureId}`;
}

export function queryRewardKey(queryText: string): string {
  return createHash('sha256').update(queryText).digest('hex').slice(0, 16);
}

// ── Packet-level cache ────────────────────────────────────────────────────────

export interface PacketCacheEntry {
  packetKey: string;
  featureId: string | null;
  summary: string | null;
  conceptIds: string[];
  communityId: number | null;
  rewardScore: number;
  cachedAt: string;
}

export async function getPacketCache(
  redis: Redis,
  packetKey: string,
): Promise<PacketCacheEntry | null> {
  try {
    const raw = await redis.get(packetCacheKey(packetKey));
    if (!raw) return null;
    return JSON.parse(raw) as PacketCacheEntry;
  } catch {
    return null;
  }
}

export async function setPacketCache(
  redis: Redis,
  entry: PacketCacheEntry,
  ttlSeconds = 3600,
): Promise<void> {
  try {
    const key = packetCacheKey(entry.packetKey);
    await redis.set(key, JSON.stringify({ ...entry, cachedAt: new Date().toISOString() }), 'EX', ttlSeconds);
  } catch {
    // non-fatal
  }
}

export async function setPacketCacheBatch(
  redis: Redis,
  entries: PacketCacheEntry[],
  ttlSeconds = 3600,
): Promise<void> {
  if (entries.length === 0) return;
  try {
    const pipeline = redis.pipeline();
    for (const entry of entries) {
      const key = packetCacheKey(entry.packetKey);
      pipeline.set(key, JSON.stringify({ ...entry, cachedAt: new Date().toISOString() }), 'EX', ttlSeconds);
    }
    await pipeline.exec();
  } catch {
    // non-fatal
  }
}

// ── Feature-level cache ───────────────────────────────────────────────────────

export interface FeatureCacheEntry {
  featureId: string;
  label: string | null;
  packetKeys: string[];
  avgRewardScore: number;
  packetCount: number;
  cachedAt: string;
}

export async function getFeatureCache(
  redis: Redis,
  featureId: string,
): Promise<FeatureCacheEntry | null> {
  try {
    const raw = await redis.get(featureCacheKey(featureId));
    if (!raw) return null;
    return JSON.parse(raw) as FeatureCacheEntry;
  } catch {
    return null;
  }
}

export async function setFeatureCache(
  redis: Redis,
  entry: FeatureCacheEntry,
  ttlSeconds = 14400,
): Promise<void> {
  try {
    const key = featureCacheKey(entry.featureId);
    await redis.set(key, JSON.stringify({ ...entry, cachedAt: new Date().toISOString() }), 'EX', ttlSeconds);
  } catch {
    // non-fatal
  }
}

// ── Reward sorted sets ────────────────────────────────────────────────────────

/**
 * Record a reward signal for a packet.
 * ZADD reward:zset:packet {score} {packetKey}
 * Prunes the oldest entries when set grows beyond REWARD_ZSET_MAX.
 */
export async function recordPacketReward(
  redis: Redis,
  packetKey: string,
  score: number,
): Promise<void> {
  try {
    await redis.zadd(REWARD_ZSET_PACKET, score, packetKey);
    const size = await redis.zcard(REWARD_ZSET_PACKET);
    if (size > REWARD_ZSET_MAX) {
      await redis.zremrangebyrank(REWARD_ZSET_PACKET, 0, size - REWARD_ZSET_MAX - 1);
    }
  } catch {
    // non-fatal
  }
}

/**
 * Record a reward signal for a feature.
 * ZADD reward:zset:feature {avgScore} {featureId}
 */
export async function recordFeatureReward(
  redis: Redis,
  featureId: string,
  avgScore: number,
): Promise<void> {
  try {
    await redis.zadd(REWARD_ZSET_FEATURE, avgScore, featureId);
    const size = await redis.zcard(REWARD_ZSET_FEATURE);
    if (size > REWARD_ZSET_MAX) {
      await redis.zremrangebyrank(REWARD_ZSET_FEATURE, 0, size - REWARD_ZSET_MAX - 1);
    }
  } catch {
    // non-fatal
  }
}

/**
 * Record a reward signal for a query (by hash).
 * ZADD reward:zset:query {score} {queryHash}
 */
export async function recordQueryReward(
  redis: Redis,
  queryText: string,
  score: number,
): Promise<void> {
  try {
    const hash = queryRewardKey(queryText);
    await redis.zadd(REWARD_ZSET_QUERY, score, hash);
    const size = await redis.zcard(REWARD_ZSET_QUERY);
    if (size > REWARD_ZSET_MAX) {
      await redis.zremrangebyrank(REWARD_ZSET_QUERY, 0, size - REWARD_ZSET_MAX - 1);
    }
  } catch {
    // non-fatal
  }
}

/**
 * Get the top-N packets by reward score.
 * Returns [{member, score}] sorted descending.
 */
export async function getTopRewardedPackets(
  redis: Redis,
  topN = 100,
): Promise<Array<{ packetKey: string; score: number }>> {
  try {
    const result = await redis.zrevrangebyscore(
      REWARD_ZSET_PACKET,
      '+inf',
      '-inf',
      'WITHSCORES',
      'LIMIT',
      0,
      topN,
    );
    const out: Array<{ packetKey: string; score: number }> = [];
    for (let i = 0; i < result.length; i += 2) {
      out.push({ packetKey: result[i], score: parseFloat(result[i + 1]) });
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * Get the top-N features by reward score.
 */
export async function getTopRewardedFeatures(
  redis: Redis,
  topN = 20,
): Promise<Array<{ featureId: string; score: number }>> {
  try {
    const result = await redis.zrevrangebyscore(
      REWARD_ZSET_FEATURE,
      '+inf',
      '-inf',
      'WITHSCORES',
      'LIMIT',
      0,
      topN,
    );
    const out: Array<{ featureId: string; score: number }> = [];
    for (let i = 0; i < result.length; i += 2) {
      out.push({ featureId: result[i], score: parseFloat(result[i + 1]) });
    }
    return out;
  } catch {
    return [];
  }
}

// ── Bulk seed from Postgres reward_prior ─────────────────────────────────────

/**
 * Seed reward:zset:packet from atlas_packets.reward_prior.
 * Called once at startup or after a backfill to populate the sorted sets
 * so reward-weighted K-means and XGBoost feature export have a warm start.
 *
 * Returns count of seeded entries.
 */
export async function seedRewardSetsFromPostgres(
  redis: Redis,
  packets: Array<{ packetKey: string; featureId: string | null; rewardPrior: number }>,
): Promise<number> {
  if (packets.length === 0) return 0;
  try {
    const pipeline = redis.pipeline();

    // Build feature → max reward map
    const featureRewards = new Map<string, { total: number; count: number }>();

    for (const p of packets) {
      if (!p.packetKey || p.rewardPrior <= 0) continue;
      pipeline.zadd(REWARD_ZSET_PACKET, p.rewardPrior, p.packetKey);

      if (p.featureId) {
        const existing = featureRewards.get(p.featureId) ?? { total: 0, count: 0 };
        existing.total += p.rewardPrior;
        existing.count += 1;
        featureRewards.set(p.featureId, existing);
      }
    }

    for (const [featureId, { total, count }] of featureRewards.entries()) {
      pipeline.zadd(REWARD_ZSET_FEATURE, total / count, featureId);
    }

    await pipeline.exec();
    return packets.filter((p) => p.rewardPrior > 0).length;
  } catch {
    return 0;
  }
}

// ── Stats ─────────────────────────────────────────────────────────────────────

export async function getRewardCacheStats(redis: Redis): Promise<{
  packetZsetSize: number;
  featureZsetSize: number;
  queryZsetSize: number;
  available: boolean;
}> {
  try {
    const [packetSize, featureSize, querySize] = await Promise.all([
      redis.zcard(REWARD_ZSET_PACKET),
      redis.zcard(REWARD_ZSET_FEATURE),
      redis.zcard(REWARD_ZSET_QUERY),
    ]);
    return {
      packetZsetSize: packetSize,
      featureZsetSize: featureSize,
      queryZsetSize: querySize,
      available: true,
    };
  } catch {
    return { packetZsetSize: 0, featureZsetSize: 0, queryZsetSize: 0, available: false };
  }
}
