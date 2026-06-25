/**
 * ACE Stage A0: Routing Matrix Integration
 *
 * Wires the 4x6 routing matrix into ACE Stage A0 pre-filtering.
 * Determines which retrieval lane (semantic/SOM/ontology/lineage) to use
 * based on query signals, then applies the corresponding Bifrost/Postgres filter.
 *
 * Architecture:
 *   Query Input (embedding + metadata)
 *     ↓
 *   Extract 6 signals (cosine, som_distance, feature_overlap, pagerank, recency, cache_hit)
 *     ↓
 *   Compute 4x6 matrix scores (4 lanes × 6 signals)
 *     ↓
 *   Select winning lane
 *     ↓
 *   Apply lane-specific filter (Postgres WHERE clause)
 *     ↓
 *   RTX rerank (if lane supports GPU)
 *     ↓
 *   Return top K candidates
 */

import { getRedis } from '../redis.js';

export interface QuerySignals {
  cosine_similarity: number;      // [0, 1] embedding match
  som_distance: number;           // [0, 40] Manhattan distance on 20x20 grid
  feature_overlap: number;        // [0, 1] ontology coverage
  pagerank: number;               // [0, 1] graph authority
  recency_score: number;          // [0, 1] temporal freshness
  cache_hit_confidence: number;   // [0, 1] bifrost cache confidence
}

export type RetrievalLane = 'semantic' | 'som' | 'ontology' | 'lineage';

export interface RoutingDecision {
  lane: RetrievalLane;
  score: number;
  signal_scores: Record<string, number>;
  recommended_batch_size: number;
  use_gpu_rerank: boolean;
  postgres_filter: string;
  confidence: number;
}

// 4x6 Weight Matrix — Simplified (guards handle hard decisions)
// Rows: [semantic, som, ontology, lineage]
// Cols: [cosine, som_distance, feature_overlap, pagerank, recency, cache_hit]
const ROUTING_WEIGHTS = [
  [0.55, 0.05, 0.10, 0.05, 0.05, 0.20],  // SEMANTIC — cosine + cache
  [0.15, 0.70, 0.10, 0.05, 0.05, 0.05],  // SOM — som_distance dominates
  [0.10, 0.05, 0.70, 0.05, 0.05, 0.05],  // ONTOLOGY — feature_overlap dominates
  [0.05, 0.05, 0.10, 0.40, 0.40, 0.00],  // LINEAGE — pagerank + recency (no cache)
];

const LANE_NAMES: RetrievalLane[] = ['semantic', 'som', 'ontology', 'lineage'];

/**
 * Normalize SOM distance using local Moore radius
 * Closer = higher; past radius 4 decays sharply
 */
function normalizeSomDistance(distance: number): number {
  if (distance <= 0) return 1.0;
  if (distance === 1) return 0.9;
  if (distance === 2) return 0.75;
  if (distance === 3) return 0.45;
  if (distance === 4) return 0.25;
  return 0.1; // Far = nearly useless for SOM lane
}

/**
 * Normalize query signals to [0, 1] range
 */
function normalizeSignals(signals: QuerySignals): number[] {
  return [
    signals.cosine_similarity,                    // already [0, 1]
    normalizeSomDistance(signals.som_distance),   // local Moore radius normalization
    signals.feature_overlap,                      // already [0, 1]
    signals.pagerank,                             // already [0, 1]
    signals.recency_score,                        // already [0, 1]
    signals.cache_hit_confidence,                 // already [0, 1]
  ];
}

/**
 * Apply domain-aware routing guards before matrix scoring
 * Guards capture ACE Stage A0 hard-truth signals that override weights
 */
function applyRoutingGuards(signals: QuerySignals): RetrievalLane | null {
  const cosine = signals.cosine_similarity ?? 0;
  const cacheHit = signals.cache_hit_confidence ?? 0;
  const somDistance = signals.som_distance ?? 999;
  const featureOverlap = signals.feature_overlap ?? 0;
  const pagerank = signals.pagerank ?? 0;
  const recency = signals.recency_score ?? 0;

  // Guard 1: Warm semantic cache → stay semantic unless ontology overwhelming
  if (cacheHit >= 0.85 && featureOverlap < 0.75) {
    return 'semantic';
  }

  // Guard 2: Strong natural-language semantic match → semantic
  // High cosine + distant from SOM cell + weak feature overlap = semantic intent
  if (cosine >= 0.82 && somDistance > 2 && featureOverlap < 0.65) {
    return 'semantic';
  }

  // Guard 3: SOM wins only when truly local (Moore radius 0-2)
  if (somDistance <= 2 && cosine < 0.78 && featureOverlap < 0.7) {
    return 'som';
  }

  // Guard 4: Ontology dominates when feature overlap is overwhelming
  if (featureOverlap >= 0.78) {
    return 'ontology';
  }

  // Guard 5: Lineage requires BOTH authority AND recency (not just cache alone)
  if (pagerank >= 0.75 && recency >= 0.75 && cacheHit < 0.8) {
    return 'lineage';
  }

  return null; // No guard triggered; fall through to weighted scoring
}

/**
 * Compute 4x6 routing scores for all lanes
 */
function computeRoutingScores(signals: QuerySignals): RoutingDecision[] {
  const normalized = normalizeSignals(signals);

  const scores = ROUTING_WEIGHTS.map((weights, laneIdx) => {
    // Dot product: weights · normalized signals
    const laneScore = weights.reduce((sum, w, colIdx) => sum + w * normalized[colIdx], 0);

    const signalScores = {
      cosine: weights[0] * normalized[0],
      som_distance: weights[1] * normalized[1],
      feature_overlap: weights[2] * normalized[2],
      pagerank: weights[3] * normalized[3],
      recency: weights[4] * normalized[4],
      cache_hit: weights[5] * normalized[5],
    };

    const lane = LANE_NAMES[laneIdx];

    return {
      lane,
      score: laneScore,
      signal_scores: signalScores,
      recommended_batch_size: getLaneBatchSize(lane, signals),
      use_gpu_rerank: shouldUseGpuRerank(lane),
      postgres_filter: getLanePostgresFilter(lane),
      confidence: laneScore,
    };
  });

  // Sort by score descending
  return scores.sort((a, b) => b.score - a.score);
}

/**
 * Lane-specific batch size recommendations
 */
function getLaneBatchSize(lane: RetrievalLane, signals: QuerySignals): number {
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

/**
 * Lane-specific GPU reranking decision
 */
function shouldUseGpuRerank(lane: RetrievalLane): boolean {
  return lane === 'semantic' || lane === 'som';
}

/**
 * Lane-specific Postgres WHERE filter
 */
function getLanePostgresFilter(lane: RetrievalLane): string {
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

/**
 * Select the best routing lane based on query signals
 * Guards take priority; if no guard matches, use weighted scoring
 */
export function selectRoutingLane(signals: QuerySignals): RoutingDecision {
  // Try guards first (domain-aware hard rules)
  const guardedLane = applyRoutingGuards(signals);
  if (guardedLane) {
    const scores = computeRoutingScores(signals);
    const decision = scores.find(s => s.lane === guardedLane) || scores[0];
    return {
      ...decision,
      confidence: 1.0, // Guarded decisions have highest confidence
    };
  }

  // Fall back to weighted matrix scoring
  const scores = computeRoutingScores(signals);
  return scores[0]; // Highest score wins
}

/**
 * Extract query signals from Qdrant search context
 *
 * Heuristic signal extraction based on query properties and cache state.
 * Production implementation would use actual Qdrant search results + Redis cache checks.
 */
export async function extractQuerySignals(
  query: string,
  _queryEmbedding: Float32Array,
  userId?: string
): Promise<QuerySignals> {
  try {
    const redis = getRedis();

    // Signal 1: cosine_similarity — based on query length (longer = more specific, higher match confidence)
    const queryLength = query.length;
    const cosine_similarity = Math.min(0.9, 0.5 + queryLength / 1000); // [0.5, 0.9] range

    // Signal 2: som_distance — based on cache warmth (check Redis for recent queries)
    let som_distance = 20; // Default: middle of grid
    try {
      const cachedSomKey = userId
        ? `ace:som:recent:${userId}`
        : 'ace:som:recent:global';
      const cachedSom = await redis.get(cachedSomKey).catch(() => null);
      if (cachedSom) {
        const [row, col] = cachedSom.split(':').map(Number);
        som_distance = Math.abs(row - 10) + Math.abs(col - 10); // Manhattan distance to center
      }
    } catch (e) {
      // Fallback to default
    }

    // Signal 3: feature_overlap — based on query keyword coverage
    const legalKeywords = ['evidence', 'case', 'witness', 'statute', 'liability', 'contract', 'patent'];
    const matchedKeywords = legalKeywords.filter(kw => query.toLowerCase().includes(kw));
    const feature_overlap = Math.min(1.0, matchedKeywords.length / 5); // [0, 1] range

    // Signal 4: pagerank — based on user authority (lookup from DB/cache)
    let pagerank = 0.5; // Default: neutral
    if (userId) {
      try {
        const userScoreKey = `user:pagerank:${userId}`;
        const userScore = await redis.get(userScoreKey).catch(() => null);
        pagerank = userScore ? parseFloat(userScore) : 0.5;
      } catch (e) {
        // Fallback
      }
    }

    // Signal 5: recency_score — based on query recency (current session is "fresh")
    const recency_score = 0.8; // High by default (current session = fresh)

    // Signal 6: cache_hit_confidence — check Redis for exact query match
    let cache_hit_confidence = 0.0;
    try {
      const queryHashKey = `ace:query:${hashQuery(query)}`;
      const cachedResult = await redis.get(queryHashKey).catch(() => null);
      cache_hit_confidence = cachedResult ? 1.0 : 0.0;
    } catch (e) {
      // Fallback
    }

    return {
      cosine_similarity,
      som_distance,
      feature_overlap,
      pagerank,
      recency_score,
      cache_hit_confidence,
    };
  } catch (e) {
    console.warn('[Stage A0] Signal extraction error, returning defaults:', (e as Error).message);

    // Return conservative defaults on error
    return {
      cosine_similarity: 0.5,
      som_distance: 20,
      feature_overlap: 0.3,
      pagerank: 0.5,
      recency_score: 0.5,
      cache_hit_confidence: 0.0,
    };
  }
}

/**
 * Simple hash function for query caching
 */
function hashQuery(query: string): string {
  let hash = 0;
  for (let i = 0; i < query.length; i++) {
    const char = query.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(16);
}

/**
 * Visualize routing scores for debugging
 */
export function visualizeRoutingMatrix(signals: QuerySignals): string {
  const scores = computeRoutingScores(signals);
  const header = `\n📈 ACE Stage A0 Routing Matrix\n`;
  const lines = scores.map((s) => {
    const score = (s.score * 100).toFixed(1);
    const bar = '█'.repeat(Math.floor(s.score * 40));
    return `  ${s.lane.padEnd(10)} ${bar} ${score}% (batch: ${s.recommended_batch_size}, gpu: ${s.use_gpu_rerank ? 'yes' : 'no'})`;
  });
  return header + lines.join('\n');
}

/**
 * Cache routing matrix config in Redis for observability
 */
export async function cacheRoutingMatrixConfig(): Promise<void> {
  try {
    const redis = getRedis();

    const config = {
      version: '0.1.0',
      lanes: LANE_NAMES,
      weights: ROUTING_WEIGHTS,
      feature_dimensions: [
        'cosine_similarity',
        'som_distance',
        'feature_overlap',
        'pagerank',
        'recency_score',
        'cache_hit_confidence',
      ],
      updated_at: new Date().toISOString(),
    };

    await redis.setex(
      'ace:routing:matrix:config',
      86400, // 24h TTL
      JSON.stringify(config)
    );
  } catch (e) {
    console.warn('[Stage A0] Failed to cache routing matrix config:', (e as Error).message);
  }
}
