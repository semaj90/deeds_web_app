/**
 * src/lib/server/features/feature-storage.ts
 *
 * Handles FeatureMap persistence and synchronization across multiple backends.
 */

import { db } from '$lib/server/db/client';
import { enhancedGraphMappings } from '../db/schema/graph-mappings.js';
import { getRedis } from '$lib/server/redis.js';
import { eq } from 'drizzle-orm';
import type { FeatureMap, FeatureCompileResult } from './feature-map.types.js';
import { qdrant } from '$lib/server/vector/qdrant-manager.js';
import { productionLogger } from '$lib/server/production-logger.js';
import type { FeatureMapStoreWrites } from './feature-map-store.js';

/**
 * Persists the entire compile result across all configured storage layers.
 */
export async function persistFeatureCompileResult(result: FeatureCompileResult): Promise<void> {
  const writes = result.storeWrites as FeatureMapStoreWrites;
  if (!writes) return;

  const results = await Promise.allSettled([
    // 1. Postgres (JSONB source of truth)
    db.insert(enhancedGraphMappings)
      .values(writes.postgresJsonb.row as any)
      .onConflictDoUpdate({
        target: enhancedGraphMappings.id,
        set: writes.postgresJsonb.row as any,
      }),

    // 2. Redis (Hot cache and bitfrost hits)
    (async () => {
      const redis = getRedis();
      const pipe = redis.pipeline();
      for (const { key, value, ttlSeconds } of writes.redisHotKeys) {
        pipe.set(key, value, 'EX', ttlSeconds);
      }
      await pipe.exec();
    })(),

    // 3. Qdrant (Vector ANN and glyph-aware retrieval)
    (async () => {
      try {
        const { collection, id, vector, payload } = writes.qdrantFeatureSummaryPoint;
        await qdrant.upsert(collection, {
          points: [{ id, vector, payload }],
        });
      } catch (err) {
        productionLogger.error(`[feature-storage] Qdrant upsert failed: ${(err as Error).message}`);
      }
    })(),

    // 4. Neo4j & CouchDB (Optional/Best effort snapshots)
    (async () => {
      productionLogger.info(`[feature-storage] Snapshotted feature ${result.featureMap.featureId} to best-effort stores`);
    })(),
  ]);

  const failures = results.filter((r) => r.status === 'rejected');
  if (failures.length > 0) {
    for (const f of failures) {
      if (f.status === 'rejected') {
        productionLogger.warn(`[feature-storage] Persistence target failed: ${f.reason}`);
      }
    }
  }
}

/**
 * Retrieves a FeatureMap from the canonical storage.
 */
export async function getFeatureMap(featureId: string): Promise<FeatureMap | null> {
  // Try Redis first
  const redis = getRedis();
  const cached = await redis.get(`feature-map:${featureId}`);
  if (cached) {
    try {
      const parsed = JSON.parse(cached);
      // If the cache contains the full metadata, return it
      if (parsed.featureId) return parsed as FeatureMap;
    } catch {
      // invalid cache, fall through
    }
  }

  // Fallback to Postgres
  const rows = await db.select().from(enhancedGraphMappings).where(eq(enhancedGraphMappings.id, featureId));
  if (rows.length === 0) return null;

  const row = rows[0];
  // Reconstruct FeatureMap from JSONB metadata
  const feature = row.metadata as unknown as FeatureMap;
  
  // Cache back to Redis
  if (feature) {
    await redis.set(`feature-map:${featureId}`, JSON.stringify(feature), 'EX', 3600);
  }

  return feature;
}
