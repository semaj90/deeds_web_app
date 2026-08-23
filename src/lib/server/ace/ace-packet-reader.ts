/**
 * ACE Packet Reader
 *
 * Loads ACE packets from:
 * - Postgres (atlas_packets, canonical truth)
 * - Redis/Valkey (L1 cache, fast path)
 * - .tmp files (offline batch processing)
 *
 * Does NOT validate. That's the validator's job.
 * Does NOT synthesize. That's Gemma4's job.
 *
 * This is a pure read-side adapter that maps Postgres/Redis rows to ACEPacket.
 */

import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { eq, inArray } from 'drizzle-orm';
import type { ACEPacket } from './ace-packet-types';

export interface ACEPacketReaderOptions {
  includeMetadata?: boolean;
  includeEvidenceText?: boolean;
  limit?: number;
}

/**
 * Read ACE packets from Postgres (canonical truth).
 */
export async function readACEPacketsFromPostgres(
  db: PostgresJsDatabase,
  packetKeys: string[],
  options: ACEPacketReaderOptions = {}
): Promise<ACEPacket[]> {
  if (packetKeys.length === 0) return [];

  // Import schema at call time to avoid circular deps
  const { atlasPackets } = await import('$lib/server/db/schema-postgres.js');

  const rows = await db
    .select()
    .from(atlasPackets)
    .where(inArray(atlasPackets.packet_key, packetKeys))
    .limit(options.limit || 100);

  return rows.map(row => ({
    packet_key: row.packet_key,
    feature_id: row.feature_id,
    source_ref: row.source_ref,
    summary: row.summary || '',
    evidence_text: options.includeEvidenceText
      ? row.payload?.evidence_text || row.summary
      : undefined,
    metadata: options.includeMetadata
      ? {
          feature_label: row.feature_label,
          community_id: row.community_id,
          cluster_id: row.cluster_id,
          kmeans_cluster: row.kmeans_cluster,
          som_row: row.som_row,
          som_col: row.som_col,
          domain: row.domain_class,
          tags: row.tags,
          created_at: row.created_at?.toISOString()
        }
      : undefined,
    cluster_id: row.cluster_id,
    som_cluster: row.som_index,
    kmeans_cluster: row.kmeans_cluster,
    domain: row.domain_class,
    trace_id: row.lineage_version,
    created_at: row.created_at?.toISOString()
  }));
}

/**
 * Read ACE packet by packet_key from Postgres (single lookup).
 */
export async function readACEPacketByKey(
  db: PostgresJsDatabase,
  packetKey: string,
  options: ACEPacketReaderOptions = {}
): Promise<ACEPacket | null> {
  const packets = await readACEPacketsFromPostgres(db, [packetKey], options);
  return packets[0] || null;
}

/**
 * Read ACE packets by feature_id from Postgres (bulk lookup).
 */
export async function readACEPacketsByFeatureId(
  db: PostgresJsDatabase,
  featureId: string,
  options: ACEPacketReaderOptions = {}
): Promise<ACEPacket[]> {
  const { atlasPackets } = await import('$lib/server/db/schema-postgres.js');

  const rows = await db
    .select()
    .from(atlasPackets)
    .where(eq(atlasPackets.feature_id, featureId))
    .limit(options.limit || 50);

  return rows.map(row => ({
    packet_key: row.packet_key,
    feature_id: row.feature_id,
    source_ref: row.source_ref,
    summary: row.summary || '',
    evidence_text: options.includeEvidenceText
      ? row.payload?.evidence_text || row.summary
      : undefined,
    metadata: options.includeMetadata ? { feature_label: row.feature_label } : undefined
  }));
}

/**
 * Read ACE packets by source_ref from Postgres (file-level lookup).
 */
export async function readACEPacketsBySourceRef(
  db: PostgresJsDatabase,
  sourceRef: string,
  options: ACEPacketReaderOptions = {}
): Promise<ACEPacket[]> {
  const { atlasPackets } = await import('$lib/server/db/schema-postgres.js');

  const rows = await db
    .select()
    .from(atlasPackets)
    .where(eq(atlasPackets.source_ref, sourceRef))
    .limit(options.limit || 100);

  return rows.map(row => ({
    packet_key: row.packet_key,
    feature_id: row.feature_id,
    source_ref: row.source_ref,
    summary: row.summary || '',
    evidence_text: options.includeEvidenceText
      ? row.payload?.evidence_text || row.summary
      : undefined
  }));
}

/**
 * Batch read ACE packets from Postgres by feature_ids.
 */
export async function readACEPacketsByFeatureIds(
  db: PostgresJsDatabase,
  featureIds: string[],
  options: ACEPacketReaderOptions = {}
): Promise<Map<string, ACEPacket[]>> {
  if (featureIds.length === 0) return new Map();

  const { atlasPackets } = await import('$lib/server/db/schema-postgres.js');

  const rows = await db
    .select()
    .from(atlasPackets)
    .where(inArray(atlasPackets.feature_id, featureIds))
    .limit(options.limit || 1000);

  const result = new Map<string, ACEPacket[]>();

  for (const row of rows) {
    const packet: ACEPacket = {
      packet_key: row.packet_key,
      feature_id: row.feature_id,
      source_ref: row.source_ref,
      summary: row.summary || ''
    };

    if (!result.has(row.feature_id)) {
      result.set(row.feature_id, []);
    }
    result.get(row.feature_id)!.push(packet);
  }

  return result;
}

/**
 * Read ACE packets from Redis/Valkey cache (L1 hot path).
 * Key format: "ace:packet:{packet_key}"
 */
export async function readACEPacketFromRedis(
  redis: any, // ioredis client
  packetKey: string
): Promise<ACEPacket | null> {
  const cacheKey = `ace:packet:${packetKey}`;
  const cached = await redis.get(cacheKey);

  if (!cached) return null;

  try {
    return JSON.parse(cached) as ACEPacket;
  } catch {
    // Cache corrupted, ignore
    return null;
  }
}

/**
 * Batch read ACE packets from Redis cache.
 */
export async function readACEPacketsFromRedis(
  redis: any,
  packetKeys: string[]
): Promise<ACEPacket[]> {
  if (packetKeys.length === 0) return [];

  const cacheKeys = packetKeys.map(pk => `ace:packet:${pk}`);
  const cached = await redis.mget(...cacheKeys);

  const packets: ACEPacket[] = [];

  for (const entry of cached) {
    if (!entry) continue;
    try {
      packets.push(JSON.parse(entry) as ACEPacket);
    } catch {
      // Skip corrupted entries
    }
  }

  return packets;
}
