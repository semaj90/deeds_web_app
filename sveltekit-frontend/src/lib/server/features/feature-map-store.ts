import { appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { db } from '../db/client.js';
import { featureMaps, grpoMemorySticks } from '../db/schema/features.js';
import { getRedis } from '../redis.js';
import { QdrantManager } from '../vector/qdrant-manager.js';
import { aceContextKey } from '../cache-keys.js';
import { productionLogger } from '../production-logger.js';
import {
  buildAceContextRegistryPacket,
  writeAceContextRegistry,
} from '../ace/context-cache-registry.js';
import type { FeatureCompileResult, FeatureMap, GrpoMemoryStick } from './feature-map.types.js';

const FEATURE_TTL_SECONDS = 48 * 60 * 60;
const GRPO_TTL_SECONDS = 24 * 60 * 60;

export type FeatureMapStoreWrites = {
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
    featureMapRow: typeof featureMaps.$inferInsert;
    grpoMemoryStickRow?: typeof grpoMemorySticks.$inferInsert;
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

export async function buildFeatureSummaryEmbedding(featureMap: FeatureMap): Promise<number[]> {
  const sourceText = [featureMap.title, featureMap.summaries.short]
    .filter(Boolean)
    .join('\n')
    .trim();

  try {
    const ollamaUrl = process.env.OLLAMA_URL ?? 'http://127.0.0.1:11434';
    const model = process.env.OLLAMA_EMBED_MODEL ?? 'embeddinggemma:latest';
    const res = await fetch(`${ollamaUrl.replace(/\/$/, '')}/api/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        input: sourceText.slice(0, 4000) || featureMap.title,
      }),
    });
    if (!res.ok) throw new Error(`Ollama embed HTTP ${res.status}`);
    const data = (await res.json()) as { embeddings?: number[][]; embedding?: number[] };
    const vector = Array.isArray(data.embeddings) ? data.embeddings[0] : data.embedding;
    if (!Array.isArray(vector) || vector.length === 0) throw new Error('Empty embedding response');
    return vector;
  } catch (error) {
    productionLogger.warn(
      `[feature-storage] Embedding fallback for ${featureMap.featureId}: ${(error as Error).message}`
    );
    return Array.from({ length: 768 }, () => 0);
  }
}

export function prepareStoreWrites(result: FeatureCompileResult): FeatureMapStoreWrites {
  const { featureMap, grpoMemoryStick } = result;
  const encoded64 = featureMap.vectors?.encoded64 ?? Array.from({ length: 64 }, () => 0);
  const featureMapRow: typeof featureMaps.$inferInsert = {
    id: featureMap.featureId,
    name: featureMap.title,
    description: featureMap.summaries.short,
    status: featureMap.status,
    paths: featureMap.paths,
    graphTriples: featureMap.graphTriples,
    flags: BigInt(featureMap.glyph.mask),
    glyph: JSON.stringify(featureMap.glyph),
    metadata: {
      summaries: featureMap.summaries,
      scores: featureMap.scores,
      cache: featureMap.cache,
      vectors: featureMap.vectors ?? {},
      edges: featureMap.edges,
    },
    updatedAt: new Date(),
  };

  const redisHotKeys = [
    {
      key: `feature:summary:${featureMap.featureId}`,
      value: featureMap.summaries.short,
      ttlSeconds: FEATURE_TTL_SECONDS,
    },
    {
      key: `feature:glyph:${featureMap.featureId}`,
      value: JSON.stringify(featureMap.glyph),
      ttlSeconds: FEATURE_TTL_SECONDS,
    },
    {
      key: `feature:map:${featureMap.featureId}`,
      value: JSON.stringify(featureMap),
      ttlSeconds: FEATURE_TTL_SECONDS,
    },
  ];

  let grpoMemoryStickRow: typeof grpoMemorySticks.$inferInsert | undefined;
  if (grpoMemoryStick) {
    const acePacket = buildAceContextRegistryPacket(featureMap, grpoMemoryStick);
    grpoMemoryStickRow = {
      id: grpoMemoryStick.id,
      featureId: grpoMemoryStick.featureId,
      queryHash: grpoMemoryStick.queryHash,
      contextPacketHash: grpoMemoryStick.contextPacketHash,
      selectedIds: grpoMemoryStick.selectedSourceIds,
      rejectedIds: grpoMemoryStick.rejectedSourceIds,
      rewardSignals: grpoMemoryStick.rewardSignals,
      scores: grpoMemoryStick.scores,
      cacheKeys: grpoMemoryStick.cacheKeys,
      createdAt: new Date(),
    };
    redisHotKeys.push(
      {
        key: `grpo:memory:${grpoMemoryStick.queryHash}`,
        value: JSON.stringify(grpoMemoryStick),
        ttlSeconds: GRPO_TTL_SECONDS,
      },
      {
        key: aceContextKey.packet(grpoMemoryStick.contextPacketHash),
        value: JSON.stringify(acePacket),
        ttlSeconds: FEATURE_TTL_SECONDS,
      }
    );
    void writeAceContextRegistry(acePacket).catch(() => null);
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
        updatedAt: new Date(),
      },
      featureMapRow,
      grpoMemoryStickRow,
    },
    redisHotKeys,
    qdrantFeatureSummaryPoint: {
      collection: 'feature_maps',
      id: featureMap.featureId,
      vector: encoded64,
      payload: {
        kind: 'feature',
        featureId: featureMap.featureId,
        title: featureMap.title,
        status: featureMap.status,
        glyphMask: featureMap.glyph.mask,
        summary: featureMap.summaries.short,
        paths: featureMap.paths,
        cacheKeys: featureMap.cache,
      },
    },
    neo4jJsonl: buildNeo4jJsonl(featureMap),
  };
}

export async function persistFeatureCompileResult(result: FeatureCompileResult) {
  const writes = prepareStoreWrites(result);
  await storeFeatureMap(result.featureMap, writes);
  if (result.grpoMemoryStick) {
    await storeGrpoMemoryStick(result.grpoMemoryStick, writes);
  }
  return { success: true, featureId: result.featureMap.featureId };
}

export async function storeFeatureMap(map: FeatureMap, prepared?: FeatureMapStoreWrites) {
  const writes = prepared ?? prepareStoreWrites({ featureMap: map, warnings: [] });
  const redis = getRedis();

  await db
    .insert(featureMaps)
    .values(writes.postgresJsonb.featureMapRow)
    .onConflictDoUpdate({
      target: [featureMaps.id],
      set: {
        name: writes.postgresJsonb.featureMapRow.name,
        description: writes.postgresJsonb.featureMapRow.description,
        status: writes.postgresJsonb.featureMapRow.status,
        paths: writes.postgresJsonb.featureMapRow.paths,
        graphTriples: writes.postgresJsonb.featureMapRow.graphTriples,
        flags: writes.postgresJsonb.featureMapRow.flags,
        glyph: writes.postgresJsonb.featureMapRow.glyph,
        metadata: writes.postgresJsonb.featureMapRow.metadata,
        updatedAt: new Date(),
      },
    });

  const pipe = redis.pipeline();
  for (const entry of writes.redisHotKeys.filter(
    (item) => item.key.startsWith('feature:') || item.key.startsWith('ace:')
  )) {
    pipe.set(entry.key, entry.value, 'EX', entry.ttlSeconds);
  }
  await pipe.exec();

  try {
    const qdrant = new QdrantManager();
    const summaryEmbedding = await buildFeatureSummaryEmbedding(map);
    await qdrant.client.upsert(writes.qdrantFeatureSummaryPoint.collection, {
      points: [
        {
          id: writes.qdrantFeatureSummaryPoint.id,
          vector: { summary: summaryEmbedding },
          payload: {
            ...writes.qdrantFeatureSummaryPoint.payload,
            encoded64: writes.qdrantFeatureSummaryPoint.vector,
          },
        },
      ],
    });
  } catch (err) {
    console.warn(
      `[feature-map-store] Qdrant upsert failed for ${map.featureId}:`,
      (err as Error).message
    );
  }

  appendNeo4jJsonl(writes.neo4jJsonl);
  return { success: true, featureId: map.featureId };
}

export async function storeGrpoMemoryStick(stick: GrpoMemoryStick, prepared?: FeatureMapStoreWrites) {
  const writes = prepared;
  const row = writes?.postgresJsonb.grpoMemoryStickRow ?? {
    id: stick.id,
    featureId: stick.featureId,
    queryHash: stick.queryHash,
    contextPacketHash: stick.contextPacketHash,
    selectedIds: stick.selectedSourceIds,
    rejectedIds: stick.rejectedSourceIds,
    rewardSignals: stick.rewardSignals,
    scores: stick.scores,
    cacheKeys: stick.cacheKeys,
    createdAt: new Date()
  };

  await db.insert(grpoMemorySticks).values(row).onConflictDoUpdate({
    target: [grpoMemorySticks.id],
    set: {
      featureId: row.featureId,
      queryHash: row.queryHash,
      contextPacketHash: row.contextPacketHash,
      selectedIds: row.selectedIds,
      rejectedIds: row.rejectedIds,
      rewardSignals: row.rewardSignals,
      scores: row.scores,
      cacheKeys: row.cacheKeys
    }
  });

  const redis = getRedis();
  await redis.set(`grpo:memory:${stick.queryHash}`, JSON.stringify(stick), 'EX', GRPO_TTL_SECONDS);
  await redis.set(
    aceContextKey.packet(stick.contextPacketHash),
    JSON.stringify({ featureId: stick.featureId, cacheKeys: stick.cacheKeys }),
    'EX',
    FEATURE_TTL_SECONDS
  );

  return { success: true, stickId: stick.id };
}

function buildNeo4jJsonl(featureMap: FeatureMap): string[] {
  // Emit the feature graph as JSONL edges for downstream graph ingestion.
  const rows = featureMap.graphTriples.map(([source, relation, target]) => ({
    source,
    relation,
    target,
    featureId: featureMap.featureId
  }));

  for (const path of featureMap.paths.services) rows.push({ source: featureMap.featureId, relation: 'Feature_TO_File', target: path, featureId: featureMap.featureId });
  for (const path of featureMap.paths.apiRoutes) rows.push({ source: featureMap.featureId, relation: 'Feature_TO_Route', target: path, featureId: featureMap.featureId });
  for (const path of featureMap.paths.tools) rows.push({ source: featureMap.featureId, relation: 'Feature_TO_Tool', target: path, featureId: featureMap.featureId });
  for (const path of featureMap.paths.svgDiagrams) rows.push({ source: featureMap.featureId, relation: 'Feature_TO_SVG', target: path, featureId: featureMap.featureId });
  for (const path of featureMap.paths.protos) rows.push({ source: featureMap.featureId, relation: 'Feature_TO_Proto', target: path, featureId: featureMap.featureId });
  for (const key of featureMap.cache.redisKeys) rows.push({ source: featureMap.featureId, relation: 'Feature_TO_CacheKey', target: key, featureId: featureMap.featureId });

  return rows.map((row) => JSON.stringify(row));
}

function appendNeo4jJsonl(lines: string[]) {
  if (lines.length === 0) return;
  const tripleLogPath = 'logs/graph/feature-triples.jsonl';
  if (!existsSync(dirname(tripleLogPath))) {
    mkdirSync(dirname(tripleLogPath), { recursive: true });
  }
  appendFileSync(tripleLogPath, `${lines.join('\n')}\n`);
}
