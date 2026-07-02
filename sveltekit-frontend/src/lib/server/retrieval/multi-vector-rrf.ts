/**
 * Multi-Vector RRF (Reciprocal Rank Fusion) Orchestrator
 *
 * Combines multiple ranking signals into a unified score:
 *   1. Qdrant named-vector ANN (content + summary vectors)
 *   2. Lexical search (rg/BM25 via PostgreSQL)
 *   3. Noun overlap (Jaccard similarity on extracted terms)
 *   4. PageRank authority (from Neo4j, cached in Postgres)
 *   5. SOM topology proximity (distance in self-organizing map)
 *   6. Payload tag filtering (semantic_tags from Qdrant payloads)
 *
 * RRF Formula:
 *   rrf_score = 1/(k + rank_1) + 1/(k + rank_2) + ... + 1/(k + rank_n)
 *   where k = 60 (dampening constant, prevents division by zero)
 *
 * Final blended score (after RRF normalization):
 *   final = 0.25·content_rrf + 0.20·summary_rrf + 0.20·lexical_rrf
 *         + 0.15·noun_rrf + 0.12·authority_rrf + 0.08·topology_rrf
 */

import type { Candidate, RankedCandidate } from './noun-reranker';

interface VectorSearchResult {
  id: string;
  score: number;
  rank: number;
}

interface LexicalResult {
  feature_id: string;
  bm25_score: number;
  rank: number;
}

interface ComponentScores {
  semantic: number;
  lexical: number;
  noun_overlap: number;
  pagerank: number;
  topology: number;
  freshness: number;
}

interface RRFResult {
  feature_id: string;
  content_rank: number | null;
  summary_rank: number | null;
  lexical_rank: number | null;
  noun_rank: number | null;
  authority_rank: number | null;
  topology_rank: number | null;
  component_scores: ComponentScores;
  rrf_score: number;
}

const K_DAMPENING = 60; // Standard RRF dampening constant

/**
 * Convert reciprocal rank score using formula: 1/(k + rank)
 */
function reciprocalRank(rank: number): number {
  if (rank === null || rank === undefined || rank < 0) {
    return 0;
  }
  return 1 / (K_DAMPENING + rank);
}

/**
 * Merge multiple ranked lists using RRF formula
 * Returns candidates with computed RRF scores
 */
export function mergeRRF(rankings: {
  content: VectorSearchResult[];
  summary: VectorSearchResult[];
  lexical: LexicalResult[];
  noun: Candidate[];
  authority: Candidate[];
  topology: Candidate[];
}): RRFResult[] {
  const candidates = new Map<string, RRFResult>();

  // Initialize all candidates from all rankings
  const allFeatureIds = new Set<string>();

  rankings.content.forEach((r) => allFeatureIds.add(r.id));
  rankings.summary.forEach((r) => allFeatureIds.add(r.id));
  rankings.lexical.forEach((r) => allFeatureIds.add(r.feature_id));
  rankings.noun.forEach((r) => allFeatureIds.add(r.feature_id));
  rankings.authority.forEach((r) => allFeatureIds.add(r.feature_id));
  rankings.topology.forEach((r) => allFeatureIds.add(r.feature_id));

  // Create result map
  for (const featureId of allFeatureIds) {
    candidates.set(featureId, {
      feature_id: featureId,
      content_rank: null,
      summary_rank: null,
      lexical_rank: null,
      noun_rank: null,
      authority_rank: null,
      topology_rank: null,
      rrf_score: 0
    });
  }

  // Populate ranks from each ranking list
  rankings.content.forEach((r) => {
    const cand = candidates.get(r.id)!;
    cand.content_rank = r.rank;
  });

  rankings.summary.forEach((r) => {
    const cand = candidates.get(r.id)!;
    cand.summary_rank = r.rank;
  });

  rankings.lexical.forEach((r) => {
    const cand = candidates.get(r.feature_id)!;
    cand.lexical_rank = r.rank;
  });

  rankings.noun.forEach((r) => {
    const cand = candidates.get(r.feature_id)!;
    cand.noun_rank = r.rank ?? null;
  });

  rankings.authority.forEach((r) => {
    const cand = candidates.get(r.feature_id)!;
    cand.authority_rank = r.rank ?? null;
  });

  rankings.topology.forEach((r) => {
    const cand = candidates.get(r.feature_id)!;
    cand.topology_rank = r.rank ?? null;
  });

  // Compute RRF scores with weighted components
  const weights = {
    content: 0.25,
    summary: 0.20,
    lexical: 0.20,
    noun: 0.15,
    authority: 0.12,
    topology: 0.08
  };

  // Normalize weights (sum = 1.0)
  const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0);
  const normalizedWeights = Object.entries(weights).reduce((acc, [k, v]) => {
    acc[k as keyof typeof weights] = v / totalWeight;
    return acc;
  }, {} as Record<keyof typeof weights, number>);

  for (const result of candidates.values()) {
    const contentRrf = reciprocalRank(result.content_rank);
    const summaryRrf = reciprocalRank(result.summary_rank);
    const lexicalRrf = reciprocalRank(result.lexical_rank);
    const nounRrf = reciprocalRank(result.noun_rank);
    const authorityRrf = reciprocalRank(result.authority_rank);
    const topologyRrf = reciprocalRank(result.topology_rank);

    // Store ALL component scores (not blended) for admin dashboard
    result.component_scores = {
      semantic: contentRrf,
      lexical: lexicalRrf,
      noun_overlap: nounRrf,
      pagerank: authorityRrf,
      topology: topologyRrf,
      freshness: 0 // Set from external freshness calculation
    };

    // Compute final RRF score as weighted sum
    result.rrf_score =
      normalizedWeights.content * contentRrf +
      normalizedWeights.summary * summaryRrf +
      normalizedWeights.lexical * lexicalRrf +
      normalizedWeights.noun * nounRrf +
      normalizedWeights.authority * authorityRrf +
      normalizedWeights.topology * topologyRrf;
  }

  // Sort by RRF score descending
  return Array.from(candidates.values())
    .sort((a, b) => b.rrf_score - a.rrf_score);
}

/**
 * Build Qdrant multi-vector search request
 * Searches both 'content' and 'summary' named vectors in parallel
 */
export function buildMultiVectorSearch(query: string[], queryVector: number[], topK: number = 20) {
  return {
    searches: [
      {
        vector: {
          name: 'content',
          vector: queryVector
        },
        limit: topK,
        with_payload: true,
        with_vector: false,
        score_threshold: 0.5
      },
      {
        vector: {
          name: 'summary',
          vector: queryVector
        },
        limit: topK,
        with_payload: true,
        with_vector: false,
        score_threshold: 0.4
      }
    ]
  };
}

/**
 * Build Qdrant payload filter for semantic tags
 * Filters by tags extracted from query and current candidate set
 */
export function buildPayloadFilter(semanticTags: string[], filterMode: 'should' | 'must' = 'should') {
  if (semanticTags.length === 0) {
    return null;
  }

  return {
    [filterMode]: semanticTags.map(tag => ({
      key: 'semantic_tags',
      match: { value: tag }
    }))
  };
}

/**
 * Build RRF ranking trace with explainable component scores
 * Admin dashboard uses this to show "Ranked highly because: noun overlap + same SOM + high PageRank"
 */
export function buildRRFTrace(
  rankings: { content: VectorSearchResult[]; summary: VectorSearchResult[]; lexical: LexicalResult[] },
  mergedResults: RRFResult[],
  topK: number
) {
  const topResults = mergedResults.slice(0, topK);

  return {
    model: 'multi-vector-rrf',
    input: {
      content_candidates: rankings.content.length,
      summary_candidates: rankings.summary.length,
      lexical_candidates: rankings.lexical.length,
      total_unique_candidates: mergedResults.length
    },
    output: {
      top_k: topK,
      results: topResults.map(r => ({
        feature_id: r.feature_id,
        final_score: parseFloat(r.rrf_score.toFixed(4)),
        component_scores: {
          semantic: parseFloat(r.component_scores.semantic.toFixed(4)),
          lexical: parseFloat(r.component_scores.lexical.toFixed(4)),
          noun_overlap: parseFloat(r.component_scores.noun_overlap.toFixed(4)),
          pagerank: parseFloat(r.component_scores.pagerank.toFixed(4)),
          topology: parseFloat(r.component_scores.topology.toFixed(4)),
          freshness: parseFloat(r.component_scores.freshness.toFixed(4))
        },
        explanation: buildScoreExplanation(r.component_scores),
        component_ranks: {
          content: r.content_rank,
          summary: r.summary_rank,
          lexical: r.lexical_rank,
          noun: r.noun_rank,
          authority: r.authority_rank,
          topology: r.topology_rank
        }
      }))
    },
    metadata: {
      k_dampening: K_DAMPENING,
      weights: {
        content: 0.25,
        summary: 0.20,
        lexical: 0.20,
        noun: 0.15,
        authority: 0.12,
        topology: 0.08
      }
    }
  };
}

/**
 * Generate human-readable explanation of score components
 * "Ranked highly because: noun overlap + same SOM cluster + high PageRank + same module"
 */
function buildScoreExplanation(scores: ComponentScores): string {
  const factors: string[] = [];

  if (scores.noun_overlap > 0.7) factors.push('noun overlap');
  if (scores.topology > 0.7) factors.push('same SOM cluster');
  if (scores.pagerank > 0.5) factors.push('high PageRank');
  if (scores.semantic > 0.7) factors.push('semantic similarity');
  if (scores.lexical > 0.7) factors.push('lexical match');
  if (scores.freshness > 0.6) factors.push('recent update');

  if (factors.length === 0) return 'Multiple weak signals';
  return `Ranked highly because: ${factors.join(' + ')}`;
}

/**
 * Example usage in retrieval pipeline:
 *
 * 1. Query preprocessing (extract nouns, normalize)
 * 2. Parallel searches:
 *    - Qdrant ANN on 'content' vector (top 20)
 *    - Qdrant ANN on 'summary' vector (top 20)
 *    - PostgreSQL BM25 lexical search (top 20)
 *    - Noun overlap ranking (all features, filtered to top 20)
 *    - PageRank authority lookup (top 20 from Postgres cache)
 *    - SOM topology proximity (top 20 from Postgres SOM grid)
 * 3. RRF merge with buildMultiVectorSearch() output
 * 4. Qdrant payload filter by semantic_tags (optional re-ranking)
 * 5. TurboVec prefilter (768→64 quantized, optional)
 * 6. Return top-K (typically 5-10) to user
 * 7. Optional: Gemma4 synthesis for top result
 */
