/**
 * Reciprocal Rank Fusion (RRF) Combiner
 *
 * Combines multiple ranked lists via: RRF(d) = Σ weight_i / (k + rank_i(d))
 * Typically beats vector-only retrieval by 15-30%.
 */

export type RetrievalLaneName =
  | 'postgres_trigram'
  | 'qdrant_vector'
  | 'turbovec_ann'
  | 'concept_overlap'
  | 'neo4j_graph'
  | 'redis_cache'
  | 'ast_symbol'
  | 'som_topology'
  | 'neo4j_community'
  | 'web_research'
  | 'dispatcher_signal'; // Session 117: Dispatcher topology signals

export interface ContextHit {
  id: string;
  source: RetrievalLaneName;
  score: number;
  text?: string;
  metadata?: Record<string, unknown>;
}

export interface RRFOptions {
  k?: number;
  weights?: Record<string, number>;
  deduplicateBy?: 'id' | 'text';
}

export interface RRFScore {
  hitId: string;
  laneName: RetrievalLaneName;
  laneRank: number;
  laneScore: number;
  rrfComponent: number;
  metadata?: Record<string, unknown>;
}

export interface RRFResult {
  id: string;
  combinedScore: number;
  source: RetrievalLaneName;
  sources: RetrievalLaneName[];
  text?: string;
  metadata?: Record<string, unknown>;
  breakdown: RRFScore[];
}

/**
 * Combine multiple ranked lists via Reciprocal Rank Fusion (RRF).
 *
 * Formula: RRF(d) = Σ_i (weight_i / (k + rank_i(d)))
 *
 * Example:
 *   BM25 rank = 3, weight = 1   → 1/(60+3) = 0.0159
 *   ANN rank = 12, weight = 1   → 1/(60+12) = 0.0137
 *   Concept rank = 5, weight = 1 → 1/(60+5) = 0.0152
 *   ────────────────────────────
 *   RRF score = 0.0448
 */
export function combineViaRRF(
  lanes: ContextHit[][],
  laneNames: RetrievalLaneName[],
  options: RRFOptions = {}
): RRFResult[] {
  const { k = 60, weights = {}, deduplicateBy = 'id' } = options;

  // Map: hitId → { laneRank, laneScore, laneName }[]
  const hitScores = new Map<string, RRFScore[]>();

  // Populate scores from each lane
  lanes.forEach((hits, laneIndex) => {
    const laneName = laneNames[laneIndex];
    const laneWeight = weights[laneName] ?? 1.0;

    hits.forEach((hit, rank) => {
      const hitKey = deduplicateBy === 'text' ? hit.text || hit.id : hit.id;
      const rrfComponent = laneWeight / (k + (rank + 1)); // 1-indexed

      if (!hitScores.has(hitKey)) {
        hitScores.set(hitKey, []);
      }

      hitScores.get(hitKey)!.push({
        hitId: hit.id,
        laneName,
        laneRank: rank + 1,
        laneScore: hit.score,
        rrfComponent,
        metadata: hit.metadata,
      });
    });
  });

  // Combine scores and sort
  const results: RRFResult[] = [];
  for (const [hitKey, scores] of hitScores) {
    const combinedScore = scores.reduce((sum, s) => sum + s.rrfComponent, 0);
    const primaryHit = scores[0]; // Use metadata from first lane
    const metadata = scores.find((score) => score.metadata && Object.keys(score.metadata).length > 0)?.metadata ?? primaryHit.metadata;

    results.push({
      id: primaryHit.hitId,
      combinedScore,
      source: primaryHit.laneName,
      sources: [...new Set(scores.map((s) => s.laneName))],
      text: hitKey,
      metadata,
      breakdown: scores,
    });
  }

  // Sort by combined score descending
  return results.sort((a, b) => b.combinedScore - a.combinedScore);
}
