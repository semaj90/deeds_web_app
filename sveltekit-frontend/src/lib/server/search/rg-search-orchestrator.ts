/**
 * src/lib/server/search/rg-search-orchestrator.ts
 *
 * Orchestrates full-text search combining rg + Qdrant + Neo4j retrieval.
 *
 * Pipeline:
 *   1. rg search (BM25-like lexical matching)
 *   2. Optional Qdrant vector reranking (semantic similarity)
 *   3. Optional Neo4j neighborhood expansion (graph context)
 *   4. Result aggregation and ranking
 *
 * Phase 1 (Production Ready):
 *   - rg full-text search with caching
 *   - Pagination and filtering
 *
 * Phase 2 (Research):
 *   - Qdrant semantic reranking
 *   - Neo4j topology-aware expansion
 */

import { runRgSearch, type RgSearchResponse } from './rg-bridge';
import { log } from '../logging';

export interface SearchOptions {
  query: string;
  limit?: number;
  offset?: number;
  type?: string;
  exclude?: string;
  includeContext?: boolean;
  rerank?: boolean; // Phase 2: Qdrant reranking
  expandTopology?: boolean; // Phase 2: Neo4j expansion
}

export interface SearchResult {
  file: string;
  line: number;
  column?: number;
  content: string;
  match: string;
  score: number;
  context?: {
    before: string[];
    after: string[];
  };
  topologyNeighbors?: string[]; // Phase 2: Neo4j expansion
}

export interface SearchResponse {
  results: SearchResult[];
  total: number;
  query: string;
  duration_ms: number;
  backend: 'rg' | 'rg+qdrant' | 'rg+neo4j' | 'rg+hybrid';
  cached?: boolean;
}

/**
 * Execute a search across the codebase using the orchestrated pipeline.
 *
 * @param options - Search options (query required)
 * @returns Unified search response with aggregated results
 */
export async function search(options: SearchOptions): Promise<SearchResponse> {
  const startTime = Date.now();

  const {
    query,
    limit = 20,
    offset = 0,
    type,
    exclude = 'node_modules,dist,build',
    includeContext = true,
    rerank = false,
    expandTopology = false
  } = options;

  try {
    log.info(`[search-orchestrator] Searching for: "${query}"`, { limit, offset, type });

    // Stage 1: rg full-text search
    const rgResult = await runRgSearch({
      query,
      type,
      exclude,
      includeContext,
      limit: limit + offset // Fetch extra for pagination
    });

    if (!rgResult.ok) {
      log.error(`[search-orchestrator] rg search failed: ${rgResult.error}`);
      return {
        results: [],
        total: 0,
        query,
        duration_ms: Date.now() - startTime,
        backend: 'rg'
      };
    }

    // Apply pagination
    const paginatedResults = rgResult.results.slice(offset, offset + limit);

    // Convert to unified result format with scores
    let results: SearchResult[] = paginatedResults.map((r) => ({
      ...r,
      score: 1.0 // Default score (no semantic ranking yet)
    }));

    let backend: 'rg' | 'rg+qdrant' | 'rg+neo4j' | 'rg+hybrid' = 'rg';

    // Stage 2: Optional Qdrant semantic reranking (Phase 2)
    if (rerank && results.length > 0) {
      log.debug(`[search-orchestrator] Qdrant reranking: ${results.length} results`);
      // TODO: Wire Qdrant reranking
      // results = await rerankerViaQdrant(query, results);
      // backend = 'rg+qdrant';
    }

    // Stage 3: Optional Neo4j topology expansion (Phase 2)
    if (expandTopology && results.length > 0) {
      log.debug(`[search-orchestrator] Neo4j topology expansion: ${results.length} results`);
      // TODO: Wire Neo4j expansion
      // results = await expandViaNeoj(results);
      // backend = expandTopology && rerank ? 'rg+hybrid' : 'rg+neo4j';
    }

    log.info(`[search-orchestrator] Search complete: ${results.length} results`, {
      backend,
      duration_ms: Date.now() - startTime
    });

    return {
      results,
      total: rgResult.results.length,
      query,
      duration_ms: Date.now() - startTime,
      backend,
      cached: false
    };
  } catch (err) {
    log.error(`[search-orchestrator] Unexpected error during search`, err);
    return {
      results: [],
      total: 0,
      query,
      duration_ms: Date.now() - startTime,
      backend: 'rg'
    };
  }
}

/**
 * Batch search across multiple queries.
 *
 * @param queries - Array of search queries
 * @param options - Common search options
 * @returns Map of query → SearchResponse
 */
export async function searchBatch(
  queries: string[],
  options?: Omit<SearchOptions, 'query'>
): Promise<Map<string, SearchResponse>> {
  const results = new Map<string, SearchResponse>();

  for (const query of queries) {
    const result = await search({
      ...options,
      query
    });
    results.set(query, result);
  }

  return results;
}

/**
 * Search with automatic caching via Redis (handled at API layer).
 * This function is for direct orchestrator calls; the API endpoint
 * handles cache management.
 *
 * @param options - Search options
 * @returns SearchResponse with caching information
 */
export async function searchWithCaching(options: SearchOptions): Promise<SearchResponse> {
  // Caching is handled at the API endpoint level (/api/search/rg)
  // This function delegates to the main search orchestrator
  return search(options);
}
