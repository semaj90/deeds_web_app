/**
 * Post-Process Reranker — Stage 4b: business-rule adjustments after scoring.
 *
 * Sits after candidate-scorer.ts (Stage 3b) and before final slice.
 * Applies configurable, independently testable business constraints:
 *
 *   1. Freshness boost   — recently-updated packets score higher
 *   2. Dislike suppress  — explicit user dislikes are pushed to the back
 *   3. Diversity dedup   — near-duplicate sourceRefs are removed
 *   4. Anti-cluster      — prevent same directory/cluster monopolising top-K
 *
 * Contract:
 *   - Input:  ScoredCandidate[] in any order
 *   - Output: ScoredCandidate[] re-ordered by finalScore, with no identity mutation
 *   - Never changes packetKey, sourceRef, qdrantPointId, or blendedScore
 *   - finalScore is computed from blendedScore + adjustments; blendedScore is read-only
 *   - Deterministic: same config + same input → same output
 *
 * This stage does NOT call Qdrant, Postgres, Redis, or any network service.
 * All signals it needs must arrive on the candidate object or in the config.
 */

import type { ScoredCandidate } from './candidate-scorer.js';

// ── Config ────────────────────────────────────────────────────────────────────

export interface PostProcessConfig {
  /**
   * Freshness boost: multiply blendedScore by (1 + boost) for packets
   * updated within `windowMs`. Range: [0, 1]. Default: 0.1 (10% uplift).
   */
  freshnessBoost: number;
  /** Recency window in ms. Default: 7 days. */
  freshnessWindowMs: number;

  /**
   * Dislike penalty: multiply blendedScore by (1 - penalty) for explicitly
   * disliked packetKeys. Range: [0, 1]. Default: 0.9 (push to ~10% of score).
   */
  dislikePenalty: number;
  /** Set of packetKeys the user has explicitly disliked. */
  dislikedPacketKeys: ReadonlySet<string>;

  /**
   * Diversity dedup: if two candidates share the same sourceRef prefix up to
   * `dedupPrefixDepth` path segments, only the top-scoring one is kept.
   * 0 = disabled. Default: 2 (same dir).
   */
  dedupPrefixDepth: number;

  /**
   * Anti-cluster: at most this many candidates from the same `clusterKey`
   * are allowed in the final top-K. 0 = disabled. Default: 3.
   */
  maxPerCluster: number;
}

export const DEFAULT_POST_PROCESS_CONFIG: PostProcessConfig = {
  freshnessBoost: 0.10,
  freshnessWindowMs: 7 * 24 * 60 * 60 * 1000,
  dislikePenalty: 0.90,
  dislikedPacketKeys: new Set(),
  dedupPrefixDepth: 2,
  maxPerCluster: 3,
};

// ── Augmented output ──────────────────────────────────────────────────────────

export interface PostProcessedCandidate extends ScoredCandidate {
  /** Final score after all adjustments. Use this for final ordering. */
  finalScore: number;
  /** Which adjustments were applied (for tracing). */
  adjustments: PostProcessAdjustments;
  /** Final 1-based rank in the output list. */
  finalRank: number;
}

export interface PostProcessAdjustments {
  freshnessApplied: boolean;
  dislikeApplied: boolean;
  /** True if this candidate was kept but a near-duplicate was removed. */
  dedupWinner: boolean;
  /** True if this candidate was removed as a near-duplicate (not in output). */
  dedupRemoved: boolean;
  antiClusterApplied: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Extract the first N path segments of a sourceRef for prefix dedup. */
function sourcePrefix(sourceRef: string, depth: number): string {
  if (depth <= 0) return '';
  const parts = sourceRef.replace(/\\/g, '/').split('/');
  return parts.slice(0, depth).join('/');
}

/** Cluster key: fall back to sourceRef directory segment if no explicit cluster. */
function clusterKey(c: ScoredCandidate & { cluster?: string }): string {
  if (c.cluster) return c.cluster;
  const parts = (c.sourceRef ?? '').replace(/\\/g, '/').split('/');
  return parts.slice(0, 2).join('/');
}

function applyFreshnessBoost(
  score: number,
  updatedAt: Date | undefined,
  config: PostProcessConfig,
): { score: number; applied: boolean } {
  if (!updatedAt || config.freshnessBoost <= 0) return { score, applied: false };
  const age = Date.now() - updatedAt.getTime();
  if (age > config.freshnessWindowMs) return { score, applied: false };
  // Linear decay: full boost at age=0, no boost at age=window
  const decay = 1 - age / config.freshnessWindowMs;
  const boosted = Math.min(1, score * (1 + config.freshnessBoost * decay));
  return { score: boosted, applied: true };
}

function applyDislikePenalty(
  score: number,
  packetKey: string,
  config: PostProcessConfig,
): { score: number; applied: boolean } {
  if (!config.dislikedPacketKeys.has(packetKey)) return { score, applied: false };
  return { score: score * (1 - config.dislikePenalty), applied: true };
}

// ── Main function ─────────────────────────────────────────────────────────────

/**
 * Apply business-rule adjustments and return a reordered, ranked list.
 *
 * `updatedAtMap`: optional map of packetKey → last-updated Date for freshness.
 * `clusterMap`:   optional map of packetKey → cluster label for anti-cluster.
 */
export function postProcessCandidates(
  candidates: ScoredCandidate[],
  config: Partial<PostProcessConfig> = {},
  updatedAtMap: ReadonlyMap<string, Date> = new Map(),
  clusterMap: ReadonlyMap<string, string> = new Map(),
): PostProcessedCandidate[] {
  if (candidates.length === 0) return [];

  const cfg: PostProcessConfig = { ...DEFAULT_POST_PROCESS_CONFIG, ...config };

  // Step 1: compute adjusted scores + adjustment metadata (no reorder yet)
  type WithAdj = ScoredCandidate & {
    cluster?: string;
    finalScore: number;
    adjustments: PostProcessAdjustments;
  };

  const withAdj: WithAdj[] = candidates.map(c => {
    let score = c.blendedScore;
    const adj: PostProcessAdjustments = {
      freshnessApplied: false,
      dislikeApplied: false,
      dedupWinner: false,
      dedupRemoved: false,
      antiClusterApplied: false,
    };

    const fresh = applyFreshnessBoost(score, updatedAtMap.get(c.packetKey), cfg);
    score = fresh.score;
    adj.freshnessApplied = fresh.applied;

    const dislike = applyDislikePenalty(score, c.packetKey, cfg);
    score = dislike.score;
    adj.dislikeApplied = dislike.applied;

    return {
      ...c,
      cluster: clusterMap.get(c.packetKey),
      finalScore: score,
      adjustments: adj,
    };
  });

  // Step 2: sort by finalScore desc, packetKey asc for tie-breaking
  withAdj.sort((a, b) => b.finalScore - a.finalScore || a.packetKey.localeCompare(b.packetKey));

  // Step 3: dedup — remove lower-scoring candidates with the same source prefix
  const seenPrefixes = new Set<string>();
  const dedupFiltered: WithAdj[] = [];

  for (const c of withAdj) {
    if (cfg.dedupPrefixDepth > 0) {
      const prefix = sourcePrefix(c.sourceRef ?? '', cfg.dedupPrefixDepth);
      if (prefix && seenPrefixes.has(prefix)) {
        c.adjustments.dedupRemoved = true;
        // Don't add to output — but mark the winner
        continue;
      }
      if (prefix) {
        seenPrefixes.add(prefix);
        c.adjustments.dedupWinner = true;
      }
    }
    dedupFiltered.push(c);
  }

  // Step 4: anti-cluster — cap per-cluster count in the output
  const clusterCounts = new Map<string, number>();
  const final: WithAdj[] = [];

  for (const c of dedupFiltered) {
    if (cfg.maxPerCluster > 0) {
      const key = clusterKey(c);
      const count = clusterCounts.get(key) ?? 0;
      if (count >= cfg.maxPerCluster) {
        c.adjustments.antiClusterApplied = true;
        // Push to end of final list rather than removing
        final.push(c);
        continue;
      }
      clusterCounts.set(key, count + 1);
    }
    final.push(c);
  }

  // Step 5: assign finalRank (anti-cluster outliers end up at the bottom)
  const antiCluster = final.filter(c => c.adjustments.antiClusterApplied);
  const primary     = final.filter(c => !c.adjustments.antiClusterApplied);

  return [...primary, ...antiCluster].map((c, i) => ({
    ...c,
    finalRank: i + 1,
  }));
}
