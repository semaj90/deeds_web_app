/**
 * Gradient-Boosted Reranker
 *
 * A lightweight additive model (gradient-boosted decision stumps, TypeScript-native)
 * that combines the feature columns from ranking-features.ts into a final score.
 * No external ML dependency — the model is a linear combination of features with
 * learned weights, updated via a bandit-style reward signal.
 *
 * Architecture fit:
 *   This sits between retrieval (Qdrant/FTS/graph) and ACE context assembly.
 *   It runs CPU-side, typically <1ms for batches ≤ 50. GPU math (cuBLAS/cuVS)
 *   belongs in the embedding / ANN stages, not here.
 *
 * Training loop:
 *   1. User feedback (thumbs up/down, dwell, copy) → RewardEvent
 *   2. reward-events.ts writes event to Redis + context_timeline
 *   3. updateBoostWeights() nudges the weight vector (bandit, lr=0.02)
 *   4. Persisted weights live in Redis key `ace:boost:weights` (7d TTL)
 *   5. grpo-exporter.ts flushes RankingFeatureRow[] → JSONL for GRPO fine-tune
 */

import { getRedis } from '$lib/server/redis.js';
import type { RankingFeatureRow } from './ranking-features.js';
import type { UnifiedRetrievalResult } from '$lib/server/types/retrieval.js';

// ── Weight vector ─────────────────────────────────────────────────────────────

export interface BoostWeights {
  cosine: number;
  bm25: number;
  topology: number;
  authority: number;
  recency: number;
  cache_hit: number;
  /** Penalty applied to hmm_error_risk — keep negative */
  hmm_error_penalty: number;
  rerank_score: number;
}

export const DEFAULT_BOOST_WEIGHTS: BoostWeights = {
  cosine:            0.35,
  bm25:              0.20,
  topology:          0.15,
  authority:         0.15,
  recency:           0.05,
  cache_hit:         0.05,
  hmm_error_penalty: -0.10,
  rerank_score:      0.30,
};

const REDIS_WEIGHTS_KEY = 'ace:boost:weights';
const REDIS_WEIGHTS_TTL = 7 * 24 * 3600; // 7 days

// ── Weight persistence ────────────────────────────────────────────────────────

export async function loadBoostWeights(): Promise<BoostWeights> {
  try {
    const r = getRedis();
    const raw = await r.get(REDIS_WEIGHTS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<BoostWeights>;
      return { ...DEFAULT_BOOST_WEIGHTS, ...parsed };
    }
  } catch { /* fall through */ }
  return { ...DEFAULT_BOOST_WEIGHTS };
}

export async function saveBoostWeights(weights: BoostWeights): Promise<void> {
  try {
    const r = getRedis();
    await r.setex(REDIS_WEIGHTS_KEY, REDIS_WEIGHTS_TTL, JSON.stringify(weights));
  } catch { /* non-fatal */ }
}

// ── Scoring ───────────────────────────────────────────────────────────────────

export function scoreRow(row: RankingFeatureRow, w: BoostWeights): number {
  return (
    row.cosine         * w.cosine +
    row.bm25           * w.bm25 +
    row.topology       * w.topology +
    row.authority      * w.authority +
    row.recency        * w.recency +
    row.cache_hit      * w.cache_hit +
    row.hmm_error_risk * w.hmm_error_penalty +
    row.rerank_score   * w.rerank_score
  );
}

export function scoreWithBoostedReranker(
  rows: RankingFeatureRow[],
  weights: BoostWeights = DEFAULT_BOOST_WEIGHTS
): number[] {
  return rows.map(r => scoreRow(r, weights));
}

// ── Re-ranking hits ───────────────────────────────────────────────────────────

export function rankWithBoostedReranker(
  hits: UnifiedRetrievalResult[],
  rows: RankingFeatureRow[],
  weights: BoostWeights = DEFAULT_BOOST_WEIGHTS
): Array<{ hit: UnifiedRetrievalResult; row: RankingFeatureRow; boostScore: number }> {
  if (hits.length !== rows.length) {
    throw new Error(`rankWithBoostedReranker: hits.length (${hits.length}) !== rows.length (${rows.length})`);
  }
  return hits
    .map((hit, i) => ({ hit, row: rows[i], boostScore: scoreRow(rows[i], weights) }))
    .sort((a, b) => b.boostScore - a.boostScore);
}

// ── Bandit weight update ──────────────────────────────────────────────────────

const LR_DEFAULT = 0.02;
const MAX_WEIGHT = 1.0;
const MIN_WEIGHT_PENALTY = -1.0;

/**
 * Online bandit update: nudge weights toward features of the selected chunk.
 * reward > 0 = positive signal (thumbs up, copy, dwell >8s)
 * reward < 0 = negative signal (thumbs down, immediate reformulate)
 * reward = 0 = neutral (no explicit signal)
 */
export function updateBoostWeights(
  weights: BoostWeights,
  selectedRow: RankingFeatureRow,
  reward: number,
  lr = LR_DEFAULT
): BoostWeights {
  function clamp(v: number, min = -MAX_WEIGHT, max = MAX_WEIGHT): number {
    return Math.max(min, Math.min(max, v));
  }

  return {
    cosine:            clamp(weights.cosine            + lr * reward * selectedRow.cosine),
    bm25:              clamp(weights.bm25              + lr * reward * selectedRow.bm25),
    topology:          clamp(weights.topology          + lr * reward * selectedRow.topology),
    authority:         clamp(weights.authority         + lr * reward * selectedRow.authority),
    recency:           clamp(weights.recency           + lr * reward * selectedRow.recency),
    cache_hit:         clamp(weights.cache_hit         + lr * reward * selectedRow.cache_hit),
    // Penalty term: only tighten penalty when a high-risk chunk was selected (negative signal)
    hmm_error_penalty: clamp(
      weights.hmm_error_penalty - lr * reward * selectedRow.hmm_error_risk,
      MIN_WEIGHT_PENALTY, 0
    ),
    rerank_score:      clamp(weights.rerank_score      + lr * reward * selectedRow.rerank_score),
  };
}

// ── Convenience: score + persist atomically ───────────────────────────────────

export async function applyAndPersistUpdate(
  selectedRow: RankingFeatureRow,
  reward: number,
  lr = LR_DEFAULT
): Promise<BoostWeights> {
  const current = await loadBoostWeights();
  const updated = updateBoostWeights(current, selectedRow, reward, lr);
  await saveBoostWeights(updated);
  return updated;
}