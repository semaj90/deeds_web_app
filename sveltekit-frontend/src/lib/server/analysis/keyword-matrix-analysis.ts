/**
 * Keyword Matrix Analysis (4×6 RTX Tensor)
 *
 * GPU-accelerated keyword extraction and semantic clustering.
 * Builds a 4×6 RTX tensor representing:
 *   - 4 keyword categories (env_keys, symbols, nouns, domain_keywords)
 *   - 6 analysis dimensions (frequency, centrality, authority, recency, diversity, importance)
 *
 * Use case: Derive meaning from function/feature clustering patterns.
 * Example: High importance + high authority + high diversity in "database" keywords
 *          suggests this feature is a central hub for data access.
 */

/**
 * Keyword categories extracted via noun-reranker
 */
export type KeywordCategory = 'env_keys' | 'symbols' | 'nouns' | 'domain_keywords';

/**
 * Analysis dimensions for keyword scoring
 */
export type AnalysisDimension =
  | 'frequency'      // How often keyword appears
  | 'centrality'     // How central in call graph (Neo4j PageRank)
  | 'authority'      // HITS authority score
  | 'recency'        // Days since last update
  | 'diversity'      // Number of distinct contexts
  | 'importance';    // Combined semantic weight

/**
 * 4×6 keyword matrix entry
 */
export interface KeywordMatrixEntry {
  keyword: string;
  category: KeywordCategory;
  matrix: {
    frequency: number;
    centrality: number;
    authority: number;
    recency: number;
    diversity: number;
    importance: number;
  };
  derived_meaning: string; // AI-generated interpretation
}

/**
 * Build 4×6 tensor for a set of keywords
 * Rows: keyword category (4)
 * Cols: analysis dimension (6)
 */
export function buildKeywordMatrix(
  keywords: Map<string, { category: KeywordCategory; count: number }>,
  pageRankScores: Map<string, number>,
  hitsAuthority: Map<string, number>,
  lastUpdatedDays: number
): Float32Array {
  const matrix = new Float32Array(4 * 6); // 4 categories × 6 dimensions

  const categories = ['env_keys', 'symbols', 'nouns', 'domain_keywords'];
  const categoryIndices = new Map(categories.map((cat, i) => [cat, i]));

  // Compute aggregate stats per category
  const categoryStats = new Map<KeywordCategory, { sumFreq: number; sumPR: number; sumHits: number; count: number }>();
  categories.forEach(cat => categoryStats.set(cat as KeywordCategory, { sumFreq: 0, sumPR: 0, sumHits: 0, count: 0 }));

  for (const [keyword, { category, count }] of keywords) {
    const stats = categoryStats.get(category)!;
    stats.sumFreq += count;
    stats.sumPR += pageRankScores.get(keyword) || 0;
    stats.sumHits += hitsAuthority.get(keyword) || 0;
    stats.count++;
  }

  // Populate matrix (normalize to 0-1)
  let maxFreq = 1;
  let maxPR = 0.1;
  let maxHits = 0.1;

  for (const stats of categoryStats.values()) {
    maxFreq = Math.max(maxFreq, stats.sumFreq);
    maxPR = Math.max(maxPR, stats.sumPR);
    maxHits = Math.max(maxHits, stats.sumHits);
  }

  for (const [category, stats] of categoryStats) {
    const catIdx = categoryIndices.get(category)!;

    // Dimension 0: frequency (normalized)
    matrix[catIdx * 6 + 0] = stats.count > 0 ? stats.sumFreq / maxFreq : 0;

    // Dimension 1: centrality (PageRank average)
    matrix[catIdx * 6 + 1] = stats.count > 0 ? stats.sumPR / stats.count / maxPR : 0;

    // Dimension 2: authority (HITS average)
    matrix[catIdx * 6 + 2] = stats.count > 0 ? stats.sumHits / stats.count / maxHits : 0;

    // Dimension 3: recency (0 = very old, 1 = today, assume 30-day window)
    matrix[catIdx * 6 + 3] = Math.max(0, 1 - lastUpdatedDays / 30);

    // Dimension 4: diversity (number of distinct keywords in category)
    matrix[catIdx * 6 + 4] = Math.min(1, stats.count / 10); // Normalize assuming max 10 keywords per category

    // Dimension 5: importance (weighted combination)
    const importance =
      0.3 * (matrix[catIdx * 6 + 0] || 0) +
      0.3 * (matrix[catIdx * 6 + 1] || 0) +
      0.2 * (matrix[catIdx * 6 + 2] || 0) +
      0.1 * (matrix[catIdx * 6 + 3] || 0) +
      0.1 * (matrix[catIdx * 6 + 4] || 0);
    matrix[catIdx * 6 + 5] = importance;
  }

  return matrix;
}

/**
 * Extract matrix row (single keyword category analysis)
 */
export function getMatrixRow(
  matrix: Float32Array,
  categoryIndex: number
): { frequency: number; centrality: number; authority: number; recency: number; diversity: number; importance: number } {
  const offset = categoryIndex * 6;
  return {
    frequency: matrix[offset + 0],
    centrality: matrix[offset + 1],
    authority: matrix[offset + 2],
    recency: matrix[offset + 3],
    diversity: matrix[offset + 4],
    importance: matrix[offset + 5]
  };
}

/**
 * Generate AI interpretation of matrix patterns
 * Example: "High importance in domain_keywords (0.82) suggests semantic hub"
 */
export function interpretKeywordMatrix(matrix: Float32Array): string {
  const categories = ['env_keys', 'symbols', 'nouns', 'domain_keywords'];
  const insights: string[] = [];

  for (let i = 0; i < 4; i++) {
    const row = getMatrixRow(matrix, i);

    if (row.importance > 0.7) {
      const reason = row.centrality > 0.6 ? 'central hub' : 'high diversity';
      insights.push(`${categories[i]}: ${reason} (importance=${row.importance.toFixed(2)})`);
    }

    if (row.authority > 0.6 && row.frequency > 0.5) {
      insights.push(`${categories[i]}: authoritative and frequent`);
    }
  }

  if (insights.length === 0) {
    return 'No dominant keyword patterns detected';
  }

  return `Keywords indicate: ${insights.join('; ')}`;
}

/**
 * TurboVec GPU job for keyword matrix computation
 * Submits 4×6 tensor analysis to RTX GPU
 */
export interface TurboVecKeywordMatrixJob {
  job_id: string;
  input: {
    keywords: string[];
    category_assignments: KeywordCategory[];
    frequency_counts: number[];
    pagerank_scores: number[];
    hits_authority: number[];
  };
  status: 'queued' | 'running' | 'complete' | 'failed';
  output?: {
    matrix: Float32Array; // 4×6 = 24 floats
    interpretation: string;
    confidence: number; // 0-1
  };
}

/**
 * Build job for TurboVec keyword matrix GPU computation
 */
export function buildKeywordMatrixJob(
  keywords: { word: string; category: KeywordCategory; frequency: number; pagerank: number; hits: number }[]
): Omit<TurboVecKeywordMatrixJob, 'job_id' | 'status'> {
  return {
    input: {
      keywords: keywords.map(k => k.word),
      category_assignments: keywords.map(k => k.category),
      frequency_counts: keywords.map(k => k.frequency),
      pagerank_scores: keywords.map(k => k.pagerank),
      hits_authority: keywords.map(k => k.hits)
    }
  };
}

/**
 * Serialize keyword matrix to JSON for storage/transmission
 */
export function serializeKeywordMatrix(matrix: Float32Array): string {
  return JSON.stringify(Array.from(matrix));
}

/**
 * Deserialize keyword matrix from JSON
 */
export function deserializeKeywordMatrix(json: string): Float32Array {
  return new Float32Array(JSON.parse(json));
}
