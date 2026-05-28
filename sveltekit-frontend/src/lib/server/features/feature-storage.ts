import { db } from '$lib/server/db/client';
import { enhancedGraphMappings } from '../db/schema/graph-mappings.js';
import { getRedis } from '$lib/server/redis.js';
import { eq } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import type { FeatureCompileResult, FeatureMap } from './feature-map.types.js';
import { qdrant } from '$lib/server/vector/qdrant-manager.js';
import { productionLogger } from '$lib/server/production-logger.js';
import { buildFeatureSummaryEmbedding, prepareStoreWrites } from './feature-map-store.js';
import { traceGraph } from '$lib/server/observability/langfuse.js';

let enhancedGraphMappingsReady: Promise<void> | null = null;

async function ensureEnhancedGraphMappingsTable(): Promise<void> {
  enhancedGraphMappingsReady ??= db
    .execute(
      sql`
    CREATE TABLE IF NOT EXISTS enhanced_graph_mappings (
      id text PRIMARY KEY,
      kind text NOT NULL,
      label text NOT NULL,
      path text,
      summary text,
      edges jsonb NOT NULL DEFAULT '[]'::jsonb,
      scores jsonb NOT NULL DEFAULT '{}'::jsonb,
      flags integer NOT NULL DEFAULT 0,
      vectors jsonb NOT NULL DEFAULT '{}'::jsonb,
      manifold4 real[],
      metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `
    )
    .then(() => undefined);

  await enhancedGraphMappingsReady;
}

export async function persistFeatureCompileResult(result: FeatureCompileResult): Promise<void> {
  const writes = prepareStoreWrites(result);

  await ensureEnhancedGraphMappingsTable();

  await traceGraph(
    'feature-map:persist',
    {
      featureId: result.featureMap.featureId,
      title: result.featureMap.title,
      graphTripleCount: result.featureMap.graphTriples.length,
      warningCount: result.warnings.length,
    },
    async () => {
      const settled = await Promise.allSettled([
        db
          .insert(enhancedGraphMappings)
          .values(writes.postgresJsonb.row as any)
          .onConflictDoUpdate({
            target: enhancedGraphMappings.id,
            set: writes.postgresJsonb.row as any,
          }),
        (async () => {
          const redis = getRedis();
          const pipe = redis.pipeline();
          for (const { key, value, ttlSeconds } of writes.redisHotKeys) {
            pipe.set(key, value, 'EX', ttlSeconds);
          }
          await pipe.exec();
        })(),
        (async () => {
            try {
              const { collection, id, payload } = writes.qdrantFeatureSummaryPoint;
              const summaryEmbedding = await buildFeatureSummaryEmbedding(result.featureMap);
              await qdrant.upsert({
                collection,
                points: [
                  {
                    id,
                    vector: { summary: summaryEmbedding },
                    payload: {
                      ...payload,
                      encoded64: writes.qdrantFeatureSummaryPoint.vector,
                    },
                  },
                ],
              } as any);
            } catch (err) {
              productionLogger.error(
                `[feature-storage] Qdrant upsert failed: ${(err as Error).message}`
              );
            }
        })(),
      ]);

      for (const item of settled) {
        if (item.status === 'rejected') {
          productionLogger.warn(`[feature-storage] Persistence target failed: ${item.reason}`);
        }
      }
    }
  );
}

export async function getFeatureMap(featureId: string): Promise<FeatureMap | null> {
  const redis = getRedis();
  const cached = await redis.get(`feature:map:${featureId}`);
  if (cached) {
    try {
      const parsed = JSON.parse(cached) as FeatureMap;
      if (parsed.featureId) return parsed;
    } catch {
      // fall through
    }
  }

  const rows = await db.select().from(enhancedGraphMappings).where(eq(enhancedGraphMappings.id, featureId));
  if (rows.length === 0) return null;

  const row = rows[0];
  const feature = row.metadata as unknown as FeatureMap;
  if (feature) {
    await redis.set(`feature:map:${featureId}`, JSON.stringify(feature), 'EX', 3600);
  }

  return feature;
}
