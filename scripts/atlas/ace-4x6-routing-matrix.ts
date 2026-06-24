/**
 * ACE 4x6 Routing Matrix — Hybrid Retrieval Lane Decision
 *
 * Architecture:
 *   Rows (4 lanes): semantic | SOM | ontology | lineage
 *   Cols (6 features): cosine | som_distance | feature_overlap | pagerank | recency | cache_hit
 *
 * Purpose:
 *   Route incoming queries to the optimal retrieval lane based on signal strength.
 *   Combines Postgres indexing (SOM grid) + RTX tensor ops (cosine) + Neo4j topology (lineage).
 *
 * Flow:
 *   1. Extract query signals (6 features)
 *   2. Compute 4x6 matrix scores
 *   3. Select lane with highest score
 *   4. Execute lane-specific retrieval (Postgres index narrowing + RTX rerank)
 */

export interface QuerySignals {
  cosine_similarity: number;      // [0, 1] embedding match
  som_distance: number;           // [0, 40] Manhattan distance on 20x20 grid
  feature_overlap: number;        // [0, 1] ontology coverage
  pagerank: number;               // [0, 1] graph authority
  recency_score: number;          // [0, 1] temporal freshness
  cache_hit_confidence: number;   // [0, 1] bifrost cache confidence
}

export interface RoutingScore {
  lane: 'semantic' | 'som' | 'ontology' | 'lineage';
  score: number;
  signal_scores: Record<string, number>;
  recommended_batch_size: number;
  use_gpu_rerank: boolean;
  postgres_filter: string;
}

// 4x6 Weight Matrix
// Rows: [semantic, som, ontology, lineage]
// Cols: [cosine, som_distance, feature_overlap, pagerank, recency, cache_hit]
const ROUTING_WEIGHTS = [
  [0.60, 0.10, 0.10, 0.10, 0.05, 0.05],  // SEMANTIC
  [0.10, 0.60, 0.15, 0.10, 0.03, 0.02],  // SOM
  [0.20, 0.15, 0.50, 0.10, 0.03, 0.02],  // ONTOLOGY
  [0.10, 0.10, 0.15, 0.30, 0.25, 0.10],  // LINEAGE
];

const LANE_NAMES = ['semantic', 'som', 'ontology', 'lineage'] as const;

function normalizeSignals(signals: QuerySignals): number[] {
  return [
    signals.cosine_similarity,
    1.0 - (signals.som_distance / 40.0),
    signals.feature_overlap,
    signals.pagerank,
    signals.recency_score,
    signals.cache_hit_confidence,
  ];
}

export function computeRoutingScores(signals: QuerySignals): RoutingScore[] {
  const normalized = normalizeSignals(signals);

  const scores = ROUTING_WEIGHTS.map((weights, laneIdx) => {
    const laneScore = weights.reduce((sum, w, colIdx) => sum + w * normalized[colIdx], 0);

    const signalScores = {
      cosine: weights[0] * normalized[0],
      som_distance: weights[1] * normalized[1],
      feature_overlap: weights[2] * normalized[2],
      pagerank: weights[3] * normalized[3],
      recency: weights[4] * normalized[4],
      cache_hit: weights[5] * normalized[5],
    };

    return {
      lane: LANE_NAMES[laneIdx],
      score: laneScore,
      signal_scores: signalScores,
      recommended_batch_size: getLaneBatchSize(LANE_NAMES[laneIdx], signals),
      use_gpu_rerank: shouldUseGpuRerank(LANE_NAMES[laneIdx]),
      postgres_filter: getLanePostgresFilter(LANE_NAMES[laneIdx]),
    };
  });

  return scores.sort((a, b) => b.score - a.score);
}

function getLaneBatchSize(lane: string, signals: QuerySignals): number {
  switch (lane) {
    case 'semantic':
      return Math.max(100, Math.floor(signals.cosine_similarity * 500));
    case 'som':
      return Math.max(50, Math.floor((1 - signals.som_distance / 40) * 200));
    case 'ontology':
      return Math.max(50, Math.floor(signals.feature_overlap * 300));
    case 'lineage':
      return Math.max(30, Math.floor(signals.recency_score * 150));
    default:
      return 100;
  }
}

function shouldUseGpuRerank(lane: string): boolean {
  return lane === 'semantic' || lane === 'som';
}

function getLanePostgresFilter(lane: string): string {
  switch (lane) {
    case 'semantic':
      return `WHERE embedding IS NOT NULL AND som_index IS NOT NULL`;
    case 'som':
      return `WHERE som_index IS NOT NULL AND som_row IS NOT NULL AND som_col IS NOT NULL`;
    case 'ontology':
      return `WHERE feature_id IS NOT NULL AND canonical = true`;
    case 'lineage':
      return `WHERE canonical = true ORDER BY created_at DESC`;
    default:
      return `WHERE som_index IS NOT NULL`;
  }
}

export function selectRoutingLane(signals: QuerySignals) {
  const scores = computeRoutingScores(signals);
  return scores[0];
}

export function visualizeRoutingMatrix(signals: QuerySignals): string {
  const scores = computeRoutingScores(signals);
  const header = `\n📈 ACE 4x6 Routing Matrix Scores\n`;
  const lines = scores.map((s) => {
    const score = (s.score * 100).toFixed(1);
    const bar = '█'.repeat(Math.floor(s.score * 40));
    return `  ${s.lane.padEnd(10)} ${bar} ${score}%`;
  });
  return header + lines.join('\n');
}
