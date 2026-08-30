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

  /**
   * Semantic dedup: if two candidates' latent_256 vectors have cosine
   * similarity >= this threshold, only the top-scoring one is kept. Runs
   * after prefix dedup, among candidates that survived it -- catches
   * near-duplicate content that lives at different paths (prefix dedup
   * can't see that; this can, using
   * models/nested-semantic-autoencoder). Requires the caller to supply
   * `latent256Map`; candidates missing from that map are never removed by
   * this step (fail-open, not fail-closed -- absence is legal per that
   * model's own canonical_authority: false contract). 0 = disabled.
   * Default: 0 (opt-in; preserves exact prior behavior for existing callers).
   */
  latent256SimilarityThreshold: number;
}

export const DEFAULT_POST_PROCESS_CONFIG: PostProcessConfig = {
  freshnessBoost: 0.10,
  freshnessWindowMs: 7 * 24 * 60 * 60 * 1000,
  dislikePenalty: 0.90,
  dislikedPacketKeys: new Set(),
  dedupPrefixDepth: 2,
  maxPerCluster: 3,
  latent256SimilarityThreshold: 0,
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
  /** True if this candidate was removed by latent_256 semantic-similarity dedup. */
  semanticDedupRemoved: boolean;
}

/**
 * Auditable per-candidate decision record. Every input candidate produces
 * exactly one decision so INPUT === KEEP + DROP and no reduction is
 * unexplained.
 */
export interface PostProcessDecision {
  requestId: string;
  packetKey: string;
  inputRank: number;
  decision: 'KEEP' | 'DROP';
  reason:
    | 'TOP_K'
    | 'DUPLICATE_IDENTITY'
    | 'MISSING_CONTENT'
    | 'BELOW_THRESHOLD'
    | 'AUTH_SCOPE'
    | 'SOURCE_DIVERSITY'
    | 'INVALID_ENVELOPE'
    | 'POLICY_FILTER'
    | 'OTHER';
  detail?: string;
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

/** Cosine similarity between two equal-length vectors. Assumes non-zero norms
 * (latent_256 rows are always L2-normalized by the encoder -- see
 * models/nested-semantic-autoencoder/README.md). */
/** Boundary code must validate its own assumptions even when upstream promises them (equal
 * length, non-zero, normalized) -- don't rely solely on a doc comment elsewhere. */
function cosineSimilarity(a: readonly number[], b: readonly number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
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
  audit?: { requestId: string; decisions: PostProcessDecision[] },
  latent256Map: ReadonlyMap<string, readonly number[]> = new Map(),
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
      semanticDedupRemoved: false,
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

  // Step 3b: semantic dedup — remove lower-scoring candidates whose latent_256
  // vector is near-identical to an already-kept, higher-scoring candidate.
  // Catches near-duplicate content that lives at different paths, which
  // prefix dedup (Step 3) can't see. O(n^2) is fine at this stage's typical
  // scale (a few dozen candidates post-fusion, not the full corpus).
  const semanticFiltered: WithAdj[] = [];
  if (cfg.latent256SimilarityThreshold > 0 && latent256Map.size > 0) {
    const keptVectors: readonly number[][] = [];
    for (const c of dedupFiltered) {
      const vec = latent256Map.get(c.packetKey);
      if (!vec) {
        // Fail-open: no latent_256 for this candidate, can't compare, keep it.
        semanticFiltered.push(c);
        continue;
      }
      const isDuplicate = keptVectors.some(
        kept => cosineSimilarity(vec, kept) >= cfg.latent256SimilarityThreshold,
      );
      if (isDuplicate) {
        c.adjustments.semanticDedupRemoved = true;
        continue;
      }
      (keptVectors as number[][]).push(vec as number[]);
      semanticFiltered.push(c);
    }
  } else {
    semanticFiltered.push(...dedupFiltered);
  }

  // Step 4: anti-cluster — cap per-cluster count in the output
  const clusterCounts = new Map<string, number>();
  const final: WithAdj[] = [];

  for (const c of semanticFiltered) {
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

  // Audit: one decision per input candidate — INPUT === KEEP + DROP.
  if (audit) {
    const inputRankByKey = new Map(candidates.map((c, i) => [c.packetKey, i + 1]));
    for (const c of withAdj) {
      const inputRank = inputRankByKey.get(c.packetKey) ?? -1;
      if (c.adjustments.dedupRemoved) {
        audit.decisions.push({
          requestId: audit.requestId,
          packetKey: c.packetKey,
          inputRank,
          decision: 'DROP',
          reason: 'SOURCE_DIVERSITY',
          detail: `dedupPrefixDepth=${cfg.dedupPrefixDepth} prefix=${sourcePrefix(c.sourceRef ?? '', cfg.dedupPrefixDepth)}`,
        });
      } else if (c.adjustments.semanticDedupRemoved) {
        audit.decisions.push({
          requestId: audit.requestId,
          packetKey: c.packetKey,
          inputRank,
          decision: 'DROP',
          reason: 'SOURCE_DIVERSITY',
          detail: `latent256SimilarityThreshold=${cfg.latent256SimilarityThreshold}`,
        });
      } else {
        audit.decisions.push({
          requestId: audit.requestId,
          packetKey: c.packetKey,
          inputRank,
          decision: 'KEEP',
          reason: c.adjustments.antiClusterApplied ? 'POLICY_FILTER' : 'TOP_K',
          detail: c.adjustments.antiClusterApplied
            ? `anti-cluster demoted to tail (maxPerCluster=${cfg.maxPerCluster})`
            : undefined,
        });
      }
    }
  }

  return [...primary, ...antiCluster].map((c, i) => ({
    ...c,
    finalRank: i + 1,
  }));
}
