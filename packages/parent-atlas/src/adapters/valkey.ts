import { Redis } from 'ioredis';
import { resolveRedisConfig, loadRepoEnv } from '../env.js';
import {
  extractPacketIdentityFromRow,
  verifyPacketIdentityConsistency,
  createEnvelopeFromRow,
  bitfrostKey,
} from '../core/canonical-packet-bridge.js';
import {
  prefillValkeyStorageKey,
  valkeyPrefillCacheRecordSchema,
  verifyPrefillRecord,
  type PrefillRuntimeIdentityV1,
  type ValkeyPrefillCacheRecordV1,
} from '../core/prefill-cache-runtime.js';
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
  /** Read and validate a compiled-prefill cache record against an expected immutable identity. */
  getPrefillRecord: (
    identity: PrefillRuntimeIdentityV1,
  ) => Promise<{
    status: 'HIT' | 'MISS' | 'STALE' | 'CORRUPT' | 'REVOKED';
    record: ValkeyPrefillCacheRecordV1 | null;
    mismatches: string[];
  }>;
  /** Store an immutable compiled-prefill record only if the key does not already exist. */
  setPrefillRecordNx: (
    record: ValkeyPrefillCacheRecordV1,
  ) => Promise<'STORED' | 'ALREADY_EXISTS'>;
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
    const identity = extractPacketIdentityFromRow(packetRow);
    const { consistent, mismatches } = verifyPacketIdentityConsistency(identity, packetRow);
    if (!consistent) {
      throw new Error(`Cannot cache packet: ${mismatches.join('; ')}`);
    }

    const envelope = createEnvelopeFromRow(packetRow, traceId, 'packet');
    const cacheKey = bitfrostKey('packet', envelope.packet_key);
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

    await client.setex(cacheKey, ttlSeconds, JSON.stringify(cacheValue));
  }

  async function getPrefillRecord(identity: PrefillRuntimeIdentityV1): Promise<{
    status: 'HIT' | 'MISS' | 'STALE' | 'CORRUPT' | 'REVOKED';
    record: ValkeyPrefillCacheRecordV1 | null;
    mismatches: string[];
  }> {
    const storageKey = prefillValkeyStorageKey(identity.cache_key);
    const raw = await client.get(storageKey);
    if (raw === null) return { status: 'MISS', record: null, mismatches: [] };

    let decoded: unknown;
    try {
      decoded = JSON.parse(raw);
    } catch {
      return { status: 'CORRUPT', record: null, mismatches: ['json'] };
    }

    const parsed = valkeyPrefillCacheRecordSchema.safeParse(decoded);
    if (!parsed.success) {
      return { status: 'CORRUPT', record: null, mismatches: ['schema'] };
    }
    const verification = verifyPrefillRecord(parsed.data, identity);
    return {
      status: verification.status,
      record: verification.reusable ? parsed.data : null,
      mismatches: verification.mismatches,
    };
  }

  async function setPrefillRecordNx(record: ValkeyPrefillCacheRecordV1): Promise<'STORED' | 'ALREADY_EXISTS'> {
    const parsed = valkeyPrefillCacheRecordSchema.parse(record);
    const result = await client.set(
      parsed.storage_key,
      JSON.stringify(parsed),
      'EX',
      parsed.ttl_seconds,
      'NX',
    );
    return result === 'OK' ? 'STORED' : 'ALREADY_EXISTS';
  }

  return {
    client,
    get,
    set,
    hget,
    hgetall,
    keys,
    close,
    setPacketEnvelope,
    getPrefillRecord,
    setPrefillRecordNx,
  };
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
