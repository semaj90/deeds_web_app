/**
 * feature-context-matrix.ts
 *
 * Server-side service for the ACE Feature Context Matrix.
 * Provides typed access to the indexed feature cards, chunk metadata,
 * and the multi-store lookup pipeline:
 *
 *   Redis ace:feature:{key}  → hot card (most queries stop here)
 *   Qdrant error_notes / docs_chunks → full semantic search
 *   Postgres metadata_envelopes → durable audit trail
 *
 * This is a READ-ONLY service. Write paths live in the scripts/atlas/* scripts.
 *
 * Usage (server-side only):
 *   import { getFeatureCard, searchFeatureMatrix } from '$lib/server/atlas/feature-context-matrix';
 */

import { getRedis }  from '$lib/server/redis.js';
import type { Redis } from 'ioredis';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AtlasChunk {
  chunk_id:    string;
  source_path: string;
  source_type: 'rg_output' | 'error_log' | 'docs' | 'notes';
  chunk_index: number;
  char_offset: number;
  text:        string;
  tags:        string[];
  file_refs:   string[];
  rg_paths:    string[];
  word_count:  number;
  synthesis?:  string | null;
  indexed_at?: string;
}

export interface FeatureCard {
  feature_key:  string;
  tags:         string[];
  source_type:  string;
  chunk_ids:    string[];
  file_refs:    string[];
  rg_paths:     string[];
  top_snippets: string[];
  indexed_at:   string;
}

export interface ErrorCard {
  error_code:  string;
  feature_key: string;
  tags:        string[];
  chunk_ids:   string[];
  file_refs:   string[];
  top_snippets:string[];
  indexed_at:  string;
}

export interface CtxPacket {
  feature_key: string;
  synthesis:   string;
  chunk_ids:   string[];
  tags:        string[];
  indexed_at:  string;
}

export interface FeatureMatrixResult {
  feature_key: string;
  card:        FeatureCard | null;
  ctx:         CtxPacket  | null;
  error_card:  ErrorCard  | null;
  source:      'redis_hot' | 'qdrant' | 'miss';
}

// ── Redis helpers ─────────────────────────────────────────────────────────────

const ACE_FEATURE_PREFIX = 'ace:feature';
const ACE_ERROR_PREFIX   = 'ace:error';
const ACE_CTX_PREFIX     = 'ace:ctx';

async function redisGetJson<T>(redis: Redis, key: string): Promise<T | null> {
  try {
    const raw = await redis.get(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Look up a feature card by exact feature key.
 * Returns the hot Redis card if available, else null.
 */
export async function getFeatureCard(featureKey: string): Promise<FeatureCard | null> {
  const redis = getRedis();
  return redisGetJson<FeatureCard>(redis, `${ACE_FEATURE_PREFIX}:${featureKey}`);
}

/**
 * Look up the synthesized context packet for a feature key.
 * This is the LLM-generated summary of the feature group.
 */
export async function getCtxPacket(featureKey: string): Promise<CtxPacket | null> {
  const redis = getRedis();
  return redisGetJson<CtxPacket>(redis, `${ACE_CTX_PREFIX}:${featureKey}`);
}

/**
 * Look up a specific TypeScript/Svelte error code card.
 * e.g. getErrorCard('TS2345') or getErrorCard('TS4099')
 */
export async function getErrorCard(errorCode: string): Promise<ErrorCard | null> {
  const redis = getRedis();
  return redisGetJson<ErrorCard>(redis, `${ACE_ERROR_PREFIX}:${errorCode}`);
}

/**
 * Full lookup for a feature key — tries Redis hot cache first,
 * returns a unified result with source provenance.
 */
export async function lookupFeature(featureKey: string): Promise<FeatureMatrixResult> {
  const redis = getRedis();

  const [card, ctx] = await Promise.all([
    redisGetJson<FeatureCard>(redis, `${ACE_FEATURE_PREFIX}:${featureKey}`),
    redisGetJson<CtxPacket>(redis,   `${ACE_CTX_PREFIX}:${featureKey}`),
  ]);

  if (card || ctx) {
    return { feature_key: featureKey, card, ctx, error_card: null, source: 'redis_hot' };
  }

  return { feature_key: featureKey, card: null, ctx: null, error_card: null, source: 'miss' };
}

/**
 * Search for feature cards by tag.
 * Scans Redis keys matching ace:feature:* and filters by tag.
 * Use sparingly — this is O(n) over the feature key set.
 */
export async function searchFeaturesByTag(tag: string, limit = 20): Promise<FeatureCard[]> {
  const redis  = getRedis();
  const cursor = '0';
  const pattern = `${ACE_FEATURE_PREFIX}:*`;

  const results: FeatureCard[] = [];
  let nextCursor = cursor;

  do {
    const [next, keys] = await redis.scan(nextCursor, 'MATCH', pattern, 'COUNT', '100');
    nextCursor = next;

    const values = keys.length > 0 ? await redis.mget(...keys) : [];
    for (const v of values) {
      if (!v) continue;
      try {
        const card = JSON.parse(v) as FeatureCard;
        if (card.tags?.includes(tag)) {
          results.push(card);
          if (results.length >= limit) return results;
        }
      } catch { /* skip malformed */ }
    }
  } while (nextCursor !== '0' && results.length < limit);

  return results;
}

/**
 * Get all feature keys currently cached in Redis.
 */
export async function listFeatureKeys(): Promise<string[]> {
  const redis = getRedis();
  const keys: string[] = [];
  let cursor = '0';

  do {
    const [next, found] = await redis.scan(cursor, 'MATCH', `${ACE_FEATURE_PREFIX}:*`, 'COUNT', '200');
    cursor = next;
    keys.push(...found.map(k => k.replace(`${ACE_FEATURE_PREFIX}:`, '')));
  } while (cursor !== '0');

  return keys;
}

/**
 * Build a compact ACE context hint block from the feature matrix,
 * suitable for injection into the ACE context prompt.
 */
export async function buildFeatureMatrixContextHint(featureKeys: string[]): Promise<string> {
  const results = await Promise.all(featureKeys.map(lookupFeature));
  const lines: string[] = [];

  for (const r of results) {
    if (r.source === 'miss') continue;
    if (r.ctx?.synthesis) {
      lines.push(`[Feature: ${r.feature_key}] ${r.ctx.synthesis.slice(0, 300)}`);
    } else if (r.card?.top_snippets?.[0]) {
      lines.push(`[Feature: ${r.feature_key}] ${r.card.top_snippets[0].slice(0, 200)}`);
    }
  }

  return lines.join('\n\n');
}