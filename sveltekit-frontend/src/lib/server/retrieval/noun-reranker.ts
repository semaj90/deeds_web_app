/**
 * Noun-Based Reranker
 *
 * Extracts nouns/symbols/env-keys from query and reranks candidates
 * based on noun overlap before Gemma4 synthesis.
 *
 * Pipeline:
 *   query → extract nouns/symbols/env keys
 *   → rg/BM25 lexical matches
 *   → Qdrant semantic ANN
 *   → TurboVec prefilter
 *   → PageRank/weight boost
 *   → SOM/topology boost
 *   → noun_overlap score
 *   → final blend score
 *   → top features
 *   → Gemma4 summary
 *
 * Scoring formula (8 signals, weights sum to 1.0):
 *   score = 0.22·semantic_sim
 *         + 0.18·lexical_score
 *         + 0.15·noun_overlap
 *         + 0.15·page_rank_weight
 *         + 0.12·topology_proximity
 *         + 0.10·source_ref_match
 *         + 0.08·freshness
 *
 * Noun terms include:
 *   - Environment keys (DATABASE_URL, REDIS_PASSWORD, etc.)
 *   - Symbols/functions (validateSession, embedPacket, etc.)
 *   - Type names (RedisClient, QdrantManager, etc.)
 *   - Domain-specific keywords (retrieval, reranking, SOM, PageRank, etc.)
 */

import type { SelectSchema } from 'drizzle-orm';

interface NounExtractionResult {
  nouns: string[];
  envKeys: string[];
  symbols: string[];
  keywords: string[];
}

interface RankedCandidate {
  feature_id: string;
  score: number;
  scores: {
    semantic: number;
    lexical: number;
    noun_overlap: number;
    page_rank: number;
    topology: number;
    path_match: number;
    freshness: number;
  };
  noun_terms: string[];
  topology_summary: string | null;
  provenance_summary: string | null;
}

/**
 * Extract nouns/env keys/symbols from query using simple pattern matching
 */
export function extractNouns(query: string): NounExtractionResult {
  const nouns: string[] = [];
  const envKeys: string[] = [];
  const symbols: string[] = [];
  const keywords: string[] = [];

  // Env key pattern: UPPERCASE_WITH_UNDERSCORES
  const envKeyPattern = /\b[A-Z][A-Z0-9_]*\b/g;
  const envMatches = query.match(envKeyPattern) || [];
  envKeys.push(...new Set(envMatches));

  // Symbol pattern: camelCase or snake_case function/var names
  const symbolPattern = /\b[a-z_][a-zA-Z0-9_]*(?:\.(?:[a-z_][a-zA-Z0-9_]*)?)*\b/g;
  const symbolMatches = query.match(symbolPattern) || [];
  symbols.push(...new Set(symbolMatches.filter((s) => s.length > 2)));

  // Extract capitalized nouns (heuristic: words starting with capital after non-letters)
  const nounPattern = /(?:^|\s)([A-Z][a-zA-Z0-9]*)/g;
  let match;
  while ((match = nounPattern.exec(query)) !== null) {
    nouns.push(match[1]);
  }

  // Domain-specific keywords
  const domainKeywords = [
    'retrieval',
    'reranking',
    'embedding',
    'vector',
    'semantic',
    'lexical',
    'BM25',
    'SOM',
    'PageRank',
    'topology',
    'provenance',
    'GAN',
    'audit',
    'GPU',
    'CUDA',
    'Qdrant',
    'Redis',
    'Postgres',
    'TurboVec',
    'Gemma4',
    'Ollama',
  ];
  for (const keyword of domainKeywords) {
    if (query.toLowerCase().includes(keyword.toLowerCase())) {
      keywords.push(keyword);
    }
  }

  return {
    nouns: [...new Set(nouns)],
    envKeys: [...new Set(envKeys)],
    symbols: [...new Set(symbols)],
    keywords: [...new Set(keywords)],
  };
}

/**
 * Calculate noun overlap score (Jaccard similarity)
 * Range: 0.0 (no overlap) to 1.0 (perfect overlap)
 */
export function calculateNounOverlap(queryNouns: string[], candidateNouns: string[]): number {
  if (queryNouns.length === 0 || candidateNouns.length === 0) {
    return 0.0;
  }

  const querySet = new Set(queryNouns.map((n) => n.toLowerCase()));
  const candidateSet = new Set(candidateNouns.map((n) => n.toLowerCase()));

  const intersection = [...querySet].filter((n) => candidateSet.has(n)).length;
  const union = new Set([...querySet, ...candidateSet]).size;

  return union === 0 ? 0.0 : intersection / union;
}

/**
 * Calculate topology proximity score based on SOM cell distance
 * Range: 0.0 (far) to 1.0 (same cell)
 */
export function calculateTopologyProximity(
  querySomCell: string | null,
  candidateSomCell: string | null,
): number {
  if (!querySomCell || !candidateSomCell) {
    return 0.5; // Unknown proximity = neutral score
  }

  const parseCell = (cell: string): [number, number] | null => {
    const match = cell.match(/(\d+),(\d+)/);
    if (!match) return null;
    return [parseInt(match[1]), parseInt(match[2])];
  };

  const queryPos = parseCell(querySomCell);
  const candidatePos = parseCell(candidateSomCell);

  if (!queryPos || !candidatePos) {
    return 0.5;
  }

  // Euclidean distance in SOM grid
  const distance = Math.sqrt(
    Math.pow(queryPos[0] - candidatePos[0], 2) + Math.pow(queryPos[1] - candidatePos[1], 2),
  );

  // Normalize: distance 0 = 1.0, distance 10+ = 0.0 (tricubic falloff)
  return Math.max(0, 1.0 - distance / 10.0);
}

/**
 * Calculate path match score (source_ref prefix overlap)
 * Range: 0.0 (different tree) to 1.0 (identical path)
 */
export function calculatePathMatch(queryPath: string | null, candidatePath: string | null): number {
  if (!queryPath || !candidatePath) {
    return 0.0;
  }

  const queryParts = queryPath.split('/');
  const candidateParts = candidatePath.split('/');

  let matches = 0;
  for (let i = 0; i < Math.min(queryParts.length, candidateParts.length); i++) {
    if (queryParts[i] === candidateParts[i]) {
      matches++;
    } else {
      break; // Stop at first mismatch
    }
  }

  const maxDepth = Math.max(queryParts.length, candidateParts.length);
  return maxDepth === 0 ? 0.0 : matches / maxDepth;
}

/**
 * Calculate freshness score (newer = higher)
 * Range: 0.0 (>30 days old) to 1.0 (today)
 */
export function calculateFreshness(updatedAt: Date | null): number {
  if (!updatedAt) {
    return 0.5; // Unknown age = neutral
  }

  const ageMs = Date.now() - updatedAt.getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);

  // Linear decay: 0 days = 1.0, 30 days = 0.0, >30 = 0.0
  return Math.max(0, 1.0 - ageDays / 30.0);
}

/**
 * Rerank candidates using noun overlap + topology + authority
 *
 * @param candidates Array of candidates with scores + metadata
 * @param queryNouns Extracted nouns from query
 * @param weights Optional score weights (defaults to formula above)
 * @returns Reranked candidates sorted by final score
 */
export function rerank(
  candidates: Array<{
    feature_id: string;
    semantic_score: number;
    lexical_score: number;
    page_rank_score: number;
    topology_weight: number;
    som_cell: string | null;
    source_ref: string | null;
    noun_terms: string[];
    topology_summary: string | null;
    provenance_summary: string | null;
    updated_at: Date | null;
  }>,
  queryNouns: string[],
  weights?: {
    semantic: number;
    lexical: number;
    noun_overlap: number;
    page_rank: number;
    topology: number;
    path_match: number;
    freshness: number;
  },
): RankedCandidate[] {
  const defaultWeights = {
    semantic: 0.22,
    lexical: 0.18,
    noun_overlap: 0.15,
    page_rank: 0.15,
    topology: 0.12,
    path_match: 0.1,
    freshness: 0.08,
  };

  const w = { ...defaultWeights, ...weights };

  return candidates
    .map((c) => {
      const nounOverlap = calculateNounOverlap(queryNouns, c.noun_terms);
      const topologyProximity = calculateTopologyProximity(null, c.som_cell) * c.topology_weight;
      const pathMatch = calculatePathMatch(null, c.source_ref);
      const freshness = calculateFreshness(c.updated_at);

      const score =
        w.semantic * Math.min(1, c.semantic_score) +
        w.lexical * Math.min(1, c.lexical_score) +
        w.noun_overlap * nounOverlap +
        w.page_rank * Math.min(1, c.page_rank_score) +
        w.topology * topologyProximity +
        w.path_match * pathMatch +
        w.freshness * freshness;

      return {
        feature_id: c.feature_id,
        score,
        scores: {
          semantic: c.semantic_score,
          lexical: c.lexical_score,
          noun_overlap: nounOverlap,
          page_rank: c.page_rank_score,
          topology: topologyProximity,
          path_match: pathMatch,
          freshness,
        },
        noun_terms: c.noun_terms,
        topology_summary: c.topology_summary,
        provenance_summary: c.provenance_summary,
      };
    })
    .sort((a, b) => b.score - a.score);
}

/**
 * Build trace object for observability
 */
export function buildRerankerTrace(
  queryNouns: NounExtractionResult,
  candidates: RankedCandidate[],
  topK: number = 5,
) {
  return {
    noun_extraction: queryNouns,
    total_candidates: candidates.length,
    top_k: topK,
    top_results: candidates.slice(0, topK).map((c) => ({
      feature_id: c.feature_id,
      final_score: c.score.toFixed(4),
      component_scores: {
        semantic: c.scores.semantic.toFixed(4),
        lexical: c.scores.lexical.toFixed(4),
        noun_overlap: c.scores.noun_overlap.toFixed(4),
        page_rank: c.scores.page_rank.toFixed(4),
        topology: c.scores.topology.toFixed(4),
        path_match: c.scores.path_match.toFixed(4),
        freshness: c.scores.freshness.toFixed(4),
      },
      noun_terms: c.noun_terms,
    })),
    timestamp: new Date().toISOString(),
  };
}
