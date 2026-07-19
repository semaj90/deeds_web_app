/**
 * Candidate Scorer — Stage 3b: deterministic score assignment.
 *
 * Sits between RRF fusion (Stage 3) and post-process reranking (Stage 4b).
 * Produces a stable numeric `blendedScore` on every FusedCandidate without
 * reordering, suppressing, or boosting anything. All business rules live in
 * post-process-reranker.ts.
 *
 * Contract:
 *   - Input:  FusedCandidate[] (ordered by RRF fusion rank)
 *   - Output: ScoredCandidate[] (same order, same identities, + blendedScore)
 *   - Never mutates packetKey, sourceRef, or qdrantPointId.
 *   - Always deterministic for the same input.
 *   - If a learned model scorer is unavailable, the deterministic fallback runs.
 *
 * Model hook:
 *   Implement ModelScorer and pass it to `scoreCandidate()` options to swap in
 *   a learned ranker (XGBoost sidecar, colBERT, etc.) behind the same contract.
 */

import { z } from 'zod';
import { blendScores, DEFAULT_BLEND_WEIGHTS, type BlendWeights } from './runtime-reranker.js';

// ── Types ─────────────────────────────────────────────────────────────────────

/** Minimal view of a fused candidate that the scorer needs. */
export interface FusedCandidateInput {
  packetKey: string;
  sourceRef: string;
  fusionScore: number;     // RRF output [0,∞), higher = better
  rankBefore: number;      // 1-based rank from RRF
  score: number | null;    // raw per-lane score (null = disabled lane)
  scoreSource: string;

  // Optional per-signal scores already materialised on the candidate
  denseScore?: number;
  bm25Score?: number;
  astScore?: number;
  graphScore?: number;
  pagerankScore?: number;
  domainScore?: number;
  crossEncoderScore?: number;
  crossEncoderScoreNormalized?: number;

  // Preserved for identity — scorer must not change these
  qdrantPointId?: string;
  packetId?: string;
}

export interface ScoredCandidate extends FusedCandidateInput {
  /** Final deterministic blend score in [0,1]. */
  blendedScore: number;
  /** Which scorer produced this score. */
  scorerVersion: string;
  /** True iff the learned model scorer was used. */
  modelScored: boolean;
}

export const ScoredCandidateSchema = z.object({
  packetKey: z.string().min(1),
  sourceRef: z.string().min(1),
  fusionScore: z.number().finite(),
  rankBefore: z.number().int().min(1),
  blendedScore: z.number().min(0).max(1),
  scorerVersion: z.string().min(1),
  modelScored: z.boolean(),
});

/** Optional learned-model scorer hook. Return null to trigger fallback. */
export interface ModelScorer {
  /** Returns a score in [0, 1] for each candidate, or null on failure. */
  score(query: string, candidates: FusedCandidateInput[]): Promise<number[] | null>;
  readonly modelVersion: string;
}

export interface ScorerOptions {
  /** Override default blend weights (must sum to 1.0). */
  blendWeights?: BlendWeights;
  /** Optional learned-model scorer. Falls back to deterministic if null/absent. */
  modelScorer?: ModelScorer | null;
  /** Normalise fusionScore across the batch before blending. Default: true. */
  normaliseFusion?: boolean;
}

// ── Normalisation ─────────────────────────────────────────────────────────────

function normaliseFusionScores(candidates: FusedCandidateInput[]): Map<string, number> {
  const scores = candidates.map(c => c.fusionScore);
  const max = Math.max(...scores);
  const min = Math.min(...scores);
  const range = max - min;
  const result = new Map<string, number>();
  for (const c of candidates) {
    result.set(c.packetKey, range === 0 ? 0.5 : (c.fusionScore - min) / range);
  }
  return result;
}

// ── Deterministic blend ───────────────────────────────────────────────────────

function deterministicScore(
  candidate: FusedCandidateInput,
  normalisedFusion: number,
  weights: BlendWeights,
): number {
  // Build a RerankCandidate-compatible view so we can reuse blendScores()
  const rerankView = {
    packetKey: candidate.packetKey,
    sourceRef: candidate.sourceRef,
    content: '',
    retrievedRank: candidate.rankBefore,
    denseScore:             candidate.denseScore ?? (candidate.scoreSource === 'qdrant' ? normalisedFusion : undefined),
    bm25Score:              candidate.bm25Score ?? (candidate.scoreSource === 'postgres_trigram' ? normalisedFusion : undefined),
    astScore:               candidate.astScore ?? (candidate.scoreSource === 'ast_tree' ? normalisedFusion : undefined),
    graphScore:             candidate.graphScore,
    pagerankScore:          candidate.pagerankScore,
    domainScore:            candidate.domainScore,
    crossEncoderScore:      candidate.crossEncoderScore,
    crossEncoderScoreNormalized: candidate.crossEncoderScoreNormalized,
  };

  const blended = blendScores(rerankView, weights);

  // If no signal scores materialised, fall back to normalised fusion rank
  if (blended === 0 && normalisedFusion > 0) {
    // Invert rank: rank 1 → 1.0, rank N → ~0
    const rankScore = 1 / (1 + Math.log1p(candidate.rankBefore - 1));
    return Math.max(0, Math.min(1, rankScore * 0.7 + normalisedFusion * 0.3));
  }

  return blended;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Score all candidates and attach `blendedScore` + provenance fields.
 * Order is preserved — sorting is the reranker's job, not the scorer's.
 */
export async function scoreCandidates(
  query: string,
  candidates: FusedCandidateInput[],
  options: ScorerOptions = {},
): Promise<ScoredCandidate[]> {
  if (candidates.length === 0) return [];

  const weights = options.blendWeights ?? DEFAULT_BLEND_WEIGHTS;
  const shouldNorm = options.normaliseFusion !== false;

  const normFusion = shouldNorm
    ? normaliseFusionScores(candidates)
    : new Map(candidates.map(c => [c.packetKey, c.fusionScore]));

  // Attempt learned model scorer
  if (options.modelScorer) {
    try {
      const modelScores = await options.modelScorer.score(query, candidates);
      if (modelScores && modelScores.length === candidates.length) {
        return candidates.map((c, i) => ({
          ...c,
          blendedScore: Math.max(0, Math.min(1, modelScores[i])),
          scorerVersion: options.modelScorer!.modelVersion,
          modelScored: true,
        }));
      }
    } catch {
      // fall through to deterministic
    }
  }

  // Deterministic fallback
  return candidates.map(c => ({
    ...c,
    blendedScore: deterministicScore(c, normFusion.get(c.packetKey) ?? 0, weights),
    scorerVersion: 'deterministic-v1',
    modelScored: false,
  }));
}
