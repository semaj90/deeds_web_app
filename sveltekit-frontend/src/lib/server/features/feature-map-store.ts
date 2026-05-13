import { db } from '$lib/server/db/client.js';
import { sql } from 'drizzle-orm';
import { getRedis } from '$lib/server/redis.js';
import type { FeatureCompileResult, FeatureMap, GrpoMemoryStick } from './feature-map.types.js';

export type FeatureStoreWrites = {
  postgresJsonb: {
    row: {
      id: string;
      kind: string;
      label: string;
      path?: string | null;
      summary?: string | null;
      edges: unknown[];
      scores: Record<string, unknown>;
      flags: number;
      vectors: Record<string, unknown>;
      metadata: FeatureMap;
      updatedAt: Date;
    };
  };
  redisHotKeys: Array<{
    key: string;
    value: string;
    ttlSeconds: number;
  }>;
  qdrantFeatureSummaryPoint: {
    collection: string;
    id: string;
    vector: number[];
    payload: Record<string, unknown>;
  };
  neo4jJsonl: string[];
};

export function prepareStoreWrites(result: FeatureCompileResult): FeatureStoreWrites {
  const { featureMap } = result;
  const ttlSeconds = 7 * 24 * 60 * 60;
  const redisHotKeys = [
    { key: `feature:summary:${featureMap.featureId}`, value: featureMap.summaries.short, ttlSeconds },
    { key: `feature:glyph:${featureMap.featureId}`, value: JSON.stringify(featureMap.glyph), ttlSeconds },
    { key: `feature:map:${featureMap.featureId}`, value: JSON.stringify(featureMap), ttlSeconds },
  ];

  if (result.grpoMemoryStick) {
    redisHotKeys.push({
      key: `grpo:memory:${result.grpoMemoryStick.queryHash}`,
      value: JSON.stringify(result.grpoMemoryStick),
      ttlSeconds
    });
  }

  return {
    postgresJsonb: {
      row: {
        id: featureMap.featureId,
        kind: 'feature',
        label: featureMap.title,
        path: featureMap.paths.featureNote ?? null,
        summary: featureMap.summaries.short,
        edges: featureMap.edges,
        scores: featureMap.scores ?? {},
        flags: featureMap.glyph.mask,
        vectors: featureMap.vectors ?? {},
        metadata: featureMap,
        updatedAt: new Date()
      }
    },
    redisHotKeys,
    qdrantFeatureSummaryPoint: {
      collection: 'feature_maps',
      id: featureMap.featureId,
      vector: featureMap.vectors?.encoded64 ?? Array.from({ length: 64 }, () => 0),
      payload: {
        featureId: featureMap.featureId,
        title: featureMap.title,
        status: featureMap.status,
        glyphMask: featureMap.glyph.mask,
        graphTriples: featureMap.graphTriples.length,
        cacheKeys: featureMap.cache
      }
    },
    neo4jJsonl: featureMap.graphTriples.map(([source, relation, target]) => JSON.stringify({
      source,
      relation,
      target,
      featureId: featureMap.featureId
    }))
  };
}

/**
 * Persists FeatureMap and GRPO memory sticks to Postgres and Redis.
 */
export async function persistFeatureCompileResult(result: FeatureCompileResult): Promise<void> {
  const { featureMap, grpoMemoryStick } = result;

  // 1. Postgres Persistence (Durable JSONB)
  await db.execute(sql`
    INSERT INTO enhanced_graph_mappings (id, kind, label, metadata, updated_at)
    VALUES (${featureMap.featureId}, 'feature', ${featureMap.title}, ${JSON.stringify(featureMap)}::jsonb, NOW())
    ON CONFLICT (id) DO UPDATE SET
      label = EXCLUDED.label,
      metadata = EXCLUDED.metadata,
      updated_at = NOW()
  `);

  if (grpoMemoryStick) {
    await db.execute(sql`
      INSERT INTO enhanced_graph_mappings (id, kind, label, metadata, updated_at)
      VALUES (${grpoMemoryStick.id}, 'grpo_memory', ${grpoMemoryStick.featureId ?? 'global'}, ${JSON.stringify(grpoMemoryStick)}::jsonb, NOW())
      ON CONFLICT (id) DO UPDATE SET
        metadata = EXCLUDED.metadata,
        updated_at = NOW()
    `);
  }

  // 2. Redis Hot Cache
  try {
    const redis = getRedis();
    const pipe = redis.pipeline();
    const TTL = 7 * 24 * 60 * 60; // 7 days

    pipe.set(`feature:summary:${featureMap.featureId}`, featureMap.summaries.short, 'EX', TTL);
    pipe.set(`feature:glyph:${featureMap.featureId}`, JSON.stringify(featureMap.glyph), 'EX', TTL);
    pipe.set(`feature:map:${featureMap.featureId}`, JSON.stringify(featureMap), 'EX', TTL);
    
    if (grpoMemoryStick) {
      pipe.set(`grpo:memory:${grpoMemoryStick.queryHash}`, JSON.stringify(grpoMemoryStick), 'EX', TTL);
    }

    await pipe.exec();
  } catch (err) {
    console.warn('[feature-map-store] Redis persistence failed:', (err as Error).message);
  }
}
