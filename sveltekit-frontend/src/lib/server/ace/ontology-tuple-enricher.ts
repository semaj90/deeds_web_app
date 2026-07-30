import crypto from 'node:crypto';
/**
 * Ontology Tuple Enricher for ACE Context Assembly
 *
 * Reads ontology-linked tuples from Redis cache (populated by taxonomy-topology-packet.ts)
 * and enriches codebase context with semantic tags, taxonomy links, and evidence state.
 *
 * Cache keys:
 *   - ace:ontology:tuple:{tupleId} → OntologyLinkedTupleCacheRecord (JSON)
 *   - ace:ontology:tokenmap:{featureId}:{sourceRefHash}:{packetId} → token map (JSON)
 *   - ace:ontology:blocked_content_hashes:{workspaceRevision} → blocked hashes (JSON)
 */

import { getRedis } from '$lib/server/redis.js';
import { ontologyKey } from '$lib/server/cache-keys.js';
import type { OntologyLinkedTupleCacheRecord } from '$lib/server/atlas/ontology-linked-tuple-cache.js';

/**
 * Fetch ontology tuples for a given source_ref + feature_id combination
 * from Redis cache (non-blocking, returns empty array on cache miss).
 */
export async function fetchOntologyTuples(
  sourceRef: string,
  featureId: string,
  options?: { redis?: ReturnType<typeof getRedis>; allowedTrustTiers?: string[]; packetId?: string }
): Promise<OntologyLinkedTupleCacheRecord[]> {
  const redis = options?.redis || getRedis();
  const allowedTiers = options?.allowedTrustTiers || ['canonical', 'derived'];
  const sourceRefHash = crypto.createHash('sha256').update(String(sourceRef ?? '')).digest('hex').slice(0, 16);

  try {
    // Try tokenmap index first (fast path if available)
    const tokenMapKeys = [
      options?.packetId ? ontologyKey.tokenMap(featureId, sourceRefHash, options.packetId) : null,
      ontologyKey.tokenMap(featureId, sourceRefHash, 'all'),
    ].filter((key): key is string => Boolean(key));

    let tokenMapCached: string | null = null;
    for (const tokenMapKey of tokenMapKeys) {
      tokenMapCached = await redis.get(tokenMapKey);
      if (tokenMapCached) break;
    }

    if (tokenMapCached) {
      try {
        const tokenMap = JSON.parse(tokenMapCached) as { tupleKeys?: string[] };
        const tupleKeys = tokenMap.tupleKeys || [];

        if (tupleKeys.length === 0) return [];

        // Fetch all tuples in parallel
        const tuples = await Promise.all(
          tupleKeys.map(async (key) => {
            const cached = await redis.get(key);
            if (!cached) return null;
            try {
              return JSON.parse(cached) as OntologyLinkedTupleCacheRecord;
            } catch {
              return null;
            }
          })
        );

        // Filter out nulls and apply trust tier filter
        return tuples
          .filter((t): t is OntologyLinkedTupleCacheRecord => t !== null && allowedTiers.includes(t.trustTier));
      } catch (err) {
        console.warn('[ontology-tuple-enricher] Failed to parse tokenmap:', err);
        // Fall through to full scan
      }
    }

    // Fallback: scan all tuples matching the feature (full scan fallback).
    // This is O(n) but necessary if tokenmap index is missing.
    const keys = await redis.keys('ace:ontology:tuple:*');
    const tuples: OntologyLinkedTupleCacheRecord[] = [];

    for (const key of keys) {
      const cached = await redis.get(key);
      if (!cached) continue;

      try {
        const tuple = JSON.parse(cached) as OntologyLinkedTupleCacheRecord;

        // Filter by featureId + trustTier
        if (tuple.featureId === featureId && allowedTiers.includes(tuple.trustTier)) {
          tuples.push(tuple);
        }
      } catch (err) {
        console.warn(`[ontology-tuple-enricher] Failed to parse tuple at ${key}:`, err);
      }
    }

    return tuples;
  } catch (err) {
    console.error('[ontology-tuple-enricher] Error fetching tuples:', err);
    return [];
  }
}

/**
 * Check if content is blocked by the ontology blocked-content-hashes list.
 * Used to prevent prompt-injection via contaminated tuple data.
 */
export async function isContentBlocked(
  content: string,
  workspaceRevision: string,
  options?: { redis?: ReturnType<typeof getRedis> }
): Promise<boolean> {
  const redis = options?.redis || getRedis();

  try {
    const key = ontologyKey.blockedContentHashes(workspaceRevision);
    const cached = await redis.get(key);
    if (!cached) return false;

    const data = JSON.parse(cached) as { blockedContentHashes?: string[] };
    if (!data.blockedContentHashes?.length) return false;

    // Hash incoming content (SHA-256) using already-imported crypto module
    const hash = crypto.createHash('sha256').update(content).digest('hex');
    return data.blockedContentHashes.includes(hash);
  } catch (err) {
    console.error('[ontology-tuple-enricher] Error checking blocked content:', err);
    return false;
  }
}

/**
 * Enrich a single codebase context item with ontology tuples
 * (currently a no-op placeholder until cache is populated).
 */
export async function enrichCodebaseContextItem(
  item: Record<string, unknown>,
  options?: { redis?: ReturnType<typeof getRedis>; packetId?: string }
): Promise<Record<string, unknown>> {
  const sourceRef = String(item.filePath || item.sourceRef || '');
  const featureId = String(item.featureId || '');

  if (!sourceRef || !featureId) return item;

  const tuples = await fetchOntologyTuples(sourceRef, featureId, options);
  if (tuples.length === 0) return item;

  return {
    ...item,
    ontologyTuples: tuples,
  };
}

/**
 * Batch enrich an array of codebase context items with ontology tuples.
 */
export async function enrichCodebaseContextBatch(
  items: Record<string, unknown>[],
  options?: { redis?: ReturnType<typeof getRedis>; parallelism?: number; packetId?: string }
): Promise<Record<string, unknown>[]> {
  const redis = options?.redis || getRedis();
  const parallelism = options?.parallelism || 4;

  const enriched: Record<string, unknown>[] = [];
  for (let i = 0; i < items.length; i += parallelism) {
    const batch = items.slice(i, i + parallelism);
    const results = await Promise.all(
      batch.map((item) => enrichCodebaseContextItem(item, { redis, packetId: options?.packetId }))
    );
    enriched.push(...results);
  }

  return enriched;
}
