/**
 * Canonical RuntimeReranker interface for unified cross-ranker
 * Owns the complete path: retrieve → blend signals → rank → persist
 *
 * This is NOT agentic. It performs pure reranking.
 * The agentic system (LangGraph/HMM) calls this during the RERANK state.
 */

import { z } from 'zod';

/**
 * Candidate before reranking
 * Carries independent signals from different lanes
 */
export const RerankCandidateSchema = z.object({
  packetKey: z.string().min(1),
  sourceRef: z.string().min(1),
  content: z.string().min(0),

  // Retrieved rank (before reranking)
  retrievedRank: z.number().int().min(1),

  // Independent signal scores (all normalized to [0, 1])
  denseScore: z.number().min(0).max(1).optional(),
  bm25Score: z.number().min(0).max(1).optional(),
  astScore: z.number().min(0).max(1).optional(),
  graphScore: z.number().min(0).max(1).optional(),
  pagerankScore: z.number().min(0).max(1).optional(),
  domainScore: z.number().min(0).max(1).optional(),
});

export type RerankCandidate = z.infer<typeof RerankCandidateSchema>;

/**
 * Candidate after reranking
 * Includes cross-encoder score, final rank, and provenance
 */
export const RerankedCandidateSchema = RerankCandidateSchema.extend({
  crossEncoderScore: z.number().min(0).max(1).optional(),
  blendedScore: z.number().min(0).max(1),
  rankAfter: z.number().int().min(1),
  modelVersion: z.string(),

  // Blend breakdown for debugging
  blendWeights: z.object({
    dense: z.number().min(0).max(1),
    bm25: z.number().min(0).max(1),
    ast: z.number().min(0).max(1),
    graph: z.number().min(0).max(1),
    pagerank: z.number().min(0).max(1),
    domain: z.number().min(0).max(1),
    crossEncoder: z.number().min(0).max(1),
  }),

  // Evidence for audit trail
  evidence: z.object({
    semanticLane: z.string().optional(),
    lexicalLane: z.string().optional(),
    topologyLane: z.string().optional(),
  }).optional(),
});

export type RerankedCandidate = z.infer<typeof RerankedCandidateSchema>;

/**
 * Runtime reranker interface
 * Single entry point for all reranking logic
 */
export interface RuntimeReranker {
  /**
   * Rerank candidates by blending independent signals
   *
   * Contract:
   * - Input candidates carry independent scores from Qdrant, BM25, AST, graph lanes
   * - Output is sorted by blendedScore DESC
   * - Persists rank_before/rank_after + model_version for audit trail
   * - Gracefully handles missing signals (treats as 0.5 neutral score)
   *
   * @param query - User search query
   * @param candidates - Candidates from retrieval (unsorted)
   * @returns Ranked candidates sorted by blendedScore DESC
   */
  rerank(query: string, candidates: RerankCandidate[]): Promise<RerankedCandidate[]>;

  /**
   * Get current model version (for audit trail)
   */
  modelVersion(): string;

  /**
   * Get blend weights (for transparency + tuning)
   */
  getBlendWeights(): Record<string, number>;

  /**
   * Set blend weights (for A/B testing)
   */
  setBlendWeights(weights: Record<string, number>): void;
}

/**
 * Normalized blend weights
 * All weights must sum to 1.0
 *
 * Current baseline:
 * - dense (Qdrant semantic): 0.40
 * - bm25 (lexical BM25): 0.30
 * - topology (PageRank + community): 0.20
 * - domain (classifier confidence): 0.10
 * - crossEncoder (optional): 0.0 initially
 *
 * Reserve 0.0 for crossEncoder initially.
 * As CrossEncoder is validated, increase it and decrease others.
 */
export const DEFAULT_BLEND_WEIGHTS = {
  dense: 0.4,
  bm25: 0.3,
  ast: 0.05,
  graph: 0.05,
  pagerank: 0.1,
  domain: 0.05,
  crossEncoder: 0.0, // Disabled initially
} as const;

// Verify weights sum to 1.0
const weightSum = Object.values(DEFAULT_BLEND_WEIGHTS).reduce((a, b) => a + b, 0);
if (Math.abs(weightSum - 1.0) > 0.0001) {
  throw new Error(`Blend weights must sum to 1.0, got ${weightSum}`);
}

/**
 * Utility: normalize score from any range to [0, 1]
 * Used when signals arrive in different scale ranges
 */
export function normalizeScore(value: number, min: number = 0, max: number = 1): number {
  if (max === min) return 0.5; // Neutral if no range
  return Math.max(0, Math.min(1, (value - min) / (max - min)));
}

/**
 * Utility: compute blended score from independent signals
 * Missing signals are treated as 0.5 (neutral)
 */
export function blendScores(
  candidate: RerankCandidate,
  weights: Record<string, number>,
): number {
  const scores = {
    dense: candidate.denseScore ?? 0.5,
    bm25: candidate.bm25Score ?? 0.5,
    ast: candidate.astScore ?? 0.5,
    graph: candidate.graphScore ?? 0.5,
    pagerank: candidate.pagerankScore ?? 0.5,
    domain: candidate.domainScore ?? 0.5,
    crossEncoder: 0.5, // Will be filled in by CrossEncoder ranker
  };

  let blended = 0;
  for (const [signal, weight] of Object.entries(weights)) {
    blended += (scores[signal as keyof typeof scores] ?? 0.5) * weight;
  }

  return Math.max(0, Math.min(1, blended)); // Clamp to [0, 1]
}

/**
 * Deterministic reranker (baseline, no ML)
 * Uses only signal blending without neural components
 */
export class DeterministicReranker implements RuntimeReranker {
  private blendWeights: Record<string, number>;
  private readonly version = 'deterministic-v1.0';

  constructor(weights: Record<string, number> = DEFAULT_BLEND_WEIGHTS) {
    this.blendWeights = { ...weights };
  }

  async rerank(query: string, candidates: RerankCandidate[]): Promise<RerankedCandidate[]> {
    if (!candidates.length) return [];

    // Blend all signals
    const ranked = candidates
      .map((candidate, index) => ({
        ...candidate,
        blendedScore: blendScores(candidate, this.blendWeights),
        rankAfter: 0, // Will be set after sorting
        modelVersion: this.version,
        blendWeights: this.blendWeights,
        evidence: {
          semanticLane: candidate.denseScore ? `dense=${candidate.denseScore.toFixed(2)}` : undefined,
          lexicalLane: candidate.bm25Score ? `bm25=${candidate.bm25Score.toFixed(2)}` : undefined,
          topologyLane: candidate.pagerankScore ? `pr=${candidate.pagerankScore.toFixed(2)}` : undefined,
        },
      }))
      .sort((a, b) => b.blendedScore - a.blendedScore)
      .map((candidate, index) => ({
        ...candidate,
        rankAfter: index + 1,
      }));

    return ranked;
  }

  modelVersion(): string {
    return this.version;
  }

  getBlendWeights(): Record<string, number> {
    return { ...this.blendWeights };
  }

  setBlendWeights(weights: Record<string, number>): void {
    this.blendWeights = { ...weights };
  }
}

/**
 * TODO: XGBoost reranker (after labels from Phase 2F.1 are stable)
 * TODO: CrossEncoder reranker (optional high-precision stage)
 * TODO: Hybrid reranker (deterministic + CrossEncoder with gating)
 */
