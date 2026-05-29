/**
 * Unified Authority Scorer — 4 approaches → 1 Karpathy blend
 *
 * Formula: 0.4·PageRank + 0.3·Attention + 0.3·Authority
 *
 * Replaces:
 * - authority-chain.ts (PageRank blending)
 * - recommendation-metrics.ts (attention scoring)
 * - graph-authority.ts (direct authority scores)
 * - karpathy-gpu-enrich.mjs (GPU attention)
 */

import { cacheHashMap } from './shared-cache-api';
import { CACHE_KEYS, CACHE_TTL, AuthorityScoreSchema } from './cache-config';

// ═══════════════════════════════════════════════════════════════════════
// Type Definitions
// ═══════════════════════════════════════════════════════════════════════

export interface AuthorityInput {
  fileId: string;
  pageRankScore: number; // 0–1
  attentionScore: number; // 0–1
  authorityScore: number; // 0–1
}

export interface AuthorityBlend {
  fileId: string;
  pr: number;
  attn: number;
  authority: number;
  composite: number;
}

// ═══════════════════════════════════════════════════════════════════════
// Main Scoring Logic (Karpathy Blend)
// ═══════════════════════════════════════════════════════════════════════

function computeBlend(input: AuthorityInput): AuthorityBlend {
  // Normalize all scores to 0–1
  const pr = Math.max(0, Math.min(1, input.pageRankScore));
  const attn = Math.max(0, Math.min(1, input.attentionScore));
  const auth = Math.max(0, Math.min(1, input.authorityScore));

  // Karpathy blend: 40% PageRank, 30% Attention, 30% Authority
  const composite = 0.4 * pr + 0.3 * attn + 0.3 * auth;

  return {
    fileId: input.fileId,
    pr,
    attn,
    authority: auth,
    composite,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// Cached API
// ═══════════════════════════════════════════════════════════════════════

export async function getAuthorityBlend(input: AuthorityInput): Promise<AuthorityBlend> {
  // Use hash map pattern — store by fileId in a single Redis hash
  return cacheHashMap(
    'authority:blend:v2', // hashKey
    input.fileId, // fieldKey
    () => Promise.resolve(computeBlend(input)),
    {
      ttlSeconds: CACHE_TTL.AUTHORITY,
      schema: AuthorityScoreSchema,
      onMiss: (key, field) => {
        console.debug(`[AuthorityScorer] MISS: ${field}`);
      },
      onError: (err) => {
        console.warn(`[AuthorityScorer] Cache error:`, err);
      },
    }
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Batch API
// ═══════════════════════════════════════════════════════════════════════

export async function getAuthorityBlendBatch(
  inputs: AuthorityInput[]
): Promise<Record<string, AuthorityBlend>> {
  const redis = await import('$lib/server/redis').then((m) => m.getRedis());

  const result: Record<string, AuthorityBlend> = {};
  const missing: AuthorityInput[] = [];

  // Try batch read
  try {
    const cached = await redis
      .hgetall('authority:blend:v2')
      .catch(() => ({}));

    inputs.forEach((input) => {
      if (cached[input.fileId]) {
        try {
          result[input.fileId] = JSON.parse(cached[input.fileId]);
        } catch {
          missing.push(input);
        }
      } else {
        missing.push(input);
      }
    });
  } catch {
    missing.push(...inputs);
  }

  // Compute missing
  if (missing.length > 0) {
    for (const input of missing) {
      const blend = computeBlend(input);
      result[input.fileId] = blend;

      // Store in cache (fire-and-forget)
      redis
        .hset('authority:blend:v2', input.fileId, JSON.stringify(blend))
        .catch(() => {});
    }

    // Set hash expiration
    redis.expire('authority:blend:v2', CACHE_TTL.AUTHORITY).catch(() => {});
  }

  return result;
}

// ═══════════════════════════════════════════════════════════════════════
// Top-K Query (for analytics)
// ═══════════════════════════════════════════════════════════════════════

export async function getTopAuthorityFiles(
  limit: number = 100,
  minComposite: number = 0.5
): Promise<AuthorityBlend[]> {
  const redis = await import('$lib/server/redis').then((m) => m.getRedis());

  try {
    const cached = await redis.hgetall('authority:blend:v2');
    const blends = Object.values(cached)
      .map((val) => JSON.parse(val) as AuthorityBlend)
      .filter((b) => b.composite >= minComposite)
      .sort((a, b) => b.composite - a.composite)
      .slice(0, limit);

    return blends;
  } catch (err) {
    console.warn(`[AuthorityScorer] getTopAuthorityFiles failed:`, err);
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════════════
// Clear (for invalidation)
// ═══════════════════════════════════════════════════════════════════════

export async function clearAuthorityCache(): Promise<number> {
  const redis = await import('$lib/server/redis').then((m) => m.getRedis());
  return redis.del('authority:blend:v2');
}

// ═══════════════════════════════════════════════════════════════════════
// Health Check
// ═══════════════════════════════════════════════════════════════════════

export async function getAuthorityScoreStats(): Promise<{
  cachedCount: number;
  avgComposite: number;
  maxComposite: number;
  minComposite: number;
}> {
  const redis = await import('$lib/server/redis').then((m) => m.getRedis());

  try {
    const cached = await redis.hgetall('authority:blend:v2');
    const blends = Object.values(cached).map((val) => JSON.parse(val) as AuthorityBlend);

    if (blends.length === 0) {
      return { cachedCount: 0, avgComposite: 0, maxComposite: 0, minComposite: 0 };
    }

    const composites = blends.map((b) => b.composite);
    const avgComposite = composites.reduce((a, b) => a + b, 0) / composites.length;

    return {
      cachedCount: blends.length,
      avgComposite,
      maxComposite: Math.max(...composites),
      minComposite: Math.min(...composites),
    };
  } catch (err) {
    console.warn(`[AuthorityScorer] getAuthorityScoreStats failed:`, err);
    return { cachedCount: 0, avgComposite: 0, maxComposite: 0, minComposite: 0 };
  }
}
