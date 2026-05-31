/**
 * Scenario cache: Redis L1 with optional Qdrant L2 persistence.
 *
 * - Primary use: fast lookup of assembled ACE/context packs by queryHash+pipelineKey
 * - L1: Redis JSON with TTL (hot cache)
 * - L2: Qdrant point upsert (optional, best-effort) for longer-term dedupe across restarts
 */
import { getJson, setJsonWithTtl } from '$lib/server/redis.js';
import { ENV } from '$lib/server/env.server.js';

type ScenarioCacheValue = {
  queryHash: string;
  pipelineKey: string;
  contextChunks?: string[];
  cachedResult?: Record<string, unknown>;
  qdrantPointIds?: string[];
  expiresAt?: string | null;
};

export function makeScenarioKey(queryHash: string, pipelineKey: string) {
  return `ace:ctx:${queryHash}:${pipelineKey}`;
}

/**
 * Read from Redis hot cache. Returns null on miss or error.
 */
export async function getScenarioCache(
  queryHash: string,
  pipelineKey: string
): Promise<ScenarioCacheValue | null> {
  try {
    const key = makeScenarioKey(queryHash, pipelineKey);
    const val = await getJson<ScenarioCacheValue>(key);
    return val;
  } catch (err) {
    console.warn('[scenario-cache] get failed:', err);
    return null;
  }
}

/**
 * Set value into Redis L1 and optionally upsert to Qdrant L2 (best-effort).
 * ttlSeconds defaults to 3600 (1h)
 */
export async function setScenarioCache(
  queryHash: string,
  pipelineKey: string,
  value: Omit<ScenarioCacheValue, 'queryHash' | 'pipelineKey'>,
  ttlSeconds = 3600
): Promise<void> {
  try {
    const key = makeScenarioKey(queryHash, pipelineKey);
    const payload: ScenarioCacheValue = {
      queryHash,
      pipelineKey,
      contextChunks: value.contextChunks ?? [],
      cachedResult: value.cachedResult ?? {},
      qdrantPointIds: value.qdrantPointIds ?? [],
      expiresAt: value.expiresAt ?? null,
    };
    await setJsonWithTtl(key, payload, ttlSeconds);
  } catch (err) {
    console.warn('[scenario-cache] set failed (redis):', err);
  }

  // Best-effort Qdrant L2 persistence if configured
  if (ENV.QDRANT_URL) {
    try {
      const { QdrantManager } = await import('$lib/server/vector/qdrant-manager.js');
      const mgr = new QdrantManager(ENV.QDRANT_URL);
      const collection = 'scenario_cache';
      // Upsert a single point with id = queryHash (safe short id)
      const pointId = queryHash.slice(0, 32); // trimmed deterministic string id
      const upsertBody: any = {
        points: [
          {
            id: pointId,
            payload: {
              queryHash,
              pipelineKey,
              cachedResult: value.cachedResult ?? {},
              contextChunks: value.contextChunks ?? [],
              expiresAt: value.expiresAt ?? null,
            },
          },
        ],
      };
      try {
        // try client.upsert (wrapped in manager)
        await mgr.client.upsert(collection, upsertBody as any);
      } catch (e) {
        // If upsert fails, just log; Qdrant L2 is optional
        console.warn('[scenario-cache] qdrant upsert failed (non-fatal):', e?.message ?? e);
      }
    } catch (e) {
      // Import failure / Qdrant unavailable — do not block
      // keep silent-ish but informative on first occurrences
      console.info('[scenario-cache] Qdrant unavailable, skipping L2 persistence');
    }
  }
}

/**
 * Try to read a longer-term record from Qdrant collection 'scenario_cache'.
 * Best-effort; returns null if Qdrant not available or no payload.
 */
export async function getScenarioCacheFromQdrant(
  queryHash: string
): Promise<ScenarioCacheValue | null> {
  if (!ENV.QDRANT_URL) return null;
  try {
    const { QdrantManager } = await import('$lib/server/vector/qdrant-manager.js');
    const mgr = new QdrantManager(ENV.QDRANT_URL);
    const collection = 'scenario_cache';
    const pointId = queryHash.slice(0, 32);
    try {
      // Use getPoint (client has getPoint in js client)
      const res = await (mgr.client as any).getPoint(collection, pointId);
      const payload = res?.result?.payload ?? res?.payload ?? null;
      if (!payload) return null;
      return {
        queryHash: payload.queryHash ?? queryHash,
        pipelineKey: payload.pipelineKey ?? '',
        contextChunks: payload.contextChunks ?? [],
        cachedResult: payload.cachedResult ?? {},
        qdrantPointIds: payload.qdrantPointIds ?? [],
        expiresAt: payload.expiresAt ?? null,
      } as ScenarioCacheValue;
    } catch (err) {
      return null;
    }
  } catch (err) {
    return null;
  }
}

export default {
  getScenarioCache,
  setScenarioCache,
  getScenarioCacheFromQdrant,
};
import { db } from '$lib/server/db/client';
import { scenarioCache } from '$lib/server/db/schema-postgres';
import { eq } from 'drizzle-orm';
import { getRedis } from '$lib/server/redis.js';
import { qdrant, deterministicPointId } from '$lib/server/vector/qdrant-manager.js';
import { ollamaFetch } from '$lib/server/ollama.js';
import crypto from 'crypto';

const OLLAMA_URL = ENV.OLLAMA_BASE_URL;
const EMBEDDING_MODEL = ENV.OLLAMA_EMBED_MODEL;
const SCENARIO_HIT_THRESHOLD = 0.85;
const REDIS_TTL = 24 * 60 * 60; // 24 hours

export interface ScenarioCacheResult {
  hit: boolean;
  response?: string;
  similarity?: number;
  source?: 'redis' | 'qdrant_postgres';
}

function getQueryHash(query: string): string {
  return crypto.createHash('sha256').update(query.trim().toLowerCase()).digest('hex');
}

async function embedQuery(query: string): Promise<number[] | null> {
  try {
    const res = await ollamaFetch(`${OLLAMA_URL}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: EMBEDDING_MODEL, prompt: query }),
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) return null;
    const data = await res.json();
    return Array.isArray(data.embedding) ? data.embedding : null;
  } catch (error) {
    console.warn('[Scenario Cache] Embedding generation failed:', error);
    return null;
  }
}

/**
 * Tiered Scenario Cache Lookup:
 * Tier 1: Redis exact-match query hash
 * Tier 2: Qdrant semantic search + Postgres payload hydration
 */
export async function lookupScenario(query: string): Promise<ScenarioCacheResult> {
  const hash = getQueryHash(query);
  const redisKey = `scenario:exact:${hash}`;

  // Tier 1: Redis Exact Match
  try {
    const redis = getRedis();
    const cached = await redis.get(redisKey);
    if (cached) {
      console.log(`[Scenario Cache] Tier 1 HIT (Redis exact match) hash=${hash.slice(0, 8)}`);
      return {
        hit: true,
        response: cached,
        source: 'redis',
      };
    }
  } catch (err) {
    console.warn('[Scenario Cache] Redis lookup failed:', err);
  }

  // Tier 2: Qdrant ANN + Postgres hydration
  try {
    const embedding = await embedQuery(query);
    if (!embedding) {
      return { hit: false };
    }

    const qdrantClient = qdrant.client;
    const searchRes = await qdrantClient.search('scenario_cache', {
      vector: embedding,
      limit: 1,
      score_threshold: SCENARIO_HIT_THRESHOLD,
      with_payload: true,
    });

    if (searchRes.length === 0) {
      return { hit: false };
    }

    const topHit = searchRes[0];
    const scenarioId = topHit.payload?.scenario_id as string;
    if (!scenarioId) {
      return { hit: false };
    }

    // Hydrate full response from Postgres
    const rows = await db
      .select()
      .from(scenarioCache)
      .where(eq(scenarioCache.id, scenarioId))
      .limit(1);

    if (rows.length === 0) {
      return { hit: false };
    }

    const row = rows[0];
    console.log(
      `[Scenario Cache] Tier 2 HIT (Qdrant + Postgres) similarity=${topHit.score?.toFixed(3)} id=${scenarioId}`
    );

    // Warm up exact-match cache in Redis for next queries
    try {
      const redis = getRedis();
      const responseText =
        (row.cachedResult && (row.cachedResult as any).response) ||
        JSON.stringify(row.cachedResult || {});
      await redis.set(redisKey, responseText, 'EX', REDIS_TTL);
      return {
        hit: true,
        response: responseText,
        similarity: topHit.score,
        source: 'qdrant_postgres',
      };
    } catch (err) {
      console.warn('[Scenario Cache] Redis warming failed:', err);
      const responseText =
        (row.cachedResult && (row.cachedResult as any).response) ||
        JSON.stringify(row.cachedResult || {});
      return {
        hit: true,
        response: responseText,
        similarity: topHit.score,
        source: 'qdrant_postgres',
      };
    }
  } catch (err) {
    console.warn('[Scenario Cache] Tier 2 lookup failed:', err);
    return { hit: false };
  }
}

/**
 * Store a new scenario cache entry in both Postgres (relational & metadata)
 * and Qdrant (embedding index for similarity match).
 */
export async function storeScenario(
  query: string,
  response: string,
  metadata: Record<string, any> = {}
): Promise<void> {
  try {
    const hash = getQueryHash(query);
    const embedding = await embedQuery(query);
    if (!embedding) {
      throw new Error('Failed to generate embedding for scenario storing');
    }

    // Insert into Postgres (store the generated response inside `cachedResult` JSON)
    const [inserted] = await db
      .insert(scenarioCache)
      .values([
        {
          queryHash: hash,
          pipelineKey: 'default',
          cachedResult: { response, metadata },
          ttlSeconds: REDIS_TTL,
        },
      ])
      .onConflictDoUpdate({
        target: scenarioCache.queryHash,
        set: {
          cachedResult: { response, metadata },
          ttlSeconds: REDIS_TTL,
          updatedAt: new Date().toISOString(),
        },
      })
      .returning();

    // Upsert into Qdrant scenario_cache
    const qdrantClient = qdrant.client;
    const pointId = deterministicPointId(`${hash}:scenario_cache`);

    await qdrantClient.upsert('scenario_cache', {
      wait: true,
      points: [
        {
          id: pointId,
          vector: embedding,
          payload: {
            scenario_id: inserted.id,
            query_hash: hash,
            metadata,
          },
        },
      ],
    });

    // Also populate Redis exact-match cache immediately
    try {
      const redis = getRedis();
      await redis.set(`scenario:exact:${hash}`, response, 'EX', REDIS_TTL);
    } catch (err) {
      console.warn('[Scenario Cache] Redis pre-warming failed:', err);
    }

    console.log(`[Scenario Cache] Successfully stored scenario query_hash=${hash.slice(0, 8)}`);
  } catch (err) {
    console.error('[Scenario Cache] Failed to store scenario:', err);
    throw err;
  }
}

export async function getScenarioById(id: string) {
  const rows = await db.select().from(scenarioCache).where(eq(scenarioCache.id, id)).limit(1);
  return rows[0] || null;
}

export async function findScenarioBySourceRefAndHash(sourceRef: string, contentHash: string) {
  const compositeHash = crypto
    .createHash('sha256')
    .update(`${sourceRef}:${contentHash}`)
    .digest('hex');
  const rows = await db
    .select()
    .from(scenarioCache)
    .where(eq(scenarioCache.queryHash, compositeHash))
    .limit(1);
  return rows[0] || null;
}

interface UpsertScenarioInput {
  source_ref: string;
  content_hash: string;
  name?: string | null;
  description?: string | null;
  metadata?: Record<string, any> | null;
  embedding?: number[] | null;
}

export async function upsertScenario(data: UpsertScenarioInput) {
  const compositeHash = crypto
    .createHash('sha256')
    .update(`${data.source_ref}:${data.content_hash}`)
    .digest('hex');
  const queryText = data.name ?? data.source_ref;
  const responseText = data.description ?? '';
  const meta = {
    source_ref: data.source_ref,
    content_hash: data.content_hash,
    name: data.name,
    description: data.description,
    ...(data.metadata || {}),
  };

  const [inserted] = await db
    .insert(scenarioCache)
    .values([
      {
        queryHash: compositeHash,
        pipelineKey: 'default',
        cachedResult: { response: responseText, metadata: meta },
        ttlSeconds: REDIS_TTL,
      },
    ])
    .onConflictDoUpdate({
      target: scenarioCache.queryHash,
      set: {
        cachedResult: { response: responseText, metadata: meta },
        ttlSeconds: REDIS_TTL,
        updatedAt: new Date().toISOString(),
      },
    })
    .returning();

  if (data.embedding) {
    try {
      const qdrantClient = qdrant.client;
      const pointId = deterministicPointId(`${compositeHash}:scenario_cache`);
      await qdrantClient.upsert('scenario_cache', {
        wait: true,
        points: [
          {
            id: pointId,
            vector: data.embedding,
            payload: {
              scenario_id: inserted.id,
              query_hash: compositeHash,
              metadata: meta,
            },
          },
        ],
      });
    } catch (err) {
      console.warn('[Scenario Cache] Qdrant upsert failed in upsertScenario:', err);
    }
  }

  try {
    const redis = getRedis();
    await redis.set(`scenario:exact:${compositeHash}`, responseText, 'EX', REDIS_TTL);
  } catch (err) {
    console.warn('[Scenario Cache] Redis set failed in upsertScenario:', err);
  }

  return inserted;
}
