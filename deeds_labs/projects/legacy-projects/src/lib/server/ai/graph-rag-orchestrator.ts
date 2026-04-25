/**
 * Graph-RAG Orchestrator
 *
 * - Uses a resilient qdrant client (dynamic SDK or HTTP fallback)
 * - Expands results using Neo4j (if NEO4J_URI env present) or Postgres edges fallback
 * - Re-ranks using similarity + graph weight + optional Redis boost
 *
 * Integration points expected:
 *  - src/lib/server/services/qdrant-client.ts  (exported default client)
 *  - src/lib/server/ai/embedder.ts             (exported embed(text): Promise<number[]>)
 *  - src/lib/server/graph/relations.ts         (optional, but orchestrator does internal fallback)
 *  - src/lib/server/db/client                   (exported db.execute() or similar)
 *  - src/lib/server/redis-client                (exported redis or getRedis())
 */

import type { Driver as Neo4jDriver, Session as Neo4jSession } from 'neo4j-driver';
import type { Pool } from 'pg';
import type { Redis } from 'ioredis';

import qdrantClientFactory from '$lib/server/services/qdrant-client'; // resilient client (see file below)
import { embed as embedder } from '$lib/server/ai/embedder'; // expected adapter; throws if missing
import { db as drizzleDb, pg as pgClient } from '$lib/server/db/client'; // best-effort; optional
import { redis as sharedRedis, ensureRedisReady } from '$lib/server/redis-client';

type QueryOptions = {
  text?: string;
  embedding?: number[];
  limit?: number;
  expandNeighbors?: number;
  filters?: Record<string, any>;
};

export type RagResult = {
  id: string;
  score: number;
  similarity: number;
  graphWeight?: number;
  content: string;
  metadata?: Record<string, any>;
};

const DEFAULT_LIMIT = 10;
const DEFAULT_EXPAND = 2;

const ALPHA = parseFloat(process.env.RAG_ALPHA || '0.7'); // similarity weight
const BETA = parseFloat(process.env.RAG_BETA || '0.2'); // graph weight
const GAMMA = parseFloat(process.env.RAG_GAMMA || '0.1'); // redis boost

// Qdrant collection name - adjust to your collection
const COLLECTION = process.env.QDRANT_COLLECTION || 'legal_documents';

let qdrant = qdrantClientFactory();

async function getRedisBoost(id: string): Promise<number> {
  try {
    await ensureRedisReady();
    if (!sharedRedis) return 0;
    const v = await sharedRedis.get(`rag:boost:${id}`);
    if (!v) return 0;
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  } catch (e) {
    return 0;
  }
}

async function fetchQdrantHits(embedding: number[], limit: number, filters?: Record<string, any>) {
  // qdrant.search(collection, { vector, limit, with_payload: true })
  try {
    const resp = await qdrant.search(COLLECTION, {
      vector: embedding,
      limit,
      with_payload: true,
      // pass filters if client supports it (SDK or HTTP client handles conversion)
      filter: filters
        ? {
            must: Object.entries(filters).map(([k, v]) => ({
              key: k,
              match: { value: v },
            })),
          }
        : undefined,
    });
    // Normalize expected response shape: { id, score, payload }
    return (resp || []).map((h: any) => ({
      id: String(h.id),
      similarity: typeof h.score === 'number' ? h.score : (h.distance ?? 0),
      content: (h.payload && (h.payload.text || h.payload.content || h.payload.title)) || '',
      metadata: h.payload || {},
    }));
  } catch (e) {
    throw new Error(`Qdrant search failed: ${String(e)}`);
  }
}

async function fetchGraphNeighbors(ids: string[], expand: number) {
  // Auto-detect Neo4j via NEO4J_URI, otherwise use Postgres edges table `edges`(source,target,weight)
  const neo4jUri = process.env.NEO4J_URI;
  if (neo4jUri) {
    try {
      const neo4j = await import('neo4j-driver');
      const user = process.env.NEO4J_USER || 'neo4j';
      const pass = process.env.NEO4J_PASSWORD || '';
      const driver: Neo4jDriver = neo4j.driver(neo4jUri, neo4j.auth.basic(user, pass));
      const session: Neo4jSession = driver.session();
      try {
        // Query neighbors for given ids
        const q = `
          MATCH (a)-[r]->(b)
          WHERE a.id IN $ids
          RETURN b.id AS id, b.text AS content, sum(r.weight) AS weight
          ORDER BY weight DESC
          LIMIT $limit
        `;
        const res = await session.run(q, { ids, limit: expand * ids.length });
        const rows = res.records.map((r) => ({
          id: r.get('id'),
          content: r.get('content'),
          weight: Number(r.get('weight') ?? 0),
        }));
        await session.close();
        await driver.close();
        return rows;
      } catch (err) {
        try {
          await session.close();
        } catch {}
        try {
          await driver.close();
        } catch {}
        throw err;
      }
    } catch (e) {
      // Fall through to Postgres fallback
    }
  }

  // Postgres fallback - expects an edges table (source text id, target id, weight float)
  try {
    // try to use a `pg` client or drizzle raw execution. We'll assume pgClient exposes `execute` or pool
    const pool: Pool | undefined =
      (pgClient as any)?._pool || (pgClient as any)?.pool || (pgClient as any);
    if (pool && typeof pool.query === 'function') {
      const placeholders = ids.map((_, i) => `$${i + 1}`).join(',');
      const q = `
        SELECT e.target AS id, d.content, SUM(e.weight) AS weight
        FROM edges e
        JOIN documents d ON d.id = e.target
        WHERE e.source IN (${placeholders})
        GROUP BY e.target, d.content
        ORDER BY weight DESC
        LIMIT $${ids.length + 1}
      `;
      const params = [...ids, expand * ids.length];
      const { rows } = await (pool as any).query(q, params);
      return rows.map((r: any) => ({
        id: String(r.id),
        content: r.content,
        weight: Number(r.weight),
      }));
    }
  } catch (e) {
    // ignore and return empty
  }

  return [];
}

function normalizeWeights(items: Array<{ id: string; weight?: number }>) {
  const weights = items.map((i) => (typeof i.weight === 'number' ? i.weight : 0));
  const max = weights.length ? Math.max(...weights) : 1;
  return items.map((i, idx) => ({
    id: i.id,
    norm: max > 0 ? weights[idx] / max : 0,
  }));
}

export async function initQdrantIndexes() {
  // Conservative, non-destructive index creation using qdrant client API
  try {
    const client = qdrant;
    const cols = await client.getCollections?.();
    // if SDK returns wrapper detect; else call http path in fallback client
    const has = Array.isArray(cols)
      ? cols.some((c: any) => c.name === COLLECTION)
      : !!cols?.collections?.find?.((c: any) => c.name === COLLECTION);

    if (!has) {
      // create minimal collection (vector size detection is caller responsibility)
      // We'll create a general collection config — adjust `vector_size` to your embedder length
      const vectorSize = Number(process.env.EMBED_DIM || '1536'); // conservative default
      await client.createCollection?.(COLLECTION, {
        vectors: { size: vectorSize, distance: 'Cosine' },
        // payload schema not enforced here - create payload index if client supports it
      });
    }

    // Create payload index for common fields if supported
    try {
      await client.createPayloadIndex?.(COLLECTION, 'type', 'keyword');
      await client.createPayloadIndex?.(COLLECTION, 'title', 'text');
      await client.createPayloadIndex?.(COLLECTION, 'tags', 'keyword');
    } catch {
      // ignore if client doesn't support
    }

    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

export async function queryGraphRag(opts: QueryOptions): Promise<RagResult[]> {
  const limit = Math.min(opts.limit ?? DEFAULT_LIMIT, Number(process.env.RAG_MAX_RESULTS || '50'));
  const expand = opts.expandNeighbors ?? DEFAULT_EXPAND;

  // 1) ensure embedding
  let embedding = opts.embedding;
  if (!embedding) {
    if (!opts.text) throw new Error('Either text or embedding required');
    embedding = await embedder(opts.text);
    if (!Array.isArray(embedding) || embedding.length === 0)
      throw new Error('Embedder returned empty embedding');
  }

  // 2) query qdrant for base hits
  let baseHits: Array<{
    id: string;
    similarity: number;
    content: string;
    metadata?: any;
  }> = [];
  try {
    baseHits = await fetchQdrantHits(embedding, limit, opts.filters);
  } catch (e) {
    // degrade gracefully: try to return empty set with warning
    console.warn('[graph-rag] Qdrant search failed, returning empty:', e);
    baseHits = [];
  }

  if (baseHits.length === 0) return [];

  const baseIds = baseHits.map((h) => h.id);

  // 3) expand graph neighbors
  const neighbors = await fetchGraphNeighbors(baseIds, expand);

  // 4) merge and compute scores
  const graphMap = new Map<string, number>();
  neighbors.forEach((n: any) => {
    const prev = graphMap.get(String(n.id)) ?? 0;
    graphMap.set(String(n.id), prev + (Number(n.weight) || 0));
  });

  const normalizedGraph = normalizeWeights(
    Array.from(graphMap.entries()).map(([id, weight]) => ({ id, weight }))
  );

  // Map id -> normalized weight
  const graphWeightById = new Map<string, number>(normalizedGraph.map((g) => [g.id, g.norm]));

  // Compose candidates map (dedupe ids).
  const candidates = new Map<string, RagResult>();

  // add base hits
  for (const h of baseHits) {
    const gw = graphWeightById.get(h.id) ?? 0;
    const boost = await getRedisBoost(h.id);
    const score = ALPHA * (h.similarity ?? 0) + BETA * gw + GAMMA * boost;
    candidates.set(h.id, {
      id: h.id,
      similarity: h.similarity ?? 0,
      graphWeight: gw,
      score,
      content: h.content,
      metadata: h.metadata || {},
    });
  }

  // add neighbors (they might not be in baseHits)
  for (const n of neighbors) {
    const id = String(n.id);
    const existing = candidates.get(id);
    const gw = graphWeightById.get(id) ?? (typeof n.weight === 'number' ? n.weight : 0);
    const boost = await getRedisBoost(id);
    const similarity = existing?.similarity ?? 0;
    const content = existing?.content ?? n.content ?? '';
    const score = ALPHA * similarity + BETA * gw + GAMMA * boost;
    if (!existing || score > (existing.score ?? 0)) {
      candidates.set(id, {
        id,
        similarity,
        graphWeight: gw,
        score,
        content,
        metadata: existing?.metadata ?? {},
      });
    }
  }

  // produce sorted list
  const results = Array.from(candidates.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.min(limit, Number(process.env.RAG_CANDIDATES || '4')));

  return results;
}
