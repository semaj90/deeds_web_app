import { desc, sql } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import { aceContextCache } from '$lib/server/db/schema-postgres.js';
import { getCachePolicy } from '$lib/server/cache-config.js';
import { aceContextKey } from '$lib/server/cache-keys.js';
import { getRedis } from '$lib/server/redis.js';
import { estimateTokens, type FeatureWikiPacket } from './token-aware-context-packer.js';
import type { FeatureMap, GrpoMemoryStick } from '$lib/server/features/feature-map.types.js';

const ACE_CONTEXT_TTL_SECONDS = getCachePolicy('ace-context').ttlSeconds;

export type AceContextRegistryPacket = {
  contextHash: string;
  featureId: string;
  summary: string;
  glyphMask: number;
  topFiles: string[];
  topGraphTriples: [string, string, string][];
  selectedSourceIds: string[];
  cacheKeys: string[];
  warnings: string[];
  retiredAt?: string;
  queryHash?: string;
  policyTier?: string;
  cacheSource?: string;
};

export function buildAceContextRegistryPacket(
  featureMap: FeatureMap,
  stick: GrpoMemoryStick,
  extra?: Partial<Pick<AceContextRegistryPacket, 'warnings' | 'policyTier' | 'cacheSource'>>
): AceContextRegistryPacket {
  return {
    contextHash: stick.contextPacketHash,
    featureId: featureMap.featureId,
    summary: featureMap.summaries.short,
    glyphMask: featureMap.glyph.mask,
    topFiles: stick.selectedSourceIds.slice(0, 8),
    topGraphTriples: featureMap.graphTriples.slice(0, 8),
    selectedSourceIds: stick.selectedSourceIds.slice(0, 8),
    cacheKeys: featureMap.cache.redisKeys.slice(0, 8),
    warnings: extra?.warnings ?? [],
    queryHash: stick.queryHash,
    policyTier: extra?.policyTier,
    cacheSource: extra?.cacheSource ?? 'feature_map_store',
  };
}

export function toFeatureWikiPacket(packet: AceContextRegistryPacket): FeatureWikiPacket {
  return {
    featureId: packet.featureId,
    glyphMask: packet.glyphMask,
    summary: packet.summary,
    topFiles: packet.topFiles.slice(0, 8),
    topTriples: packet.topGraphTriples.slice(0, 8),
    selectedSourceIds: packet.selectedSourceIds.slice(0, 8),
    cacheKeys: packet.cacheKeys.slice(0, 8),
    warnings: packet.warnings.slice(0, 8),
  };
}

export async function writeAceContextRegistry(packet: AceContextRegistryPacket): Promise<void> {
  const redis = getRedis();
  const key = aceContextKey.packet(packet.contextHash);
  const payload = JSON.stringify(packet);

  await redis.set(key, payload, 'EX', ACE_CONTEXT_TTL_SECONDS).catch(() => null);

  void db
    .insert(aceContextCache)
    .values({
      queryHash: packet.queryHash ?? packet.contextHash,
      userId: null,
      policyTier: packet.policyTier ?? 'ace-context',
      contextJson: packet as unknown as Record<string, unknown>,
      chunkCount: packet.selectedSourceIds.length,
      totalTokens: estimateTokens(payload),
      cacheSource: packet.cacheSource ?? 'redis',
    })
    .catch(() => null);
}

export async function readAceContextRegistry(contextHash: string): Promise<AceContextRegistryPacket | null> {
  const redis = getRedis();
  const key = aceContextKey.packet(contextHash);
  const cached = await redis.get(key).catch(() => null);
  if (cached) {
    try {
      return JSON.parse(cached) as AceContextRegistryPacket;
    } catch {
      return null;
    }
  }

  const [row] = await db
    .select()
    .from(aceContextCache)
    .where(sql`context_json->>'contextHash' = ${contextHash}`)
    .orderBy(desc(aceContextCache.createdAt))
    .limit(1);

  if (!row) return null;
  const packet = row.contextJson as unknown as AceContextRegistryPacket;
  await redis.set(key, JSON.stringify(packet), 'EX', ACE_CONTEXT_TTL_SECONDS).catch(() => null);
  return packet;
}
