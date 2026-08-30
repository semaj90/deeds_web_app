import { getBifrostRedis as getRedis } from './redis-adapter.js';
import crypto from 'crypto';
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';
import {
  BITFROST_RESIDENCY_POLICY_V1,
  decideResidencyV1,
  type BitFrostResidencyClass,
  type ResidencyDecisionV1,
  type ResidencyObservationV1,
} from './residency-policy.js';

export type PrefixCacheIdentityV2 = {
  tokenIds: readonly number[];
  modelRevision: string;
  tokenizerRevision: string;
  promptTemplateRevision: string;
  contextManifestChecksum: string;
  adapterRevision?: string;
  cacheSalt?: string;
};

const require = createRequire(import.meta.url);
let __dirname = '';
try {
  __dirname = path.dirname(fileURLToPath(import.meta.url));
} catch (e) {}

let native: any = null;
try {
  if (__dirname) {
    const candidatePaths = [
      path.resolve(process.cwd(), '..', 'simd-bridge/rust-simdjson/target/release/simd_bridge_rs.node'),
      path.resolve(process.cwd(), 'simd-bridge/rust-simdjson/target/release/simd_bridge_rs.node'),
      path.resolve(__dirname, '../../../../../../simd-bridge/rust-simdjson/target/release/simd_bridge_rs.node'),
      path.resolve(__dirname, '../../../../../../../simd-bridge/rust-simdjson/target/release/simd_bridge_rs.node'),
    ];
    const nativePath = candidatePaths.find((candidate) => existsSync(candidate));
    if (nativePath) native = require(nativePath);
  }
} catch (e: any) {
  console.warn('[bifrost-cache] Native Rust bridge load failed, using JS fallback:', e.message);
}

function assertIdentityToken(value: string, name: string): void {
  if (!value || value.trim() !== value) throw new Error(`${name} must be a non-empty trimmed string`);
}

/**
 * Promotion-grade KV prefix identity. Exact token IDs are hashed as u32 LE and
 * runtime/model identity fields are length-prefixed in a fixed order.
 */
export function buildPrefixCacheIdentityV2(input: PrefixCacheIdentityV2): string {
  assertIdentityToken(input.modelRevision, 'modelRevision');
  assertIdentityToken(input.tokenizerRevision, 'tokenizerRevision');
  assertIdentityToken(input.promptTemplateRevision, 'promptTemplateRevision');
  assertIdentityToken(input.contextManifestChecksum, 'contextManifestChecksum');
  if (input.adapterRevision !== undefined) assertIdentityToken(input.adapterRevision, 'adapterRevision');
  if (input.cacheSalt !== undefined) assertIdentityToken(input.cacheSalt, 'cacheSalt');

  const hash = crypto.createHash('sha256');
  hash.update('atlas.bifrost-prefix.v2\0', 'utf8');
  const count = Buffer.allocUnsafe(4);
  count.writeUInt32LE(input.tokenIds.length, 0);
  hash.update(count);
  const tokenBytes = Buffer.allocUnsafe(input.tokenIds.length * 4);
  for (let i = 0; i < input.tokenIds.length; i++) {
    const token = input.tokenIds[i];
    if (!Number.isInteger(token) || token < 0 || token > 0xffff_ffff) {
      throw new Error(`tokenIds[${i}] must be an unsigned 32-bit integer`);
    }
    tokenBytes.writeUInt32LE(token, i * 4);
  }
  hash.update(tokenBytes);

  const fields: Array<[string, string]> = [
    ['modelRevision', input.modelRevision],
    ['tokenizerRevision', input.tokenizerRevision],
    ['promptTemplateRevision', input.promptTemplateRevision],
    ['contextManifestChecksum', input.contextManifestChecksum],
    ['adapterRevision', input.adapterRevision ?? ''],
    ['cacheSalt', input.cacheSalt ?? ''],
  ];
  for (const [name, value] of fields) {
    const pair = Buffer.from(`${name}\0${value}`, 'utf8');
    const length = Buffer.allocUnsafe(4);
    length.writeUInt32LE(pair.length, 0);
    hash.update(length).update(pair);
  }
  return hash.digest('hex');
}

/**
 * BifrostCacheManager
 *
 * Manages disposable KV-cache prefix references and residency metadata.
 */
export class BifrostCacheManager {
  private static PREFIX_KEY = 'bifrost:kv:prefix:';
  private static PREFIX_KEY_V2 = 'bifrost:kv:prefix:v2:';
  private static TTL = 3600 * 4;
  private static RESIDENCY_META_PREFIX = 'bf:meta:v1:';

  static async registerResidency(
    prefillIdentity: string,
    metadata: {
      residencyClass: BitFrostResidencyClass;
      utility: number;
      hitCount: number;
      lastAccessAt: string;
      workspaceRevision: string;
      candidateSnapshotRevision: string;
      ordinalMapChecksum: string;
      contextManifestChecksum: string;
    },
  ): Promise<void> {
    const policy = BITFROST_RESIDENCY_POLICY_V1;
    const observation: ResidencyObservationV1 = {
      currentClass: metadata.residencyClass,
      utility: metadata.utility,
      hitCount: metadata.hitCount,
      inactiveSeconds: 0,
    };
    const decision = decideResidencyV1(observation, policy);
    const key = this.RESIDENCY_META_PREFIX + prefillIdentity;
    const value = JSON.stringify({
      schema: 'atlas.ace-residency-record.v1',
      prefillIdentity,
      ...metadata,
      ttlSeconds: decision.ttlSeconds,
      policyRevision: decision.policyRevision,
      canonicalAuthority: false,
    });
    const redis = getRedis();
    await redis.set(key, value, 'EX', decision.ttlSeconds);
  }

  static async getResidency(prefillIdentity: string): Promise<Record<string, unknown> | null> {
    const raw = await getRedis().get(this.RESIDENCY_META_PREFIX + prefillIdentity).catch(() => null);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
      return null;
    }
  }

  static async applyResidencyDecision(
    prefillIdentity: string,
    observation: ResidencyObservationV1,
  ): Promise<ResidencyDecisionV1> {
    const decision = decideResidencyV1(observation, BITFROST_RESIDENCY_POLICY_V1);
    if (!decision.changed) return decision;
    const redis = getRedis();
    const key = this.RESIDENCY_META_PREFIX + prefillIdentity;
    if (decision.ttlOperation === 'EXPIRE_GT') {
      await redis.expire(key, decision.ttlSeconds, 'GT');
    } else {
      await redis.expire(key, decision.ttlSeconds, 'LT');
    }
    return decision;
  }

  /**
   * Legacy compatibility path: content-only identity is not promotion-grade KV identity.
   */
  static async getPrefixToken(content: string): Promise<string | null> {
    const hash = this.hashContent(content);
    return await getRedis().get(this.PREFIX_KEY + hash);
  }

  /** Legacy compatibility path. Prefer registerPrefixV2(). */
  static async registerPrefix(content: string, token: string): Promise<void> {
    const hash = this.hashContent(content);
    await getRedis().set(this.PREFIX_KEY + hash, token, 'EX', this.TTL);
  }

  static async getPrefixTokenV2(identity: PrefixCacheIdentityV2): Promise<string | null> {
    const hash = buildPrefixCacheIdentityV2(identity);
    return await getRedis().get(this.PREFIX_KEY_V2 + hash);
  }

  static async registerPrefixV2(identity: PrefixCacheIdentityV2, cacheToken: string): Promise<string> {
    const hash = buildPrefixCacheIdentityV2(identity);
    await getRedis().set(this.PREFIX_KEY_V2 + hash, cacheToken, 'EX', this.TTL);
    return hash;
  }

  static prefixCacheKeyV2(identity: PrefixCacheIdentityV2): string {
    return this.PREFIX_KEY_V2 + buildPrefixCacheIdentityV2(identity);
  }

  private static hashContent(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  static async getKagContext(cacheKey: string): Promise<any | null> {
    const redis = getRedis();
    const raw = await redis.get(`bifrost:kag:${cacheKey}`);
    if (!raw) return null;
    try {
      if (native && (typeof native.parseFast === 'function' || typeof native.parse_fast === 'function')) {
        const fn = native.parseFast || native.parse_fast;
        const parsedStr = fn(raw);
        return JSON.parse(parsedStr);
      }
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  static async registerKagContext(cacheKey: string, packet: any): Promise<void> {
    await getRedis().set(`bifrost:kag:${cacheKey}`, JSON.stringify(packet), 'EX', this.TTL);
  }

  static async logRetrieval(opts: {
    queryHash: string;
    promptHash?: string;
    sourceRefs: string[];
    qdrantPointIds?: (string | number)[];
    atlasClusterIds?: string[];
    featureIds?: string[];
    cacheHit: 'redis' | 'bifrost' | 'qdrant' | 'none';
    tokensIn?: number;
    tokensOut?: number;
    latencyMs?: number;
  }): Promise<void> {
    const redis = getRedis();
    const key = `bitfrost:retrieval:${opts.queryHash}`;
    const packet = {
      query_hash: opts.queryHash,
      prompt_hash: opts.promptHash ?? null,
      source_refs: opts.sourceRefs,
      qdrant_point_ids: opts.qdrantPointIds ?? [],
      atlas_cluster_ids: opts.atlasClusterIds ?? [],
      feature_ids: opts.featureIds ?? [],
      cache_hit: opts.cacheHit,
      tokens_in: opts.tokensIn ?? 0,
      tokens_out: opts.tokensOut ?? 0,
      latency_ms: opts.latencyMs ?? 0,
      logged_at: new Date().toISOString(),
    };
    await redis.set(key, JSON.stringify(packet), 'EX', 7200).catch(() => {});
  }

  static async getRetrieval(queryHash: string): Promise<{
    source_refs: string[];
    qdrant_point_ids: (string | number)[];
    atlas_cluster_ids: string[];
    feature_ids: string[];
    cache_hit: string;
    logged_at: string;
  } | null> {
    const raw = await getRedis().get(`bitfrost:retrieval:${queryHash}`).catch(() => null);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return null; }
  }

  /**
   * Compatibility-only optimization. It cannot advance kv_cache_identity because it
   * lacks exact token IDs and model/tokenizer/template/adapter revisions.
   */
  static async optimizeMessages(messages: any[]): Promise<{ optimized: any[], cacheToken?: string }> {
    if (messages.length === 0) return { optimized: messages };
    const systemPrompt = messages.find(m => m.role === 'system')?.content;
    if (systemPrompt) {
      const token = await this.getPrefixToken(systemPrompt);
      if (token) {
        return {
          optimized: messages.filter(m => m.role !== 'system'),
          cacheToken: token
        };
      }
    }
    return { optimized: messages };
  }
}
