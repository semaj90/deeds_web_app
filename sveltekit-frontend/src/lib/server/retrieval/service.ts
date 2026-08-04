/**
 * Unified retrieval service (Phase 3)
 * Orchestrates embedding service + search lanes + Postgres join
 * Replaces scattered retrieval logic across 5+ endpoints
 */

import type { SearchRequest, SearchResponse, SearchResult } from './types.js';
import { initEmbeddingService, getEmbeddingServiceConfig, type QueryVectorBundle } from './embedding-service.js';
import { sql } from 'drizzle-orm';
import { getSearchLaneRegistry } from './search-lanes.js';
import {
  RETRIEVAL_LIMITS,
  buildKeywordBundle,
  inferRetrievalTier,
  normalizeRetrievalSearchRequest,
  type SearchMetadataFilter
} from './search-contract.js';
import type { SearchFilter, SearchLaneContext } from './types.js';

async function getDb() {
  const mod = await import('$lib/server/db/client.js');
  return mod.db;
}

function buildLaneFilter(
  req: SearchRequest,
  normalizedRequest: ReturnType<typeof normalizeRetrievalSearchRequest> | null,
  perLaneLimit: number
): SearchFilter {
  const normalizedFilters = normalizedRequest?.filters as SearchMetadataFilter | undefined;

  return {
    ...req.filters,
    keywords: normalizedRequest?.exactKeywords ?? req.exactKeywords ?? req.filters?.keywords,
    keyword_variants: normalizedRequest?.expandedKeywords ?? req.expandedKeywords ?? req.filters?.keyword_variants,
    artifact_tier: req.filters?.artifact_tier ?? normalizedFilters?.artifactTier,
    artifact_tiers: req.filters?.artifact_tiers ?? normalizedFilters?.artifactTiers,
    include_packet_keys: normalizedRequest?.cursor ? [] : req.filters?.include_packet_keys,
    per_lane_limit: perLaneLimit
  };
}

export function selectLaneNamesForTier(tier: 'hot' | 'warm' | 'cold'): SearchRequest['lanes'] {
  switch (tier) {
    case 'hot':
      return ['lexical', 'qdrant-768', 'gpu-cuvs', 'bm25'];
    case 'cold':
      return ['lexical', 'qdrant-768', 'bm25', 'gpu-cuvs'];
    case 'warm':
    default:
      return ['lexical', 'qdrant-768', 'bm25', 'gpu-cuvs'];
  }
}

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
  const queryText = typeof req.query === 'string'
    ? req.query
    : req.queryText ?? '';

  const queryVector = req.query instanceof Float32Array
    ? req.query
    : req.queryVector;

  const normalizedRequest = queryText
    ? normalizeRetrievalSearchRequest({
        ...(req as any),
        query: queryText,
        queryText
      } as any)
    : null;
  const retrievalTier =
    normalizedRequest?.retrievalTier ??
    inferRetrievalTier({
      query: queryText || String(req.query ?? ''),
      exactKeywords: normalizedRequest?.exactKeywords ?? req.exactKeywords,
      expandedKeywords: normalizedRequest?.expandedKeywords ?? req.expandedKeywords
    });

  const startTime = performance.now();
  const timing: SearchResponse['timing'] = {
    total_ms: 0,
  };

  const perLaneLimit = Math.min(
    normalizedRequest?.topKPerLane ?? req.k ?? RETRIEVAL_LIMITS.defaultTopKPerLane,
    RETRIEVAL_LIMITS.maxTopKPerLane
  );
  const rerankTopK = Math.min(
    normalizedRequest?.rerankTopK ?? RETRIEVAL_LIMITS.defaultRerankCandidates,
    RETRIEVAL_LIMITS.maxRerankCandidates
  );
  const finalTopK = Math.min(
    normalizedRequest?.finalTopK ?? RETRIEVAL_LIMITS.defaultFinalResults,
    RETRIEVAL_LIMITS.maxFinalResults
  );
  const pageSize = Math.min(
    normalizedRequest?.pageSize ?? finalTopK,
    finalTopK
  );

  if (perLaneLimit < 1) {
    throw new Error('topKPerLane must be at least 1');
  }

  // Step 1: Embed query bundle
  const embedStartTime = performance.now();
  const { embedQueryForLane } = await import('./embedding-service.js');
  let queryEmbedding: Float32Array;
  let queryVectorBundle: QueryVectorBundle = {
    dense384: null,
    dense768: null,
    latent64: null,
  };

  if (typeof req.query === 'string') {
    const dense768 = await embedQueryForLane(req.query, 'dense_768');

    queryVectorBundle = {
      dense384: null,
      dense768,
      latent64: null,
    };

    const sourceVector = queryVectorBundle.dense768?.vector;
    if (!sourceVector) {
      throw new Error('Failed to generate a query vector bundle');
    }
    queryEmbedding = sourceVector;
    timing.embed_ms = performance.now() - embedStartTime;
  } else {
    // Pre-embedded vector
    queryEmbedding = req.query instanceof Float32Array ? req.query : new Float32Array(req.query);
    queryVectorBundle = {
      dense384: null,
      dense768: { vector: queryEmbedding, model: 'pre-embedded', dimension: queryEmbedding.length, cached: false, exec_ms: 0 },
      latent64: null,
    };
    timing.embed_ms = performance.now() - embedStartTime;
  }

  if (queryEmbedding.length === 0) {
    throw new Error('Failed to generate embedding');
  }

  // Step 2: Search all requested lanes in parallel
  const { getSearchLaneRegistry } = await import('./search-lanes.js');
  const registry = getSearchLaneRegistry();
  const lanesAttempted: string[] = [];
  const lanesSucceeded: string[] = [];
  const lanesFailed: string[] = [];
  let combinedResults: SearchResult[] = [];

  // Default lane selection is tier-aware: 768 is canonical.
  const laneNames = normalizedRequest?.lanes ?? req.lanes ?? selectLaneNamesForTier(retrievalTier);
  const laneFilters = buildLaneFilter(req, normalizedRequest, perLaneLimit);
  const laneContext: SearchLaneContext = {
    queryText,
    queryVector: queryEmbedding,
    queryVectorBundle,
    topK: perLaneLimit,
    retrievalTier,
    filters: laneFilters,
    keywordBundle: buildKeywordBundle({
      query: queryText || (typeof req.query === 'string' ? req.query : ''),
      exactKeywords: normalizedRequest?.exactKeywords ?? req.exactKeywords,
      expandedKeywords: normalizedRequest?.expandedKeywords ?? req.expandedKeywords
    })
  };
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
      const results = await lane.search(laneContext);
      const elapsed = performance.now() - startSearch;

      lanesSucceeded.push(laneName);

      // Record lane-specific timing
      if (laneName === 'gpu-cuvs') timing.gpu_ms = elapsed;
      else if (laneName === 'qdrant' || laneName === 'qdrant-768') timing.qdrant_ms = elapsed;

      return results;
    } catch (err) {
      lanesFailed.push(laneName);
      console.error(`[UnifiedSearch] Lane ${laneName} error:`, err instanceof Error ? err.message : '');
      return [];
    }
  });

  const laneResults = await Promise.all(laneSearches);
  combinedResults = laneResults.flat();

  // Step 3: Join Postgres for canonical metadata
  // 768-dim: join when source_ref missing and qdrant_point_id present
  // 384-dim legacy: join when packet_key missing (need atlas_packets for packet_key even if source_ref known)
  const postgresStartTime = performance.now();
  const resultsNeedingJoin = combinedResults.filter(
    (r) => !r.source_ref && Boolean(r.metadata?.qdrant_point_id)
  );

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

  // Deduplicate by symbol_version_id first, then packet_key as the fallback join key.
  const seen = new Set<string>();
  const deduped: SearchResult[] = [];
  for (const r of combinedResults) {
    const key = r.symbol_version_id ?? r.packet_key ?? r.id;
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(r);
    }
  }

  // Truncate to k
  const candidates = deduped.slice(0, finalTopK).map((r, idx) => ({ ...r, rank: idx }));

  // Step 5: Optional LLM summary
  let summary: string | undefined;
  if (req.summarize) {
    const summaryStartTime = performance.now();
    summary = await summarizeResults(candidates.slice(0, pageSize));
    timing.summary_ms = performance.now() - summaryStartTime;
  }

  // Done
  timing.total_ms = performance.now() - startTime;

  return {
    candidates,
    timing,
    metadata: {
      lanes_attempted: lanesAttempted as SearchResponse['metadata']['lanes_attempted'],
      lanes_succeeded: lanesSucceeded as SearchResponse['metadata']['lanes_succeeded'],
      lanes_failed: lanesFailed as SearchResponse['metadata']['lanes_failed'],
      candidates_before_rerank: combinedResults.length,
      candidates_count: candidates.length,
      truncated: combinedResults.length > finalTopK,
      query_embedding_hash: hashEmbedding(queryEmbedding),
      warnings: lanesFailed.length > 0 ? [`${lanesFailed.length} lanes failed`] : undefined,
    },
    summary,
  };
}

/**
 * Join Postgres for canonical metadata.
 *
 * Two join paths:
 *   - dense_768 results: join codebase_chunk_index by UUID qdrant_point_id
 *   - legacy dense_384 results: join atlas_packets by source_ref (payload always populated)
 *
 * Both paths are tried; first match wins so cross-dim results merge cleanly into one set.
 */
async function joinPostgres(results: SearchResult[]): Promise<SearchResult[]> {
  if (results.length === 0) return results;

  try {
    const db = await getDb();
    // --- 768-dim path: codebase_chunk_index by UUID ---
    const qdrantPointIds = results
      .filter((r) =>
        r.source === 'qdrant' ||
        r.source === 'qdrant-768' ||
        r.metadata?.embedding_lane === 'dense_768' ||
        (r.metadata?.embedding_lane == null && r.metadata?.embedding_dim === 768)
      )
      .map((r) => r.metadata?.qdrant_point_id)
      .filter((id): id is string => typeof id === 'string' && id.length > 0);

    // --- 384-dim legacy path: atlas_packets by source_ref ---
    const sourceRefs384 = results
      .filter((r) =>
        r.source === 'qdrant-384' ||
        r.metadata?.embedding_lane === 'dense_384' ||
        (r.metadata?.embedding_lane == null && r.metadata?.embedding_dim === 384)
      )
      .map((r) => r.source_ref ?? (r.metadata?.payload as Record<string, unknown> | undefined)?.source_ref as string | undefined)
      .filter((ref): ref is string => typeof ref === 'string' && ref.length > 0);

    const [chunkRows, packetRows] = await Promise.all([
      qdrantPointIds.length > 0
        ? db.execute(sql`
            SELECT
              id::text as id,
              summary,
              source_ref,
              source_ref as file_path,
              updated_at
            FROM codebase_chunk_index
            WHERE id::text = ANY(${qdrantPointIds})
            LIMIT ${qdrantPointIds.length + 1}
          `)
        : Promise.resolve({ rows: [] }),

      sourceRefs384.length > 0
        ? db.execute(sql`
            SELECT
              source_ref,
              file_path,
              summary,
              packet_key,
              tree_node_id,
              sha256 AS content_hash,
              COALESCE(
                metadata->>'workspace_revision',
                metadata->>'workspaceRevision',
                metadata->>'revision'
              ) AS workspace_revision,
              updated_at
            FROM atlas_packets
            WHERE source_ref = ANY(${sourceRefs384}::text[])
            LIMIT ${sourceRefs384.length + 1}
          `)
        : Promise.resolve({ rows: [] }),
    ]);

    type ChunkRow = { id: string; summary: string | null; source_ref: string | null; file_path: string | null; updated_at: Date };
    type PacketRow = {
      source_ref: string;
      file_path: string | null;
      summary: string | null;
      packet_key: string | null;
      tree_node_id: string | null;
      content_hash: string | null;
      workspace_revision: string | null;
      updated_at: Date;
    };

    const chunkMap = new Map(
      (chunkRows.rows as ChunkRow[]).map((p) => [p.id, p])
    );
    const packetMap = new Map(
      (packetRows.rows as PacketRow[]).map((p) => [p.source_ref, p])
    );

    const joinedResults = results.map((r) => {
      // Try chunk join (768-dim path)
      const chunk = chunkMap.get(r.metadata?.qdrant_point_id as string);
      if (chunk) {
        const ref = chunk.source_ref || r.source_ref;
        const packet = ref ? packetMap.get(ref) : undefined;
        return {
          ...r,
          source_ref: packet?.source_ref || chunk.source_ref || r.source_ref,
          file_path: packet?.file_path || chunk.file_path || r.file_path,
          summary: packet?.summary || chunk.summary || r.summary,
          packet_key: packet?.packet_key || r.packet_key,
          tree_node_id: packet?.tree_node_id || r.tree_node_id,
          content_hash: String(packet?.content_hash || r.content_hash || r.metadata?.content_hash || ''),
          workspace_revision: packet?.workspace_revision || r.workspace_revision || r.metadata?.workspace_revision,
          metadata: {
            ...r.metadata,
            updated_at: chunk.updated_at,
            packet_key: packet?.packet_key || r.packet_key,
            tree_node_id: packet?.tree_node_id || r.tree_node_id,
            content_hash: String(packet?.content_hash || r.content_hash || r.metadata?.content_hash || ''),
            workspace_revision: packet?.workspace_revision || r.workspace_revision || r.metadata?.workspace_revision,
          },
        };
      }

      // Try packet join (384-dim legacy path)
      const ref = r.source_ref ?? (r.metadata?.payload as Record<string, unknown> | undefined)?.source_ref as string | undefined;
      const packet = ref ? packetMap.get(ref) : undefined;
      if (packet) {
        return {
          ...r,
          source_ref: packet.source_ref || r.source_ref,
          file_path: packet.file_path || r.file_path,
          summary: packet.summary || r.summary,
          packet_key: packet.packet_key || r.packet_key,
          tree_node_id: packet.tree_node_id || r.tree_node_id,
          content_hash: String(packet.content_hash || r.content_hash || r.metadata?.content_hash || ''),
          workspace_revision: packet.workspace_revision || r.workspace_revision || r.metadata?.workspace_revision,
          metadata: {
            ...r.metadata,
            updated_at: packet.updated_at,
            packet_key: packet.packet_key || r.packet_key,
            tree_node_id: packet.tree_node_id || r.tree_node_id,
            content_hash: String(packet.content_hash || r.content_hash || r.metadata?.content_hash || ''),
            workspace_revision: packet.workspace_revision || r.workspace_revision || r.metadata?.workspace_revision,
          },
        };
      }

      return r;
    });

    return joinedResults as SearchResult[];
  } catch (err) {
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

let retrievalRuntimeInitialized = false;

/**
 * Explicit boot hook for retrieval runtime setup.
 * Importing this module must remain side-effect free; callers should invoke this
 * once during app startup when they want embedding defaults to be applied.
 */
export async function initializeRetrievalRuntime(config: {
  embed_model_768?: string;
} = {}): Promise<void> {
  if (retrievalRuntimeInitialized) return;

  const { initializeSearchRuntime } = await import('./search-runtime.js');
  initEmbeddingService({
    embed_model: config.embed_model_768 ?? 'embeddinggemma:latest',
    embed_model_768: config.embed_model_768,
    target_dim: 768,
  });
  await initializeSearchRuntime();

  retrievalRuntimeInitialized = true;
}
