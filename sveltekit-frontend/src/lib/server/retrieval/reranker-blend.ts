/**
 * Reranker Blend — Multi-Signal Fusion
 *
 * Purpose: Combine three retrieval signals into a single ranking score
 * Signals:
 *   1. Qdrant Dense (0.35): Embedding similarity [0, 1]
 *   2. BM25 Lexical (0.35): Term frequency match [0, 1]
 *   3. RG Keyword (0.30): Regex pattern match [0, 1]
 *
 * Algorithm: Weighted blend, then sort descending
 * Output: Ranked candidates with source attribution
 */

import type { RgMatch } from './rg-search-bridge';
import type { BM25ScoreMap } from './bm25-score-extractor';

export interface RerankerCandidate {
  id: string; // packet_id or qdrant_point_id
  blendScore: number; // [0, 1]
  sources: {
    qdrant: boolean;
    bm25: boolean;
    rg: boolean;
  };
  signalScores: {
    qdrant?: number;
    bm25?: number;
    rg?: number;
  };
}

export interface QdrantResult {
  id: string;
  score: number; // cosine similarity [0, 1]
  payload?: Record<string, unknown>;
}

/**
 * Normalize score to [0, 1] range
 */
function normalizeScore(value: number, min: number = 0, max: number = 1): number {
  if (max <= min) return 0;
  return Math.max(0, Math.min(1, (value - min) / (max - min)));
}

/**
 * Blend three signals into final score
 */
export function rerankerBlend(
  qdrantResults: QdrantResult[] = [],
  bm25Scores: BM25ScoreMap = {},
  rgMatches: RgMatch[] = [],
  weights: { qdrant: number; bm25: number; rg: number } = {
    qdrant: 0.35,
    bm25: 0.35,
    rg: 0.3,
  }
): RerankerCandidate[] {
  // Build candidate map from all three signals
  const candidates = new Map<string, RerankerCandidate>();

  // Add Qdrant results
  for (const result of qdrantResults) {
    if (!candidates.has(result.id)) {
      candidates.set(result.id, {
        id: result.id,
        blendScore: 0,
        sources: { qdrant: false, bm25: false, rg: false },
        signalScores: {},
      });
    }
    const cand = candidates.get(result.id)!;
    cand.sources.qdrant = true;
    cand.signalScores.qdrant = normalizeScore(result.score, 0, 1);
  }

  // Add BM25 results
  for (const [packetId, score] of Object.entries(bm25Scores)) {
    if (score === 0) continue; // skip zero scores
    if (!candidates.has(packetId)) {
      candidates.set(packetId, {
        id: packetId,
        blendScore: 0,
        sources: { qdrant: false, bm25: false, rg: false },
        signalScores: {},
      });
    }
    const cand = candidates.get(packetId)!;
    cand.sources.bm25 = true;
    cand.signalScores.bm25 = normalizeScore(score, 0, 1);
  }

  // Add RG matches (build map from file → best confidence)
  const rgByFile = new Map<string, number>();
  for (const match of rgMatches) {
    const currentMax = rgByFile.get(match.file) || 0;
    rgByFile.set(match.file, Math.max(currentMax, match.confidence));
  }

  for (const [file, confidence] of rgByFile) {
    if (!candidates.has(file)) {
      candidates.set(file, {
        id: file,
        blendScore: 0,
        sources: { qdrant: false, bm25: false, rg: false },
        signalScores: {},
      });
    }
    const cand = candidates.get(file)!;
    cand.sources.rg = true;
    cand.signalScores.rg = normalizeScore(confidence, 0, 1);
  }

  // Compute blend score for each candidate
  for (const cand of candidates.values()) {
    const qdrantScore = cand.signalScores.qdrant ?? 0;
    const bm25Score = cand.signalScores.bm25 ?? 0;
    const rgScore = cand.signalScores.rg ?? 0;

    cand.blendScore =
      weights.qdrant * qdrantScore + weights.bm25 * bm25Score + weights.rg * rgScore;
  }

  // Sort by blend score descending
  return Array.from(candidates.values())
    .filter(c => c.blendScore > 0) // exclude zero scores
    .sort((a, b) => b.blendScore - a.blendScore);
}

/**
 * Reweight signals (for A/B testing tuning)
 */
export function reweightBlend(
  candidates: RerankerCandidate[],
  newWeights: { qdrant: number; bm25: number; rg: number }
): RerankerCandidate[] {
  // Normalize weights to sum to 1
  const total = newWeights.qdrant + newWeights.bm25 + newWeights.rg;
  const normalized = {
    qdrant: newWeights.qdrant / total,
    bm25: newWeights.bm25 / total,
    rg: newWeights.rg / total,
  };

  // Recompute blend scores
  const reweighted = candidates.map(c => ({
    ...c,
    blendScore:
      normalized.qdrant * (c.signalScores.qdrant ?? 0) +
      normalized.bm25 * (c.signalScores.bm25 ?? 0) +
      normalized.rg * (c.signalScores.rg ?? 0),
  }));

  return reweighted.sort((a, b) => b.blendScore - a.blendScore);
}
