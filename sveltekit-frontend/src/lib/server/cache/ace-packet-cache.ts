import { getValkeyClient } from './valkey-client.js';
import { ENV } from '../env.server.js';
import crypto from 'crypto';
import type { VarianceRecovery } from '../ace/variance-recovery-schema.js';

const redis = getValkeyClient();

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

export type SemanticProvenanceTuple = readonly [
  schemaVersion: 1,
  cacheKey: string,
  query: string,
  queryHash: string,
  featureId: string | null,
  primarySourceRef: string | null,
  parentAtlasCardId: string | null,
  sourceRefs: readonly string[],
  packet: Readonly<AcePacket>,
];

function deepFreezePacket(packet: AcePacket): Readonly<AcePacket> {
  const rankedCards = packet.rankedCards.map((card) =>
    card && typeof card === 'object' ? Object.freeze({ ...(card as Record<string, unknown>) }) : card
  );
  return Object.freeze({
    ...packet,
    cacheSources: [...packet.cacheSources],
    sourceRefs: [...packet.sourceRefs],
    rankedCards: Object.freeze(rankedCards),
    failureHints: [...packet.failureHints],
    nextActions: [...packet.nextActions],
  }) as Readonly<AcePacket>;
}

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

export function semanticTupleCacheKey(cacheKey: string): string {
  return `${cacheKey}:tuple`;
}

export function buildSemanticProvenanceTuple(params: {
  cacheKey: string;
  query: string;
  queryHash: string;
  featureId?: string | null;
  primarySourceRef?: string | null;
  parentAtlasCardId?: string | null;
  packet: AcePacket;
}): SemanticProvenanceTuple {
  const packet = deepFreezePacket(params.packet);
  return Object.freeze([
    1,
    params.cacheKey,
    params.query,
    params.queryHash,
    params.featureId ?? null,
    params.primarySourceRef ?? null,
    params.parentAtlasCardId ?? null,
    Object.freeze([...packet.sourceRefs]),
    packet,
  ] as const);
}

export async function redisSetSemanticProvenanceTuple(
  cacheKey: string,
  tuple: SemanticProvenanceTuple,
  ttlSeconds = 3600,
): Promise<void> {
  if (!redis) return;
  try {
    await redis.set(semanticTupleCacheKey(cacheKey), JSON.stringify(tuple), 'EX', ttlSeconds);
  } catch (err) {
    console.warn(`[Redis ACE] Error writing ${semanticTupleCacheKey(cacheKey)}:`, err);
  }
}

export function hashQuery(query: string): string {
  const hash = crypto.createHash('sha256').update(query).digest('hex');
  return `ace:packet:${hash}`;
}
