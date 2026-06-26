/**
 * Semantic Search Router (Phase 3)
 *
 * Routes queries to optimal search strategy based on query shape:
 * - Symbol/exact: BM25 (exact match, 10ms)
 * - Concept/semantic: Qdrant ANN (intent match, 5ms)
 * - Hybrid: All + rerank (merged results, 25ms)
 *
 * Also orchestrates multi-lane search with fallback chain:
 * Qdrant → Postgres → BM25 → TurboVec rerank
 *
 * Used by Stage A0 in context-assembler.ts for ACE retrieval.
 */

export interface SearchStrategy {
  name: 'symbol' | 'concept' | 'hybrid' | 'fallback';
  confidence: number; // 0-1: how sure we are this is the right lane
  expectedLatency: number; // ms
  description: string;
}

export interface SearchResult {
  chunkId: string;
  score: number; // 0-1 normalized
  source: 'qdrant' | 'postgres' | 'bm25' | 'hybrid';
  content: string;
  metadata?: Record<string, unknown>;
}

/**
 * Detect query intent from text patterns
 */
export function detectQueryIntent(query: string): 'symbol' | 'concept' | 'code' {
  const normalized = query.toLowerCase().trim();

  // Code symbol patterns: identifiers, camelCase, snake_case
  if (/^[a-z_][a-z0-9_]*$/i.test(normalized)) {
    return 'symbol';
  }

  // File path patterns: / or .
  if (normalized.includes('/') || (normalized.includes('.') && !normalized.includes(' '))) {
    return 'symbol';
  }

  // Very short exact match
  if (normalized.length < 50 && !normalized.includes(' ') && /^[a-zA-Z0-9_\-\.]+$/.test(normalized)) {
    return 'symbol';
  }

  // Semantic keywords
  if (
    normalized.includes('similar') ||
    normalized.includes('like') ||
    normalized.includes('explain') ||
    normalized.includes('describe') ||
    normalized.includes('what is')
  ) {
    return 'concept';
  }

  // Code snippet patterns: brackets, quotes, operators
  if (/[\[\]{}()"]|=>|const |function |async /.test(query)) {
    return 'code';
  }

  // Default: concept
  return 'concept';
}

/**
 * Route query to optimal search strategy
 */
export function routeSemanticSearch(query: string): SearchStrategy {
  const intent = detectQueryIntent(query);

  switch (intent) {
    case 'symbol':
      return {
        name: 'symbol',
        confidence: 0.95,
        expectedLatency: 10,
        description: 'Exact symbol/file name match via BM25',
      };

    case 'code':
      return {
        name: 'hybrid',
        confidence: 0.85,
        expectedLatency: 25,
        description: 'Multi-lane search: vector + BM25 + rerank',
      };

    case 'concept':
    default:
      return {
        name: 'concept',
        confidence: 0.90,
        expectedLatency: 5,
        description: 'Semantic intent via Qdrant ANN',
      };
  }
}

/**
 * Merge search results from multiple lanes
 * Deduplicates by chunkId, combines scores
 */
export function mergeSearchResults(
  results: SearchResult[][],
  options: {
    topK?: number;
    dedup?: boolean;
    blend?: boolean;
  } = {}
): SearchResult[] {
  const { topK = 10, dedup = true, blend = true } = options;

  // Flatten and deduplicate
  const merged = new Map<string, SearchResult>();

  for (let sourceIdx = 0; sourceIdx < results.length; sourceIdx++) {
    const source = results[sourceIdx];
    const sourceWeight = 1 / (sourceIdx + 1); // First source weighted highest

    for (const result of source) {
      const existing = merged.get(result.chunkId);

      if (existing) {
        // Blend scores from multiple sources
        if (blend) {
          existing.score = Math.max(existing.score, result.score * sourceWeight);
        }
      } else {
        merged.set(result.chunkId, {
          ...result,
          score: result.score * sourceWeight,
        });
      }
    }
  }

  // Sort by score and return top-K
  return Array.from(merged.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

/**
 * Normalize scores to 0-1 range
 */
export function normalizeScores(results: SearchResult[]): SearchResult[] {
  if (results.length === 0) return results;

  const scores = results.map(r => r.score);
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  const range = max - min || 1;

  return results.map(r => ({
    ...r,
    score: (r.score - min) / range,
  }));
}

/**
 * Blend multiple score dimensions
 * Usage: reranker output combines vector + metadata + authority
 */
export function blendScores(
  results: SearchResult[],
  weights: Record<string, number> = {}
): SearchResult[] {
  const defaultWeights = {
    semantic: 0.7, // Vector similarity
    metadata: 0.15, // Tag/keyword match
    authority: 0.15, // PageRank / cluster authority
  };

  const finalWeights = { ...defaultWeights, ...weights };

  return results.map(r => {
    // Extract score components from metadata if available
    const semanticScore = (r.metadata?.semanticScore as number) ?? r.score;
    const metadataScore = (r.metadata?.metadataScore as number) ?? 0.5;
    const authorityScore = (r.metadata?.authorityScore as number) ?? 0.5;

    const blended =
      (finalWeights.semantic ?? 0.7) * semanticScore +
      (finalWeights.metadata ?? 0.15) * metadataScore +
      (finalWeights.authority ?? 0.15) * authorityScore;

    return {
      ...r,
      score: Math.min(1, Math.max(0, blended)),
    };
  });
}

/**
 * Fallback chain for search
 * Tries lanes in order until one succeeds
 */
export async function searchWithFallback(
  query: string,
  lanes: {
    primary: () => Promise<SearchResult[]>;
    secondary?: () => Promise<SearchResult[]>;
    tertiary?: () => Promise<SearchResult[]>;
    quaternary?: () => Promise<SearchResult[]>;
  },
  options: { topK?: number; timeout?: number } = {}
): Promise<SearchResult[]> {
  const { topK = 10, timeout = 10000 } = options;

  // Try primary lane
  try {
    const results = await Promise.race([
      lanes.primary(),
      new Promise<SearchResult[]>((_, reject) =>
        setTimeout(() => reject(new Error('Primary timeout')), timeout)
      ),
    ]);

    if (results.length > 0) {
      return normalizeScores(results).slice(0, topK);
    }
  } catch (err) {
    console.warn(`Primary search failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Try secondary lane
  if (lanes.secondary) {
    try {
      const results = await Promise.race([
        lanes.secondary(),
        new Promise<SearchResult[]>((_, reject) =>
          setTimeout(() => reject(new Error('Secondary timeout')), timeout)
        ),
      ]);

      if (results.length > 0) {
        return normalizeScores(results).slice(0, topK);
      }
    } catch (err) {
      console.warn(`Secondary search failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Try tertiary lane
  if (lanes.tertiary) {
    try {
      const results = await Promise.race([
        lanes.tertiary(),
        new Promise<SearchResult[]>((_, reject) =>
          setTimeout(() => reject(new Error('Tertiary timeout')), timeout)
        ),
      ]);

      if (results.length > 0) {
        return normalizeScores(results).slice(0, topK);
      }
    } catch (err) {
      console.warn(`Tertiary search failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Try quaternary lane
  if (lanes.quaternary) {
    try {
      const results = await Promise.race([
        lanes.quaternary(),
        new Promise<SearchResult[]>((_, reject) =>
          setTimeout(() => reject(new Error('Quaternary timeout')), timeout)
        ),
      ]);

      if (results.length > 0) {
        return normalizeScores(results).slice(0, topK);
      }
    } catch (err) {
      console.warn(`Quaternary search failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // All lanes failed
  console.error(`All search lanes failed for query: "${query}"`);
  return [];
}

/**
 * Execute search using the optimal strategy
 */
export async function executeSearch(
  strategy: SearchStrategy,
  query: string,
  lanes: Record<string, () => Promise<SearchResult[]>>
): Promise<SearchResult[]> {
  switch (strategy.name) {
    case 'symbol':
      // Use BM25 for exact matches
      if (lanes.bm25) {
        return lanes.bm25();
      }
      break;

    case 'concept':
      // Use Qdrant ANN for semantic
      if (lanes.qdrant) {
        return lanes.qdrant();
      }
      break;

    case 'hybrid':
      // Merge all lanes
      if (lanes.qdrant && lanes.bm25 && lanes.postgres) {
        const [qdrantResults, bm25Results, postgresResults] = await Promise.allSettled([
          lanes.qdrant(),
          lanes.bm25(),
          lanes.postgres(),
        ]);

        return mergeSearchResults(
          [
            qdrantResults.status === 'fulfilled' ? qdrantResults.value : [],
            bm25Results.status === 'fulfilled' ? bm25Results.value : [],
            postgresResults.status === 'fulfilled' ? postgresResults.value : [],
          ],
          { topK: 10, blend: true }
        );
      }
      break;

    case 'fallback':
      // Fallback chain (already handles)
      break;
  }

  // Default: try Qdrant
  if (lanes.qdrant) {
    return lanes.qdrant();
  }

  return [];
}