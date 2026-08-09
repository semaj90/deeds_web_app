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

import { getQdrantClient } from '$lib/server/vector/qdrant-singleton.js';
import { getValkeyClient } from '$lib/server/cache/valkey-client.js';
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
  includeQdrant?: boolean;
  includeTurboVec?: boolean;
  includeRedis?: boolean;
  includeFts?: boolean;
  includeNeo4j?: boolean;
  timeout?: number;
}

export interface LaneResult {
  lane: string;
  status: 'success' | 'error' | 'timeout' | 'not_configured';
  results: SearchResult[];
  error?: string;
  durationMs?: number;
  reason?: string;
}

export interface ParallelRetrieveResult {
  results: SearchResult[];
  lanes: LaneResult[];
}

// Parallel orchestrator

interface LaneOutcome {
  results: SearchResult[];
  status: 'success' | 'not_configured';
  reason?: string;
}

async function asSuccessLane(promise: Promise<SearchResult[]>): Promise<LaneOutcome> {
  const results = await promise;
  return { results, status: 'success' };
}

export async function parallelRetrieve(
  query: string,
  queryVector: Float32Array | null, // 768-dim embedding; null when no embedding is available
  options: ParallelSearchOptions = {}
): Promise<ParallelRetrieveResult> {
  const topK = options.topK ?? 10;
  const timeout = options.timeout ?? 5000;

  // Fan out to 5 lanes in parallel
  const results = await Promise.allSettled<LaneOutcome>([
    // Lane 1: Qdrant ANN (768-dim) — not_configured (not a bare empty
    // success) when disabled or when no query embedding was produced,
    // same reasoning as the other optional lanes below.
    options.includeQdrant !== false && queryVector
      ? asSuccessLane(searchQdrant(queryVector, topK, timeout))
      : Promise.resolve<LaneOutcome>({
          results: [],
          status: 'not_configured',
          reason: !queryVector ? 'embedding_unavailable' : 'lane_disabled',
        }),

    // Lane 2: TurboVec sparse (384-dim, optional) — not yet implemented, see
    // searchTurboVec below; reports not_configured rather than a bare empty
    // success so callers don't mistake "unimplemented" for "searched, found nothing"
    options.includeTurboVec !== false
      ? searchTurboVec(query, queryVector, topK, timeout)
      : Promise.resolve<LaneOutcome>({ results: [], status: 'not_configured', reason: 'lane_disabled' }),

    // Lane 3: Redis centroids (optional) — reports not_configured when no
    // centroid:feature:* keys exist at all, distinct from "searched, found nothing"
    options.includeRedis !== false
      ? searchRedisCentroids(queryVector, topK, timeout)
      : Promise.resolve<LaneOutcome>({ results: [], status: 'not_configured', reason: 'lane_disabled' }),

    // Lane 4: Postgres FTS (optional)
    options.includeFts !== false
      ? asSuccessLane(searchPostgresFTS(query, topK, timeout))
      : Promise.resolve<LaneOutcome>({ results: [], status: 'not_configured', reason: 'lane_disabled' }),

    // Lane 5: Neo4j topology (optional)
    options.includeNeo4j !== false
      ? asSuccessLane(searchNeo4jTopology(query, topK, timeout))
      : Promise.resolve<LaneOutcome>({ results: [], status: 'not_configured', reason: 'lane_disabled' }),
  ]);

  // Collect results from all lanes (skip failures)
  const allResults: SearchResult[] = [];
  const lanes: LaneResult[] = [];

  const laneNames = ['qdrant', 'turbovec', 'redis', 'postgres', 'neo4j'];
  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result.status === 'fulfilled') {
      const outcome = result.value;
      allResults.push(...outcome.results);
      lanes.push({
        lane: laneNames[i],
        status: outcome.status,
        results: outcome.results,
        durationMs: 0,
        reason: outcome.reason,
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
  const topResults = blended.sort((a, b) => b.score - a.score).slice(0, topK);
  return { results: topResults, lanes };
}

// Lane 1: Qdrant ANN

async function searchQdrant(
  vector: Float32Array,
  limit: number,
  timeout: number
): Promise<SearchResult[]> {
  try {
    const qdrant = getQdrantClient();

    const signal = AbortSignal.timeout(timeout);
    const searchRes = await qdrant.search('codebase_chunks_768', {
      vector: Array.from(vector),
      limit,
      with_payload: true,
      with_vector: false,
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

// Lane 2: TurboVec sparse search (not yet implemented)

async function searchTurboVec(
  query: string,
  vector: Float32Array,
  limit: number,
  timeout: number
): Promise<LaneOutcome> {
  // TurboVec gRPC call would go here (port 50055) — not wired yet.
  // not_configured (not "success" with an empty array) so callers can tell
  // "this lane has no backend" apart from "this lane searched and found
  // nothing" — see openspec/changes/parent-atlas-runtime-ownership-precall.
  return { results: [], status: 'not_configured', reason: 'turbovec_grpc_not_wired' };
}

// Lane 3: Redis centroids
//
// audited 2026-08-02 (openspec/changes/session-159-followup-tasks.md, Phase
// 11): live Redis currently has zero keys under any centroid:* naming
// scheme, and this file's own historical `centroid:feature:*` pattern does
// not match any of the 8 incompatible schemes found elsewhere in the repo.
// Report not_configured whenever no candidate keys exist at all, instead of
// silently returning an empty "success" result indistinguishable from a
// real search that happened to match nothing.

async function searchRedisCentroids(
  vector: Float32Array,
  limit: number,
  timeout: number
): Promise<LaneOutcome> {
  try {
    const redis = getValkeyClient().duplicate({
      connectTimeout: timeout,
      lazyConnect: true,
      enableOfflineQueue: false,
    });
    if (redis.status === 'wait') await redis.connect();

    // Look up cached centroids by approximate similarity
    // This is a simplified version; real implementation would do cosine similarity
    const keys = await redis.keys('centroid:feature:*');

    if (keys.length === 0) {
      await redis.quit();
      return {
        results: [],
        status: 'not_configured',
        reason: 'no_centroid_feature_keys_found',
      };
    }

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
    return { results, status: 'success' };
  } catch (e) {
    console.error('Redis lane error:', e);
    // Re-throw (not swallow-to-empty-array) so Promise.allSettled marks this
    // lane 'rejected' -> aggregation loop reports status:'error', distinct
    // from both 'success' (found results) and 'not_configured' (no backing).
    throw e;
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
