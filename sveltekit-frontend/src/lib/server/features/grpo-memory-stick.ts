/**
 * src/lib/server/features/grpo-memory-stick.ts
 *
 * Implements the GRPO Memory Stick persistence layer for RL-weighted inference.
 */

import { queryHash as computeQueryHash } from '../analytics/search-analytics.js';
import type { GrpoMemoryStick } from './feature-map.types.js';
import { getRedis } from '$lib/server/redis.js';

const GRPO_STICK_PREFIX = 'grpo:memory:';
const GRPO_STICK_TTL = 30 * 24 * 3600; // 30 days

export async function createGrpoMemoryStick(opts: {
  featureId: string;
  query: string;
  contextPacketJSON: string;
  selectedSourceIds: string[];
  rejectedSourceIds: string[];
  rewardSignals: Array<{ name: string; value: number; source?: string }>;
  cacheKeys: string[];
}): Promise<GrpoMemoryStick> {
  const queryHash = computeQueryHash(opts.query);
  
  const crypto = await import('crypto');
  const contextPacketHash = crypto.createHash('sha256')
    .update(opts.contextPacketJSON)
    .digest('hex')
    .slice(0, 16);

  const timestamp = new Date().toISOString();
  const cacheKey = `${GRPO_STICK_PREFIX}${opts.featureId}:${contextPacketHash}`;

  const stick: GrpoMemoryStick = {
    featureId: opts.featureId,
    queryHash,
    contextPacketHash,
    selectedSourceIds: opts.selectedSourceIds,
    rejectedSourceIds: opts.rejectedSourceIds,
    rewardSignals: opts.rewardSignals,
    cacheKeys: opts.cacheKeys,
    createdAt: timestamp,
  };

  // Persist to Redis (fire-and-forget but awaited for return)
  const redis = getRedis();
  await redis.set(cacheKey, JSON.stringify(stick), 'EX', GRPO_STICK_TTL);
  
  // Also push to a rolling log for batch processing
  await redis.lpush('grpo:memory:rolling', JSON.stringify({
    hash: contextPacketHash,
    reward: opts.rewardSignals[0]?.value ?? 0,
    ts: timestamp
  }));
  await redis.ltrim('grpo:memory:rolling', 0, 9999);

  return stick;
}

export async function getGrpoMemoryStick(queryHash: string, contextPacketHash: string): Promise<GrpoMemoryStick | null> {
  const redis = getRedis();
  const raw = await redis.get(`${GRPO_STICK_PREFIX}${queryHash}:${contextPacketHash}`);
  if (!raw) return null;
  return JSON.parse(raw) as GrpoMemoryStick;
}
