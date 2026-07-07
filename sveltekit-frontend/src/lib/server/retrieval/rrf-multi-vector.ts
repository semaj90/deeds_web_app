/**
 * RRF Multi-Vector Fusion
 *
 * Reciprocal Rank Fusion (RRF) algorithm combining 4 independent retrieval lanes:
 * 1. Content Dense (Qdrant HNSW, 768-dim)
 * 2. Summary Dense (Qdrant HNSW, 768-dim)
 * 3. Title Dense (Qdrant HNSW, 768-dim)
 * 4. Keywords Lexical (Qdrant BM25)
 *
 * RRF formula: score = sum( 1 / (k + rank_i) ) for each lane
 * k = 60 (constant, prevents rank 0 explosion)
 *
 * Weights (configurable):
 * - 0.40 · content_dense
 * - 0.30 · summary_dense
 * - 0.20 · title_dense
 * - 0.10 · keywords_lexical
 */

export interface QdrantSearchResult {
  id: string;
  score: number;
  payload?: Record<string, any>;
}

export interface RRFCandidate {
  id: string;
  contentScore: number;
  summaryScore: number;
  titleScore: number;
  keywordScore: number;
  rrf_score: number;
  normalizedScore: number;
  source: 'content' | 'summary' | 'title' | 'keywords';
}

export interface RRFConfig {
  weights: {
    content: number;
    summary: number;
    title: number;
    keywords: number;
  };
  k: number; // RRF constant (default 60)
  topK: number; // Return top-K results
}

// Default configuration
export const DEFAULT_RRF_CONFIG: RRFConfig = {
  weights: {
    content: 0.4,
    summary: 0.3,
    title: 0.2,
    keywords: 0.1,
  },
  k: 60,
  topK: 10,
};

/**
 * Calculate RRF score for a single candidate across all lanes
 *
 * RRF = sum( weight_i * 1/(k + rank_i) ) for each lane i
 */
function calculateRRFScore(
  candidate: Partial<RRFCandidate>,
  config: RRFConfig
): number {
  let rrf = 0;

  // Content lane
  if (candidate.contentScore !== undefined && candidate.contentScore > 0) {
    const rank = 1 / candidate.contentScore; // Inverse of score for ranking
    rrf += config.weights.content / (config.k + rank);
  }

  // Summary lane
  if (candidate.summaryScore !== undefined && candidate.summaryScore > 0) {
    const rank = 1 / candidate.summaryScore;
    rrf += config.weights.summary / (config.k + rank);
  }

  // Title lane
  if (candidate.titleScore !== undefined && candidate.titleScore > 0) {
    const rank = 1 / candidate.titleScore;
    rrf += config.weights.title / (config.k + rank);
  }

  // Keywords lane (lexical, different scale)
  if (candidate.keywordScore !== undefined && candidate.keywordScore > 0) {
    const rank = candidate.keywordScore; // Already 0-1 scale for BM25
    rrf += config.weights.keywords / (config.k + (1 - rank)); // Invert for ranking
  }

  return rrf;
}

/**
 * Fuse results from 4 independent retrieval lanes using RRF
 *
 * @param contentResults - Results from content (768-dim) vector search
 * @param summaryResults - Results from summary (768-dim) vector search
 * @param titleResults - Results from title (768-dim) vector search
 * @param keywordResults - Results from keywords (BM25) search
 * @param config - RRF configuration (weights, k, topK)
 * @returns Merged results ranked by RRF score
 */
export function fuseLanesViaRrf(
  contentResults: QdrantSearchResult[],
  summaryResults: QdrantSearchResult[],
  titleResults: QdrantSearchResult[],
  keywordResults: QdrantSearchResult[],
  config: RRFConfig = DEFAULT_RRF_CONFIG
): RRFCandidate[] {
  // Build candidate map (unique by ID)
  const candidateMap = new Map<string, Partial<RRFCandidate>>();

  // Populate content lane
  for (const result of contentResults) {
    const cand = candidateMap.get(result.id) || { id: result.id };
    cand.contentScore = result.score;
    candidateMap.set(result.id, cand);
  }

  // Populate summary lane
  for (const result of summaryResults) {
    const cand = candidateMap.get(result.id) || { id: result.id };
    cand.summaryScore = result.score;
    candidateMap.set(result.id, cand);
  }

  // Populate title lane
  for (const result of titleResults) {
    const cand = candidateMap.get(result.id) || { id: result.id };
    cand.titleScore = result.score;
    candidateMap.set(result.id, cand);
  }

  // Populate keywords lane
  for (const result of keywordResults) {
    const cand = candidateMap.get(result.id) || { id: result.id };
    cand.keywordScore = result.score;
    candidateMap.set(result.id, cand);
  }

  // Calculate RRF scores and convert to result format
  const results: RRFCandidate[] = Array.from(candidateMap.values()).map(cand => ({
    id: cand.id!,
    contentScore: cand.contentScore ?? 0,
    summaryScore: cand.summaryScore ?? 0,
    titleScore: cand.titleScore ?? 0,
    keywordScore: cand.keywordScore ?? 0,
    rrf_score: calculateRRFScore(cand, config),
    normalizedScore: 0, // Will be set after sorting
    source: 'content', // Default, can be overridden by caller
  }));

  // Sort by RRF score (descending)
  results.sort((a, b) => b.rrf_score - a.rrf_score);

  // Normalize scores to [0, 1] range
  if (results.length > 0) {
    const maxScore = results[0].rrf_score;
    const minScore = results[results.length - 1].rrf_score;
    const range = maxScore - minScore || 1; // Prevent division by zero

    for (const result of results) {
      result.normalizedScore = (result.rrf_score - minScore) / range;
    }
  }

  // Return top-K
  return results.slice(0, config.topK);
}

/**
 * Validate RRF configuration
 */
export function validateRRFConfig(config: RRFConfig): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Validate weights sum to approximately 1.0
  const totalWeight =
    config.weights.content +
    config.weights.summary +
    config.weights.title +
    config.weights.keywords;

  if (Math.abs(totalWeight - 1.0) > 0.01) {
    errors.push(`Weights sum to ${totalWeight}, expected 1.0`);
  }

  // Validate individual weights
  for (const [lane, weight] of Object.entries(config.weights)) {
    if (weight < 0 || weight > 1) {
      errors.push(`${lane} weight ${weight} out of range [0, 1]`);
    }
  }

  // Validate k
  if (config.k < 0) {
    errors.push(`k=${config.k} must be non-negative`);
  }

  // Validate topK
  if (config.topK < 1 || config.topK > 1000) {
    errors.push(`topK=${config.topK} must be in range [1, 1000]`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Test RRF with sample data
 */
export function testRRF() {
  const contentResults: QdrantSearchResult[] = [
    { id: 'chunk_1', score: 0.95 },
    { id: 'chunk_2', score: 0.87 },
    { id: 'chunk_3', score: 0.72 },
  ];

  const summaryResults: QdrantSearchResult[] = [
    { id: 'chunk_1', score: 0.91 },
    { id: 'chunk_4', score: 0.85 },
  ];

  const titleResults: QdrantSearchResult[] = [
    { id: 'chunk_2', score: 0.88 },
    { id: 'chunk_5', score: 0.80 },
  ];

  const keywordResults: QdrantSearchResult[] = [
    { id: 'chunk_1', score: 0.75 },
    { id: 'chunk_3', score: 0.70 },
  ];

  const fused = fuseLanesViaRrf(
    contentResults,
    summaryResults,
    titleResults,
    keywordResults
  );

  return fused;
}