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
 * Merge every lane's metadata for a single deduplicated hit, key by key, keeping the first
 * non-null/non-undefined value seen for each key across lanes (in their original order).
 * Unlike picking one lane's whole object, this can't let an earlier lane's all-null identity
 * fields shadow a later lane's real values for the same key.
 */
function mergeLaneMetadata(scores: RRFScore[]): Record<string, unknown> | undefined {
  let merged: Record<string, unknown> | undefined;
  for (const score of scores) {
    if (!score.metadata) continue;
    for (const [key, value] of Object.entries(score.metadata)) {
      if (!merged) merged = {};
      const existing = merged[key];
      if (existing === undefined || existing === null) {
        merged[key] = value;
      }
    }
  }
  return merged;
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
    const primaryHit = scores[0]; // Use identity (id/source) from first lane
    // Field-level metadata merge across every lane that reported this hit — NOT "first lane
    // with a non-empty object". A lane's metadata object can carry a full identity-field shape
    // (packet_key/source_ref/content_hash/tree_node_id/workspace_revision) with every value
    // null (common for lexical-only lanes never joined to a chunk record). Picking by object
    // presence alone let an earlier, all-null lane's object silently outrank a later lane's
    // real values for the same field — e.g. a postgres_trigram null tree_node_id beating a
    // qdrant_vector hit's real tree_node_id for the same deduplicated id. Merge key-by-key
    // instead, keeping the first non-null/non-undefined value seen for each key across lanes
    // in their original order.
    const metadata = mergeLaneMetadata(scores) ?? primaryHit.metadata;

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
