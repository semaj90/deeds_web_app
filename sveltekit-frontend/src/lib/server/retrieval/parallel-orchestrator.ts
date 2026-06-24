/**
 * src/lib/server/retrieval/parallel-orchestrator.ts
 *
 * Parallel retrieval orchestrator: fans out to 5 independent retrieval lanes
 * running simultaneously via Promise.allSettled() for fault tolerance.
 *
 * Lane 1: Qdrant ANN (768-dim dense vector)
 * Lane 2: TurboVec sparse search (384-dim, 50055 gRPC)
 * Lane 3: Redis centroids (directory-level semantic cache)
 * Lane 4: PostgreSQL FTS (BM25 full-text search)
 * Lane 5: Neo4j topology (k-hop bounded neighbor expansion)
 *
 * Deduplication, reranking, and fusion happen post-retrieval.
 * Returns top-K results with unified score and source attribution.
 */

import { QdrantClient } from '@qdrant/js-client-rest';
import Redis from 'ioredis';
import pg from 'pg';
import type { QueryResult } from 'pg';

// Types

export interface SearchResult {
  id: string;
  source: 'qdrant' | 'turbovec' | 'redis' | 'postgres' | 'neo4j';
  score: number;
  relativeScore: number; // 0-1 normalized per source
  content?: string;
  metadata?: Record<string, unknown>;
}

export interface ParallelSearchOptions {
  topK?: number;
  includeTurboVec?: boolean;
  includeRedis?: boolean;
  includeFts?: boolean;
  includeNeo4j?: boolean;
  timeout?: number;
}

export interface LaneResult {
  lane: string;
  status: 'success' | 'error' | 'timeout';
  results: SearchResult[];
  error?: string;
  durationMs?: number;
}

// Parallel orchestrator

export async function parallelRetrieve(
  query: string,
  queryVector: Float32Array, // 768-dim embedding
  options: ParallelSearchOptions = {}
): Promise<SearchResult[]> {
  const topK = options.topK ?? 10;
  const timeout = options.timeout ?? 5000;

  // Fan out to 5 lanes in parallel
  const results = await Promise.allSettled([
    // Lane 1: Qdrant ANN (768-dim)
    searchQdrant(queryVector, topK, timeout),

    // Lane 2: TurboVec sparse (384-dim, optional)
    options.includeTurboVec !== false
      ? searchTurboVec(query, queryVector, topK, timeout)
      : Promise.resolve([]),

    // Lane 3: Redis centroids (optional)
    options.includeRedis !== false
      ? searchRedisCentroids(queryVector, topK, timeout)
      : Promise.resolve([]),

    // Lane 4: Postgres FTS (optional)
    options.includeFts !== false
      ? searchPostgresFTS(query, topK, timeout)
      : Promise.resolve([]),

    // Lane 5: Neo4j topology (optional)
    options.includeNeo4j !== false
      ? searchNeo4jTopology(query, topK, timeout)
      : Promise.resolve([]),
  ]);

  // Collect results from all lanes (skip failures)
  const allResults: SearchResult[] = [];
  const lanes: LaneResult[] = [];

  const laneNames = ['qdrant', 'turbovec', 'redis', 'postgres', 'neo4j'];
  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result.status === 'fulfilled') {
      const laneResults = result.value;
      allResults.push(...laneResults);
      lanes.push({
        lane: laneNames[i],
        status: 'success',
        results: laneResults,
        durationMs: 0,
      });
    } else {
      lanes.push({
        lane: laneNames[i],
        status: 'error',
        results: [],
        error: String(result.reason),
      });
    }
  }

  // Deduplicate by ID, keep highest score
  const deduped = deduplicateResults(allResults);

  // Normalize scores per source, then blend
  const blended = blendScores(deduped);

  // Sort by blended score, return top-K
  return blended.sort((a, b) => b.score - a.score).slice(0, topK);
}

// Lane 1: Qdrant ANN

async function searchQdrant(
  vector: Float32Array,
  limit: number,
  timeout: number
): Promise<SearchResult[]> {
  try {
    const qdrant = new QdrantClient({
      url: process.env.QDRANT_URL || 'http://127.0.0.1:6333',
    });

    const signal = AbortSignal.timeout(timeout);
    const searchRes = await qdrant.search('codebase_chunks_768', {
      vector: Array.from(vector),
      limit,
      with_payload: true,
      with_vectors: false,
    });

    return searchRes.map((point) => ({
      id: String(point.id),
      source: 'qdrant',
      score: point.score,
      relativeScore: point.score,
      metadata: point.payload as Record<string, unknown>,
    }));
  } catch (e) {
    console.error('Qdrant lane error:', e);
    return [];
  }
}

// Lane 2: TurboVec sparse search (placeholder)

async function searchTurboVec(
  query: string,
  vector: Float32Array,
  limit: number,
  timeout: number
): Promise<SearchResult[]> {
  // TurboVec gRPC call would go here (port 50055)
  // For now, return empty (optional lane)
  return [];
}

// Lane 3: Redis centroids

async function searchRedisCentroids(
  vector: Float32Array,
  limit: number,
  timeout: number
): Promise<SearchResult[]> {
  try {
    const redis = new Redis({
      host: process.env.REDIS_HOST || '127.0.0.1',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      password: process.env.REDIS_PASSWORD,
      connectTimeout: timeout,
    });

    // Look up cached centroids by approximate similarity
    // This is a simplified version; real implementation would do cosine similarity
    const keys = await redis.keys('centroid:feature:*');
    const results: SearchResult[] = [];

    for (const key of keys.slice(0, limit)) {
      const data = await redis.get(key);
      if (data) {
        try {
          const parsed = JSON.parse(data);
          results.push({
            id: key,
            source: 'redis',
            score: 0.5, // Would be actual cosine similarity
            relativeScore: 0.5,
            metadata: parsed,
          });
        } catch {
          // Skip malformed cache entries
        }
      }
    }

    await redis.quit();
    return results;
  } catch (e) {
    console.error('Redis lane error:', e);
    return [];
  }
}

// Lane 4: PostgreSQL FTS

async function searchPostgresFTS(
  query: string,
  limit: number,
  timeout: number
): Promise<SearchResult[]> {
  try {
    const pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      connectionTimeoutMillis: timeout,
    });

    const ftsRes = await pool.query<{ id: string; rank: number; content: string }>(
      `
      SELECT id, ts_rank(search_vector, plainto_tsquery($1)) AS rank, content
      FROM codebase_chunk_index
      WHERE search_vector @@ plainto_tsquery($1)
      ORDER BY rank DESC
      LIMIT $2
      `,
      [query, limit]
    );

    await pool.end();

    return ftsRes.rows.map((row) => ({
      id: row.id,
      source: 'postgres',
      score: row.rank,
      relativeScore: Math.min(row.rank, 1.0),
      content: row.content,
    }));
  } catch (e) {
    console.error('Postgres FTS lane error:', e);
    return [];
  }
}

// Lane 5: Neo4j topology

async function searchNeo4jTopology(
  query: string,
  limit: number,
  timeout: number
): Promise<SearchResult[]> {
  // Neo4j k-hop neighbor expansion would go here
  // For now, return empty (optional lane)
  return [];
}

// Deduplication

function deduplicateResults(results: SearchResult[]): SearchResult[] {
  const seen = new Map<string, SearchResult>();

  for (const result of results) {
    if (!seen.has(result.id) || (result.score > seen.get(result.id)!.score)) {
      seen.set(result.id, result);
    }
  }

  return Array.from(seen.values());
}

// Score blending (Karpathy-style: PR + attention + authority)

function blendScores(results: SearchResult[]): SearchResult[] {
  // Normalize scores per source
  const sourceGroups = new Map<string, SearchResult[]>();
  for (const result of results) {
    if (!sourceGroups.has(result.source)) {
      sourceGroups.set(result.source, []);
    }
    sourceGroups.get(result.source)!.push(result);
  }

  // Normalize each source's scores to 0-1 range
  for (const [_, group] of sourceGroups) {
    const maxScore = Math.max(...group.map((r) => r.score));
    if (maxScore > 0) {
      for (const result of group) {
        result.relativeScore = result.score / maxScore;
      }
    }
  }

  // Blend: 0.4·qdrant_score + 0.3·postgres_rank + 0.2·redis + 0.1·others
  const blended: SearchResult[] = results.map((result) => {
    let blendedScore = 0;

    switch (result.source) {
      case 'qdrant':
        blendedScore = result.relativeScore * 0.4;
        break;
      case 'postgres':
        blendedScore = result.relativeScore * 0.3;
        break;
      case 'redis':
        blendedScore = result.relativeScore * 0.2;
        break;
      default:
        blendedScore = result.relativeScore * 0.1;
    }

    return { ...result, score: blendedScore };
  });

  return blended;
}
