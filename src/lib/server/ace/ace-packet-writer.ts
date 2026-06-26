/**
 * ACE Packet Writer
 *
 * Persists ACE packets to:
 * - Postgres (atlas_packets, canonical truth)
 * - Redis/Valkey (L1 cache for fast lookups)
 * - .tmp files (offline batch audit trail)
 *
 * Does NOT run LLM. Does NOT validate packets.
 * Only writes pre-validated packets.
 *
 * This is a pure write-side adapter that materializes ACEPacket to stores.
 */

import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type { ACEPacket } from './ace-packet-types';
import { writeFileSync, mkdirSync } from 'fs';
import { resolve } from 'path';

export interface ACEPacketWriteOptions {
  toPostgres?: boolean;
  toRedis?: boolean;
  toTmp?: boolean;
  redisTTL?: number; // seconds, default 3600 (1 hour)
}

/**
 * Write ACE packet to Postgres (canonical truth).
 * Upserts on conflict with packet_key.
 */
export async function writeACEPacketToPostgres(
  db: PostgresJsDatabase,
  packet: ACEPacket
): Promise<void> {
  const { atlasPackets } = await import('$lib/server/db/schema-postgres.js');
  const { sql } = await import('drizzle-orm');

  // Update or insert packet
  await db.execute(
    sql`
      INSERT INTO ${atlasPackets} (packet_key, feature_id, source_ref, summary, metadata, payload)
      VALUES (${packet.packet_key}, ${packet.feature_id}, ${packet.source_ref}, ${packet.summary}, ${JSON.stringify(packet.metadata || {})}, ${JSON.stringify({ evidence_text: packet.evidence_text })})
      ON CONFLICT (packet_key) DO UPDATE SET
        metadata = EXCLUDED.metadata,
        payload = EXCLUDED.payload,
        updated_at = now()
    `
  );
}

/**
 * Batch write ACE packets to Postgres.
 */
export async function writeACEPacketsToPostgres(
  db: PostgresJsDatabase,
  packets: ACEPacket[]
): Promise<void> {
  for (const packet of packets) {
    await writeACEPacketToPostgres(db, packet);
  }
}

/**
 * Write ACE packet to Redis/Valkey cache (L1 hot path).
 * Key format: "ace:packet:{packet_key}"
 * TTL: 1 hour default
 */
export async function writeACEPacketToRedis(
  redis: any, // ioredis client
  packet: ACEPacket,
  ttlSeconds: number = 3600
): Promise<void> {
  const cacheKey = `ace:packet:${packet.packet_key}`;
  const serialized = JSON.stringify(packet);

  if (ttlSeconds > 0) {
    await redis.setex(cacheKey, ttlSeconds, serialized);
  } else {
    await redis.set(cacheKey, serialized);
  }
}

/**
 * Batch write ACE packets to Redis cache.
 */
export async function writeACEPacketsToRedis(
  redis: any,
  packets: ACEPacket[],
  ttlSeconds: number = 3600
): Promise<void> {
  const pipeline = redis.pipeline();

  for (const packet of packets) {
    const cacheKey = `ace:packet:${packet.packet_key}`;
    const serialized = JSON.stringify(packet);

    if (ttlSeconds > 0) {
      pipeline.setex(cacheKey, ttlSeconds, serialized);
    } else {
      pipeline.set(cacheKey, serialized);
    }
  }

  await pipeline.exec();
}

/**
 * Write ACE packet to .tmp file for audit trail.
 * File format: .tmp/ace-packets-{timestamp}.jsonl
 */
export async function writeACEPacketToTmp(packet: ACEPacket): Promise<string> {
  mkdirSync('.tmp', { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const tmpFile = resolve('.tmp', `ace-packets-${timestamp}.jsonl`);

  const line = JSON.stringify(packet) + '\n';

  try {
    writeFileSync(tmpFile, line, { flag: 'a' });
  } catch (err) {
    console.error(`Failed to write ACE packet to .tmp: ${err}`);
  }

  return tmpFile;
}

/**
 * Batch write ACE packets to .tmp file.
 */
export async function writeACEPacketsToTmp(packets: ACEPacket[]): Promise<string> {
  mkdirSync('.tmp', { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const tmpFile = resolve('.tmp', `ace-packets-${timestamp}.jsonl`);

  const lines = packets.map(p => JSON.stringify(p) + '\n').join('');

  try {
    writeFileSync(tmpFile, lines, { flag: 'a' });
  } catch (err) {
    console.error(`Failed to write ACE packets to .tmp: ${err}`);
  }

  return tmpFile;
}

/**
 * Write ACE packet to all configured stores.
 */
export async function writeACEPacket(
  packet: ACEPacket,
  db?: PostgresJsDatabase,
  redis?: any,
  options: ACEPacketWriteOptions = {}
): Promise<void> {
  const {
    toPostgres = !!db,
    toRedis = !!redis,
    toTmp = true,
    redisTTL = 3600
  } = options;

  if (toPostgres && db) {
    try {
      await writeACEPacketToPostgres(db, packet);
    } catch (err) {
      console.error(`Failed to write packet to Postgres: ${err}`);
      // Don't throw, continue to other stores
    }
  }

  if (toRedis && redis) {
    try {
      await writeACEPacketToRedis(redis, packet, redisTTL);
    } catch (err) {
      console.error(`Failed to write packet to Redis: ${err}`);
    }
  }

  if (toTmp) {
    try {
      await writeACEPacketToTmp(packet);
    } catch (err) {
      console.error(`Failed to write packet to .tmp: ${err}`);
    }
  }
}

/**
 * Batch write ACE packets to all configured stores.
 */
export async function writeACEPackets(
  packets: ACEPacket[],
  db?: PostgresJsDatabase,
  redis?: any,
  options: ACEPacketWriteOptions = {}
): Promise<void> {
  const {
    toPostgres = !!db,
    toRedis = !!redis,
    toTmp = true,
    redisTTL = 3600
  } = options;

  if (toPostgres && db) {
    try {
      await writeACEPacketsToPostgres(db, packets);
    } catch (err) {
      console.error(`Failed to write packets to Postgres: ${err}`);
    }
  }

  if (toRedis && redis) {
    try {
      await writeACEPacketsToRedis(redis, packets, redisTTL);
    } catch (err) {
      console.error(`Failed to write packets to Redis: ${err}`);
    }
  }

  if (toTmp) {
    try {
      await writeACEPacketsToTmp(packets);
    } catch (err) {
      console.error(`Failed to write packets to .tmp: ${err}`);
    }
  }
}

/**
 * Delete ACE packet from cache stores (Postgres delete should be rare).
 */
export async function deleteACEPacketFromRedis(
  redis: any,
  packetKey: string
): Promise<void> {
  const cacheKey = `ace:packet:${packetKey}`;
  await redis.del(cacheKey);
}

/**
 * Clear all ACE cache entries from Redis matching pattern.
 */
export async function clearACECacheFromRedis(redis: any, pattern: string = '*'): Promise<number> {
  const keys = await redis.keys(`ace:packet:${pattern}`);
  if (keys.length === 0) return 0;

  return await redis.del(...keys);
}
