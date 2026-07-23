import { Redis } from 'ioredis';
import { resolveRedisConfig, loadRepoEnv } from '../env.js';
import {
  extractPacketIdentityFromRow,
  verifyPacketIdentityConsistency,
  createEnvelopeFromRow,
  bitfrostKey,
  type AtlasMemoryEnvelope,
} from '../core/canonical-packet-bridge.js';
import type { QueryResultRow } from 'pg';

export interface ValkeyAdapter {
  client: Redis;
  get: (key: string) => Promise<string | null>;
  set: (key: string, value: string, ttlSeconds?: number) => Promise<void>;
  hget: (key: string, field: string) => Promise<string | null>;
  hgetall: (key: string) => Promise<Record<string, string>>;
  keys: (pattern: string) => Promise<string[]>;
  close: () => Promise<void>;
  /** Set packet envelope in cache with trace_id (24h TTL default) */
  setPacketEnvelope: (
    packetRow: QueryResultRow,
    traceId: string,
    ttlSeconds?: number
  ) => Promise<void>;
}

export function createValkeyAdapter(overrideConfig?: { host?: string; port?: number; password?: string }): ValkeyAdapter {
  const env = loadRepoEnv();
  const cfg = resolveRedisConfig(env);

  const client = new Redis({
    host: overrideConfig?.host ?? cfg.host,
    port: overrideConfig?.port ?? cfg.port,
    password: overrideConfig?.password ?? cfg.password,
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    retryStrategy: () => null,
  });
  client.on('error', () => {});

  async function get(key: string): Promise<string | null> {
    return client.get(key);
  }

  async function set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds) {
      await client.setex(key, ttlSeconds, value);
    } else {
      await client.set(key, value);
    }
  }

  async function hget(key: string, field: string): Promise<string | null> {
    return client.hget(key, field);
  }

  async function hgetall(key: string): Promise<Record<string, string>> {
    const result = await client.hgetall(key);
    return result ?? {};
  }

  async function keys(pattern: string): Promise<string[]> {
    return client.keys(pattern);
  }

  async function close(): Promise<void> {
    await client.quit();
  }

  async function setPacketEnvelope(
    packetRow: QueryResultRow,
    traceId: string,
    ttlSeconds: number = 86400 // 24h default
  ): Promise<void> {
    // Extract and verify canonical identity
    const identity = extractPacketIdentityFromRow(packetRow);
    const { consistent, mismatches } = verifyPacketIdentityConsistency(identity, packetRow);
    if (!consistent) {
      throw new Error(`Cannot cache packet: ${mismatches.join('; ')}`);
    }

    // Create envelope
    const envelope = createEnvelopeFromRow(packetRow, traceId, 'packet');

    // Use bitfrostKey for canonical cache key pattern
    const cacheKey = bitfrostKey('packet', envelope.packet_key);

    // Store envelope shape: always include trace_id and identity fields
    const cacheValue = {
      trace_id: envelope.trace_id,
      packet_key: envelope.packet_key,
      source_ref: envelope.source_ref,
      feature_id: envelope.feature_id,
      directory_path: packetRow.directory_path,
      file_path: packetRow.file_path,
      function_symbol: packetRow.function_symbol,
      feature_label: packetRow.feature_label,
      summary: packetRow.summary,
      embedding_status: packetRow.embedding_status,
      som_x: packetRow.som_x,
      som_y: packetRow.som_y,
      som_cluster: packetRow.som_cluster,
      karpathy_score: packetRow.karpathy_score,
      community_id: packetRow.community_id,
      batch_id: packetRow.batch_id,
      glyph_id: packetRow.glyph_id,
      centroid_id: packetRow.centroid_id,
    };

    await client.setex(
      cacheKey,
      ttlSeconds,
      JSON.stringify(cacheValue)
    );
  }

  return { client, get, set, hget, hgetall, keys, close, setPacketEnvelope };
}

export async function withValkey<T>(
  fn: (adapter: ValkeyAdapter) => Promise<T>,
  overrideConfig?: { host?: string; port?: number; password?: string },
): Promise<T> {
  const adapter = createValkeyAdapter(overrideConfig);
  await adapter.client.connect();
  try {
    return await fn(adapter);
  } finally {
    await adapter.close();
  }
}
