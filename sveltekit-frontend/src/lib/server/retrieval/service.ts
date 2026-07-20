/**
 * Unified retrieval service (Phase 3)
 * Orchestrates embedding service + search lanes + Postgres join
 * Replaces scattered retrieval logic across 5+ endpoints
 */

import type { SearchRequest, SearchResponse, SearchResult } from './types.js';
import { embedQuery, initEmbeddingService, getEmbeddingServiceConfig } from './embedding-service.js';
import { getSearchLaneRegistry } from './search-lanes.js';
import { sql } from 'drizzle-orm';
import { inArray } from 'drizzle-orm';
import { db } from '$lib/server/db/client.js';

/**
 * Execute unified retrieval
 *
 * Pipeline:
 * 1. Embed query (cached via Bifrost)
 * 2. Search all lanes (GPU, Qdrant, BM25) in parallel
 * 3. Join Postgres for canonical metadata
 * 4. Rerank if requested
 * 5. Optional LLM summary
 */
export async function unifiedSearch(req: SearchRequest): Promise<SearchResponse> {
  const startTime = performance.now();
  const timing: SearchResponse['timing'] = {
    total_ms: 0,
  };

  const k = req.k ?? 10;
  if (k < 1 || k > 1000) {
    throw new Error('k must be between 1 and 1000');
  }

  // Step 1: Embed query
  const embedStartTime = performance.now();
  let queryEmbedding: Float32Array;
  let embeddingModel = '';

  if (typeof req.query === 'string') {
    const result = await embedQuery(req.query, req.embedding_dim);
    queryEmbedding = result.vector;
    embeddingModel = result.model;
    timing.embed_ms = performance.now() - embedStartTime;
  } else {
    // Pre-embedded vector
    queryEmbedding = req.query instanceof Float32Array ? req.query : new Float32Array(req.query);
    timing.embed_ms = performance.now() - embedStartTime;
  }

  if (queryEmbedding.length === 0) {
    throw new Error('Failed to generate embedding');
  }

  // Step 2: Search all requested lanes in parallel
  const registry = getSearchLaneRegistry();
  const lanesAttempted: string[] = [];
  const lanesSucceeded: string[] = [];
  const lanesFailed: string[] = [];
  let combinedResults: SearchResult[] = [];

  const laneNames = req.lanes ?? ['gpu-cuvs', 'qdrant'];
  const laneSearches = laneNames.map(async (laneName) => {
    const lane = registry.get(laneName);
    if (!lane) {
      lanesFailed.push(laneName);
      return [];
    }

    lanesAttempted.push(laneName);

    try {
      const health = await lane.health();
      if (!health) {
        lanesFailed.push(laneName);
        return [];
      }

      const startSearch = performance.now();
      const results = await lane.search(queryEmbedding, k, {
        min_confidence: 0,
        min_score: 0,
      });
      const elapsed = performance.now() - startSearch;

      lanesSucceeded.push(laneName);

      // Record lane-specific timing
      if (laneName === 'gpu-cuvs') timing.gpu_ms = elapsed;
      else if (laneName === 'qdrant') timing.qdrant_ms = elapsed;

      return results;
    } catch (err) {
      lanesFailed.push(laneName);
      console.error(`[UnifiedSearch] Lane ${laneName} error:`, err instanceof Error ? err.message : '');
      return [];
    }
  });

  const laneResults = await Promise.all(laneSearches);
  combinedResults = laneResults.flat();

  // Step 3: Join Postgres for canonical metadata (if packet_key missing)
  const postgresStartTime = performance.now();
  const resultsNeedingJoin = combinedResults.filter((r) => !r.source_ref && r.metadata?.qdrant_point_id);

  if (resultsNeedingJoin.length > 0) {
    const joined = await joinPostgres(resultsNeedingJoin);
    combinedResults = combinedResults.map((r) => {
      const j = joined.find((x) => x.id === r.id);
      return j ?? r;
    });
  }

  timing.postgres_ms = performance.now() - postgresStartTime;

  // Step 4: RRF fusion if multiple lanes succeeded
  if (lanesSucceeded.length > 1) {
    combinedResults = rrfFusion(combinedResults, lanesSucceeded);
  }

  // Deduplicate by packet_key
  const seen = new Set<string>();
  const deduped: SearchResult[] = [];
  for (const r of combinedResults) {
    const key = r.packet_key ?? r.id;
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(r);
    }
  }

  // Truncate to k
  const candidates = deduped.slice(0, k).map((r, idx) => ({ ...r, rank: idx }));

  // Step 5: Optional LLM summary
  let summary: string | undefined;
  if (req.summarize) {
    const summaryStartTime = performance.now();
    summary = await summarizeResults(candidates);
    timing.summary_ms = performance.now() - summaryStartTime;
  }

  // Done
  timing.total_ms = performance.now() - startTime;

  return {
    candidates,
    timing,
    metadata: {
      lanes_attempted: lanesAttempted,
      lanes_succeeded: lanesSucceeded,
      lanes_failed: lanesFailed,
      candidates_count: candidates.length,
      truncated: combinedResults.length > k,
      query_embedding_hash: hashEmbedding(queryEmbedding),
      warnings: lanesFailed.length > 0 ? [`${lanesFailed.length} lanes failed`] : undefined,
    },
    summary,
  };
}

/**
 * Join Postgres for canonical metadata
 * Enriches SearchResult with title, summary, file_path, updated_at from codebase_chunk_index
 */
async function joinPostgres(results: SearchResult[]): Promise<SearchResult[]> {
  if (results.length === 0) {
    return results;
  }

  try {
    // Extract Qdrant point IDs for lookup
    const qdrantPointIds = results
      .map((r) => r.metadata?.qdrant_point_id)
      .filter((id): id is string => typeof id === 'string' && id.length > 0);

    if (qdrantPointIds.length === 0) {
      return results;
    }

    // Fetch canonical metadata from codebase_chunk_index using raw SQL for flexibility
    const packets = await db.execute(sql`
      SELECT
        id::text as id,
        summary,
        source_ref,
        source_ref as file_path,
        updated_at
      FROM codebase_chunk_index
      WHERE id::text = ANY(${qdrantPointIds})
      LIMIT ${results.length}
    `);

    if (!packets.rows || packets.rows.length === 0) {
      return results;
    }

    // Build lookup map by id
    const packetMap = new Map(
      (packets.rows as Array<{ id: string; summary: string | null; source_ref: string | null; file_path: string | null; updated_at: Date }>)
        .map((p) => [p.id, p])
    );

    // Enrich results with canonical metadata
    return results.map((r) => {
      const packet = packetMap.get(r.metadata?.qdrant_point_id as string);
      if (!packet) {
        return r;
      }

      return {
        ...r,
        source_ref: packet.source_ref || r.source_ref,
        file_path: packet.file_path || r.file_path,
        summary: packet.summary || r.summary,
        metadata: {
          ...r.metadata,
          updated_at: packet.updated_at,
        },
      };
    });
  } catch (err) {
    // Graceful degradation: if Postgres is unavailable, return original results
    console.error('[UnifiedSearch] Postgres join failed:', err instanceof Error ? err.message : '');
    return results;
  }
}

/**
 * Reciprocal Rank Fusion: combine multiple ranked result sets
 * Weight by lane priority and competence
 */
function rrfFusion(results: SearchResult[], lanesSucceeded: string[]): SearchResult[] {
  const registry = getSearchLaneRegistry();

  // Group by source lane, compute RRF score
  const scoreMap = new Map<string, number>();

  for (const result of results) {
    const lane = registry.get(result.source);
    if (!lane) continue;

    const laneConfig = lane.config();
    const rrf = 1 / (60 + result.rank); // Standard RRF formula
    const weighted = rrf * laneConfig.weight;

    const key = result.id;
    scoreMap.set(key, (scoreMap.get(key) ?? 0) + weighted);
  }

  // Re-score results
  const rescored = results.map((r) => ({
    ...r,
    score: scoreMap.get(r.id) ?? 0,
  }));

  // Sort by new score
  rescored.sort((a, b) => b.score - a.score);

  return rescored;
}

/**
 * Summarize search results via LLM
 */
async function summarizeResults(candidates: SearchResult[]): Promise<string> {
  // TODO: Integrate Gemma4 summary pipeline
  // const context = candidates.map(c => c.summary).join('\n\n');
  // const summary = await bifrostChat([{ role: 'user', content: `Summarize: ${context}` }], ...);
  return `Found ${candidates.length} relevant results`;
}

/**
 * Hash embedding for cache key
 */
function hashEmbedding(vec: Float32Array): string {
  // Simple hash of first 10 elements
  const sample = Array.from(vec.slice(0, 10));
  return Buffer.from(JSON.stringify(sample)).toString('hex').slice(0, 16);
}

/**
 * Initialize retrieval service with config
 */
export function initRetrievalService(config: { embed_model?: string; qdrant_url?: string }) {
  initEmbeddingService({
    embed_model: config.embed_model,
  });
}
