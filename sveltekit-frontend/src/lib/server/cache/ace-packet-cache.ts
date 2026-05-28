import Redis from 'ioredis';
import { ENV } from '../env.server.js';
import crypto from 'crypto';
import type { VarianceRecovery } from '../ace/variance-recovery-schema.js';

const redis = new Redis(ENV.REDIS_URL);

export type AcePacket = {
  query: string;
  cacheSources: string[];
  sourceRefs: string[];
  rankedCards: any[];
  failureHints: string[];
  nextActions: string[];
  promptCacheKey: string;
  degraded: boolean;
  varianceRecovery?: VarianceRecovery;
};

export async function redisGetAcePacket(cacheKey: string): Promise<AcePacket | null> {
  if (!redis) return null;
  try {
    const data = await redis.get(cacheKey);
    if (!data) return null;
    return JSON.parse(data) as AcePacket;
  } catch (err) {
    console.warn(`[Redis ACE] Miss/Error reading ${cacheKey}:`, err);
    return null;
  }
}

export async function redisSetAcePacket(cacheKey: string, packet: AcePacket, ttlSeconds = 3600): Promise<void> {
  if (!redis) return;
  try {
    await redis.set(cacheKey, JSON.stringify(packet), 'EX', ttlSeconds);
  } catch (err) {
    console.warn(`[Redis ACE] Error writing ${cacheKey}:`, err);
  }
}

export function hashQuery(query: string): string {
  const hash = crypto.createHash('sha256').update(query).digest('hex');
  return `ace:packet:${hash}`;
}
